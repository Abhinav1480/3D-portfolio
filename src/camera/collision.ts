import * as THREE from 'three';
import {
  CAMERA_SPHERE_RADIUS,
  CameraStopPose,
  MIN_SCREEN_DISTANCE,
  checkSphereColliderOverlap,
} from '../config/cameraStops';
import { PROP_POSITIONS, SCENE_COLLIDERS, SCREEN_SPECS, ScreenId } from '../config/layout';

export interface StopVisibilityReport {
  stopIndex: number;
  screenId: ScreenId;
  distanceToDisplay: number;
  targetOffsetY: number;
  raysPassed: number;
  totalRays: 5;
  obstructingObject: string | null;
  cameraRaisedBy: number;
  passed: boolean;
}

export interface PathCollisionReport {
  sampleCount: number;
  collisionsFound: number;
  minClearanceDistance: number;
  passed: boolean;
}

export const EXPLORE_TARGET_BOUNDS = {
  minX: -3.3,
  maxX: 4.3,
  minY: 0.2,
  maxY: 2.6,
  minZ: -2.8,
  maxZ: 2.8,
} as const;

// Module-scope reusable math primitives — zero allocations in wheel/pinch/update paths
const _raycaster = new THREE.Raycaster();
const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _corner = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _aabb = new THREE.Box3();
const _boxMin = new THREE.Vector3();
const _boxMax = new THREE.Vector3();
const _hitTmp = new THREE.Vector3();

/**
 * Requirement 3: Clamp controls.target into the room's box (x -3.3..4.3, y 0.2..2.6, z -2.8..2.8)
 * and shift the camera by the exact same clamping offset so the view does not jump.
 */
export function clampExploreTargetAndShiftCamera(
  target: THREE.Vector3,
  cameraPos: THREE.Vector3
): boolean {
  const clampedX = THREE.MathUtils.clamp(
    target.x,
    EXPLORE_TARGET_BOUNDS.minX,
    EXPLORE_TARGET_BOUNDS.maxX
  );
  const clampedY = THREE.MathUtils.clamp(
    target.y,
    EXPLORE_TARGET_BOUNDS.minY,
    EXPLORE_TARGET_BOUNDS.maxY
  );
  const clampedZ = THREE.MathUtils.clamp(
    target.z,
    EXPLORE_TARGET_BOUNDS.minZ,
    EXPLORE_TARGET_BOUNDS.maxZ
  );

  const dx = clampedX - target.x;
  const dy = clampedY - target.y;
  const dz = clampedZ - target.z;

  if (dx !== 0 || dy !== 0 || dz !== 0) {
    target.set(clampedX, clampedY, clampedZ);
    cameraPos.x += dx;
    cameraPos.y += dy;
    cameraPos.z += dz;
    return true;
  }
  return false;
}

/**
 * Requirement 7: Test the camera sphere (radius 0.15 m) against colliders tagged blocking;
 * if it penetrates, push the camera out along the collider's normal so the camera slides
 * along surfaces instead of jumping or clipping. Colliders tagged ignoreForCamera never block.
 */
export function resolveCameraCollision(
  cameraPos: THREE.Vector3,
  radius: number = CAMERA_SPHERE_RADIUS
): boolean {
  let pushed = false;

  // Run 3 iterations so multi-surface corner contacts (e.g., desk + back wall, shelf + back wall) resolve cleanly
  for (let iter = 0; iter < 3; iter++) {
    let iterPushed = false;

    for (let i = 0; i < SCENE_COLLIDERS.length; i++) {
      const c = SCENE_COLLIDERS[i];
      if (!c.blocking || c.ignoreForCamera) continue;

      if (c.type === 'box') {
        const hx = c.size[0] * 0.5;
        const hy = c.size[1] * 0.5;
        const hz = c.size[2] * 0.5;
        const minX = c.center[0] - hx;
        const maxX = c.center[0] + hx;
        const minY = c.center[1] - hy;
        const maxY = c.center[1] + hy;
        const minZ = c.center[2] - hz;
        const maxZ = c.center[2] + hz;

        const cx = Math.max(minX, Math.min(cameraPos.x, maxX));
        const cy = Math.max(minY, Math.min(cameraPos.y, maxY));
        const cz = Math.max(minZ, Math.min(cameraPos.z, maxZ));

        const dx = cameraPos.x - cx;
        const dy = cameraPos.y - cy;
        const dz = cameraPos.z - cz;
        const distSq = dx * dx + dy * dy + dz * dz;

        if (distSq >= radius * radius) continue;

        if (distSq > 1e-8) {
          // Sphere center is outside the box; push out along outward normal (cameraPos - closestPoint)
          const dist = Math.sqrt(distSq);
          const pen = radius - dist;
          cameraPos.x += (dx / dist) * pen;
          cameraPos.y += (dy / dist) * pen;
          cameraPos.z += (dz / dist) * pen;
          iterPushed = true;
          pushed = true;
        } else {
          // Sphere center is inside the box; push out along the room-facing / minimum-penetration face normal
          if (c.id === 'back-wall') {
            cameraPos.z = maxZ + radius;
          } else if (c.id === 'left-wall') {
            cameraPos.x = maxX + radius;
          } else if (c.id === 'plinth') {
            cameraPos.y = maxY + radius;
          } else {
            const penLeft = cameraPos.x - minX + radius;
            const penRight = maxX - cameraPos.x + radius;
            const penBottom = cameraPos.y - minY + radius;
            const penTop = maxY - cameraPos.y + radius;
            const penBack = cameraPos.z - minZ + radius;
            const penFront = maxZ - cameraPos.z + radius;

            let minPen = penFront;
            let axis: 'x-' | 'x+' | 'y-' | 'y+' | 'z-' | 'z+' = 'z+';

            if (penRight < minPen) {
              minPen = penRight;
              axis = 'x+';
            }
            if (penLeft < minPen) {
              minPen = penLeft;
              axis = 'x-';
            }
            if (penTop < minPen) {
              minPen = penTop;
              axis = 'y+';
            }
            if (penBottom < minPen && minY > 0.25) {
              minPen = penBottom;
              axis = 'y-';
            }
            if (penBack < minPen && minZ > -2.65) {
              axis = 'z-';
            }

            if (axis === 'z+') cameraPos.z = maxZ + radius;
            else if (axis === 'z-') cameraPos.z = minZ - radius;
            else if (axis === 'x+') cameraPos.x = maxX + radius;
            else if (axis === 'x-') cameraPos.x = minX - radius;
            else if (axis === 'y+') cameraPos.y = maxY + radius;
            else cameraPos.y = minY - radius;
          }
          iterPushed = true;
          pushed = true;
        }
      } else if (c.type === 'cylinder') {
        const r = c.size[0];
        const hy = c.size[1] * 0.5;
        const minY = c.center[1] - hy;
        const maxY = c.center[1] + hy;

        const dx = cameraPos.x - c.center[0];
        const dz = cameraPos.z - c.center[2];
        const distXZ = Math.hypot(dx, dz);
        const cy = Math.max(minY, Math.min(cameraPos.y, maxY));
        const dy = cameraPos.y - cy;

        const radialExcess = distXZ - r;
        if (radialExcess >= radius || Math.abs(dy) >= radius) continue;

        if (radialExcess > 0 && Math.abs(dy) > 0) {
          const cornerDist = Math.hypot(radialExcess, dy);
          if (cornerDist < radius && cornerDist > 1e-8) {
            const pen = radius - cornerDist;
            const nx = (dx / distXZ) * (radialExcess / cornerDist);
            const nz = (dz / distXZ) * (radialExcess / cornerDist);
            const ny = dy / cornerDist;
            cameraPos.x += nx * pen;
            cameraPos.y += ny * pen;
            cameraPos.z += nz * pen;
            iterPushed = true;
            pushed = true;
          }
        } else if (radialExcess > 0) {
          // Outside cylinder side wall, within height span
          const pen = radius - radialExcess;
          if (pen > 0 && distXZ > 1e-8) {
            cameraPos.x += (dx / distXZ) * pen;
            cameraPos.z += (dz / distXZ) * pen;
            iterPushed = true;
            pushed = true;
          }
        } else if (Math.abs(dy) > 0) {
          // Above or below cylinder cap
          const pen = radius - Math.abs(dy);
          if (pen > 0) {
            cameraPos.y += Math.sign(dy) * pen;
            iterPushed = true;
            pushed = true;
          }
        } else {
          // Center inside cylinder
          const penRadial = r + radius - distXZ;
          const penTop = maxY + radius - cameraPos.y;
          if (penTop < penRadial) {
            cameraPos.y = maxY + radius;
          } else if (distXZ > 1e-6) {
            cameraPos.x = c.center[0] + (dx / distXZ) * (r + radius);
            cameraPos.z = c.center[2] + (dz / distXZ) * (r + radius);
          } else {
            cameraPos.z = c.center[2] + r + radius;
          }
          iterPushed = true;
          pushed = true;
        }
      }
    }

    if (!iterPushed) break;
  }

  return pushed;
}

/**
 * Requirement 1, 8 & 13: Zero-allocation raycast against the scene's simplified colliders
 * (and optionally visible room meshes for double-click) to find the 3D hit point under the cursor.
 */
export function raycastExploreHitPoint(
  ray: THREE.Ray,
  scene: THREE.Scene | null,
  outHitPoint: THREE.Vector3,
  includeSceneMeshes = false
): boolean {
  let bestDist = Infinity;

  // 1. Test all simplified colliders (boxes & cylinders) in SCENE_COLLIDERS
  for (let i = 0; i < SCENE_COLLIDERS.length; i++) {
    const c = SCENE_COLLIDERS[i];
    const hx = c.type === 'box' ? c.size[0] * 0.5 : c.size[0];
    const hy = c.size[1] * 0.5;
    const hz = c.type === 'box' ? c.size[2] * 0.5 : c.size[2];

    _boxMin.set(c.center[0] - hx, c.center[1] - hy, c.center[2] - hz);
    _boxMax.set(c.center[0] + hx, c.center[1] + hy, c.center[2] + hz);
    _aabb.set(_boxMin, _boxMax);

    if (ray.intersectBox(_aabb, _hitTmp)) {
      const d = ray.origin.distanceTo(_hitTmp);
      if (d >= 0.05 && d < bestDist) {
        bestDist = d;
        outHitPoint.copy(_hitTmp);
      }
    }
  }

  // 2. Test the 3 wall certificate frames on the left wall
  for (let i = 0; i < PROP_POSITIONS.wallCertificates.length; i++) {
    const wc = PROP_POSITIONS.wallCertificates[i];
    _boxMin.set(wc[0] - 0.03, wc[1] - 0.32, wc[2] - 0.41);
    _boxMax.set(wc[0] + 0.03, wc[1] + 0.32, wc[2] + 0.41);
    _aabb.set(_boxMin, _boxMax);
    if (ray.intersectBox(_aabb, _hitTmp)) {
      const d = ray.origin.distanceTo(_hitTmp);
      if (d >= 0.05 && d < bestDist) {
        bestDist = d;
        outHitPoint.copy(_hitTmp);
      }
    }
  }

  // 3. Test the room wood floor surface (x: -3.5..4.5, y: -0.02..0.012, z: -3.0..3.0)
  _boxMin.set(-3.5, -0.02, -3.0);
  _boxMax.set(4.5, 0.012, 3.0);
  _aabb.set(_boxMin, _boxMax);
  if (ray.intersectBox(_aabb, _hitTmp)) {
    const d = ray.origin.distanceTo(_hitTmp);
    if (d >= 0.05 && d < bestDist) {
      bestDist = d;
      outHitPoint.copy(_hitTmp);
    }
  }

  // 4. On double-click, also refine against visible scene meshes (within plinth bounds so ContactShadows outside plinth is ignored)
  if (includeSceneMeshes && scene) {
    _raycaster.ray.copy(ray);
    _raycaster.near = 0.05;
    _raycaster.far = 40;
    const hits = _raycaster.intersectObjects(scene.children, true);
    for (let i = 0; i < hits.length; i++) {
      const h = hits[i];
      if (!h.object.visible) continue;
      const pt = h.point;
      // Ignore transparent ContactShadows plane hits outside the diorama plinth
      if (pt.x < -3.85 || pt.x > 4.85 || pt.z < -3.35 || pt.z > 3.35 || pt.y < -0.36) {
        continue;
      }
      if (h.distance >= 0.05 && h.distance < bestDist) {
        bestDist = h.distance;
        outHitPoint.copy(pt);
      }
      break;
    }
  }

  return Number.isFinite(bestDist);
}

/**
 * Sample 500 points along the camera path and verify camera sphere (r = max(0.15, near*2))
 * does not overlap any blocking collider.
 */
export function auditPathCollisions(
  samplePositionAt: (u: number, out: THREE.Vector3) => void,
  stops: readonly CameraStopPose[],
  samples = 500,
  cameraNear = 0.08
): PathCollisionReport {
  const effectiveRadius = Math.max(CAMERA_SPHERE_RADIUS, cameraNear * 2);
  const pt = new THREE.Vector3();
  let collisionsFound = 0;
  let minClearanceDistance = Infinity;

  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    samplePositionAt(u, pt);

    let activeScreenId: ScreenId | undefined;
    for (const s of stops) {
      if (s.screenId) {
        const d = pt.distanceTo(s.target);
        if (d < minClearanceDistance) minClearanceDistance = d;
        if (d < 0.85) {
          activeScreenId = s.screenId;
        }
      }
    }

    if (checkSphereColliderOverlap(pt, effectiveRadius, activeScreenId)) {
      collisionsFound++;
    }
  }

  return {
    sampleCount: samples + 1,
    collisionsFound,
    minClearanceDistance,
    passed: collisionsFound === 0 && minClearanceDistance >= MIN_SCREEN_DISTANCE,
  };
}

function evaluateSingleStopRays(
  stopPos: THREE.Vector3,
  screenId: ScreenId,
  testMeshes: THREE.Object3D[]
): { raysPassed: number; obstructingObject: string | null; dist: number } {
  const spec = SCREEN_SPECS.find((s) => s.id === screenId);
  if (!spec) {
    return { raysPassed: 0, obstructingObject: 'missing-spec', dist: 0 };
  }

  _euler.set(spec.rotation[0], spec.rotation[1], spec.rotation[2], 'YXZ');
  _quat.setFromEuler(_euler);
  _right.set(1, 0, 0).applyQuaternion(_quat);
  _up.set(0, 1, 0).applyQuaternion(_quat);

  const center = new THREE.Vector3(spec.center[0], spec.center[1], spec.center[2]);
  // Fix 2: Four corners inset by 5% (0.90 span = 5% inset on each edge)
  const halfW = spec.width * 0.5 * 0.9;
  const halfH = spec.height * 0.5 * 0.9;

  const targetPoints = [
    center.clone(),
    _corner.copy(center).addScaledVector(_right, -halfW).addScaledVector(_up, halfH).clone(),
    _corner.copy(center).addScaledVector(_right, halfW).addScaledVector(_up, halfH).clone(),
    _corner.copy(center).addScaledVector(_right, -halfW).addScaledVector(_up, -halfH).clone(),
    _corner.copy(center).addScaledVector(_right, halfW).addScaledVector(_up, -halfH).clone(),
  ];

  let raysPassed = 0;
  let obstructingObject: string | null = null;

  for (const tp of targetPoints) {
    _dir.subVectors(tp, stopPos).normalize();
    _raycaster.set(stopPos, _dir);
    _raycaster.near = 0.05;
    _raycaster.far = stopPos.distanceTo(tp) + 0.25;

    const hits = _raycaster.intersectObjects(testMeshes, false);
    if (hits.length > 0) {
      const firstHit = hits[0].object;
      let matched = false;
      let cur: THREE.Object3D | null = firstHit;
      while (cur) {
        if (cur.userData?.screenId === screenId) {
          matched = true;
          break;
        }
        cur = cur.parent;
      }
      if (matched) {
        raysPassed++;
      } else if (!obstructingObject) {
        obstructingObject = firstHit.name || firstHit.userData?.partName || 'unknown-mesh';
      }
    }
  }

  return {
    raysPassed,
    obstructingObject,
    dist: stopPos.distanceTo(center),
  };
}

/**
 * Fix 2: Cast 5 rays (center + 4 corners inset by 5%) from each stop camera to its screen.
 * Against the real meshes, the first hit must be the target display (or its own monitor group).
 * If a ray hits something else, raise the camera until clear and report the result.
 */
export function auditScreenStopVisibility(
  scene: THREE.Scene,
  stops: readonly CameraStopPose[],
  autoRaiseIfBlocked = true
): StopVisibilityReport[] {
  scene.updateMatrixWorld(true);
  const reports: StopVisibilityReport[] = [];

  const testMeshes: THREE.Object3D[] = [];
  scene.traverse((obj) => {
    if ((obj as THREE.Mesh).isMesh && obj.visible && !obj.userData?.ignoreVisibilityRay) {
      testMeshes.push(obj);
    }
  });

  for (const stop of stops) {
    if (!stop.screenId) continue;

    let raisedBy = 0;
    let evalResult = evaluateSingleStopRays(stop.position, stop.screenId, testMeshes);

    if (autoRaiseIfBlocked && evalResult.raysPassed < 5) {
      for (let step = 1; step <= 10; step++) {
        stop.position.y += 0.04;
        raisedBy += 0.04;
        evalResult = evaluateSingleStopRays(stop.position, stop.screenId, testMeshes);
        if (evalResult.raysPassed === 5) break;
      }
    }

    reports.push({
      stopIndex: stop.stopIndex,
      screenId: stop.screenId,
      distanceToDisplay: Number(stop.distanceToScreen.toFixed(3)),
      targetOffsetY: Number(stop.targetOffsetY.toFixed(4)),
      raysPassed: evalResult.raysPassed,
      totalRays: 5,
      obstructingObject: evalResult.obstructingObject,
      cameraRaisedBy: Number(raisedBy.toFixed(3)),
      passed: evalResult.raysPassed === 5 && evalResult.dist >= MIN_SCREEN_DISTANCE,
    });
  }

  return reports;
}
