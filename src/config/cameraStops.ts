import * as THREE from 'three';
import {
  SCREEN_SPECS,
  SCENE_COLLIDERS,
  TOUR_CAMERA_STOPS,
  TV_SPEC,
  ScreenId,
  ScreenSpec,
  TourStopId,
} from './layout';

export interface SafeAreaInsets {
  viewportW: number;
  viewportH: number;
  topReservedPx: number;
  bottomReservedPx: number;
  sideReservedPx: number;
}

export interface CameraStopPose {
  stopIndex: number;
  id: 'overview-start' | TourStopId | ScreenId;
  title: string;
  subtitle: string;
  locationName: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  screenId?: ScreenId;
  distanceToScreen: number;
  targetOffsetY: number;
  leftMarginPx: number;
}

export const DEFAULT_FOV_DEG = 45;
export const CAMERA_SPHERE_RADIUS = 0.15;
export const MIN_SCREEN_DISTANCE = 0.25;

export const DEFAULT_SAFE_AREA: SafeAreaInsets = {
  viewportW: 1920,
  viewportH: 1080,
  topReservedPx: 56 + 16, // top nav height + 16px
  bottomReservedPx: 68 + 16, // bottom HUD height + 16px
  sideReservedPx: 24, // 24px at each side
};

// Initial Overview camera position at 16:9 from TOUR_CAMERA_STOPS[0]
export const OVERVIEW_BASE_POS: [number, number, number] = TOUR_CAMERA_STOPS[0].position;
export const OVERVIEW_BASE_TARGET: [number, number, number] = TOUR_CAMERA_STOPS[0].target;

const _euler = new THREE.Euler();
const _quat = new THREE.Quaternion();
const _normal = new THREE.Vector3();
const _upVec = new THREE.Vector3();

export function getScreenWorldNormal(spec: ScreenSpec, out = new THREE.Vector3()): THREE.Vector3 {
  _euler.set(spec.rotation[0], spec.rotation[1], spec.rotation[2], 'YXZ');
  _quat.setFromEuler(_euler);
  return out.set(0, 0, 1).applyQuaternion(_quat).normalize();
}

export function getScreenWorldUp(spec: ScreenSpec, out = new THREE.Vector3()): THREE.Vector3 {
  _euler.set(spec.rotation[0], spec.rotation[1], spec.rotation[2], 'YXZ');
  _quat.setFromEuler(_euler);
  return out.set(0, 1, 0).applyQuaternion(_quat).normalize();
}

/**
 * Safe-Area Framing Distance Formula:
 * - In TOUR mode (fillScale = 0.65): frames each subject at ~62%–68% (inside 55%–75%) of the effective 3D canvas viewport height.
 * - In FOCUSED mode (fillScale = 0.82): provides a closer view (~80%–84% of usable safe area) when clicking/focusing a monitor or laptop.
 */
export function computeScreenFocusDistance(
  W: number,
  H: number,
  fovDeg: number = DEFAULT_FOV_DEG,
  aspect: number = 16 / 9,
  safeArea: SafeAreaInsets = DEFAULT_SAFE_AREA,
  customFillRatio?: number
): { d: number; targetOffsetY: number; leftMarginPx: number } {
  const fovRad = THREE.MathUtils.degToRad(fovDeg);
  const halfTan = Math.tan(fovRad / 2);

  const vw = Math.max(320, safeArea.viewportW);
  const vh = Math.max(320, safeArea.viewportH);
  const usableW = Math.max(160, vw - safeArea.sideReservedPx * 2);
  const usableH = Math.max(160, vh - safeArea.topReservedPx - safeArea.bottomReservedPx);

  const usableHRatio = usableH / vh;
  const usableWRatio = usableW / vw;

  const hTerm = H / (2 * halfTan) / usableHRatio;
  const wTerm = W / (2 * halfTan * aspect) / usableWRatio;

  const isPortraitScreen = H > W;
  const fillRatio = customFillRatio ?? (isPortraitScreen ? 0.66 : 0.66);
  const raw = isPortraitScreen
    ? Math.max(hTerm, wTerm) / fillRatio
    : aspect < 1.2
      ? wTerm / fillRatio
      : Math.max(hTerm, wTerm) / fillRatio;
  const d = Math.max(raw, MIN_SCREEN_DISTANCE + 0.05);

  // Shift look target along up vector so subject center projects to the center of the usable canvas rectangle:
  const targetOffsetY = ((safeArea.topReservedPx - safeArea.bottomReservedPx) / vh) * d * halfTan;

  // Compute horizontal projected width of subject in pixels and left margin outside subject
  const projectedNdcHalfW = W / (2 * d * halfTan * aspect);
  const leftMarginPx = Math.max(0, (1 - projectedNdcHalfW) * (vw / 2));

  return { d, targetOffsetY, leftMarginPx };
}

export function checkSphereColliderOverlap(
  pos: THREE.Vector3,
  radius: number,
  targetScreen?: ScreenId
): boolean {
  for (const c of SCENE_COLLIDERS) {
    if (c.ignoreForCamera) continue;
    if (targetScreen && c.targetScreen === targetScreen) continue;
    if (!c.blocking) continue;

    if (c.type === 'box') {
      const hx = c.size[0] / 2;
      const hy = c.size[1] / 2;
      const hz = c.size[2] / 2;
      const cx = Math.max(c.center[0] - hx, Math.min(pos.x, c.center[0] + hx));
      const cy = Math.max(c.center[1] - hy, Math.min(pos.y, c.center[1] + hy));
      const cz = Math.max(c.center[2] - hz, Math.min(pos.z, c.center[2] + hz));
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const dz = pos.z - cz;
      if (dx * dx + dy * dy + dz * dz < radius * radius) {
        return true;
      }
    } else if (c.type === 'cylinder') {
      const r = c.size[0];
      const hy = c.size[1] / 2;
      const dy = Math.max(0, Math.abs(pos.y - c.center[1]) - hy);
      const dx = pos.x - c.center[0];
      const dz = pos.z - c.center[2];
      const distXZ = Math.max(0, Math.hypot(dx, dz) - r);
      if (distXZ * distXZ + dy * dy < radius * radius) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Compute a closer focused reading pose (~82% safe-area fill) when a user clicks/focuses any of the 5 screens
 * ('about', 'skills', 'projects', 'experience', 'contact').
 */
export function computeFocusedScreenPose(
  screenId: ScreenId,
  aspect: number = 16 / 9,
  fovDeg: number = DEFAULT_FOV_DEG,
  safeArea: SafeAreaInsets = DEFAULT_SAFE_AREA
): { position: THREE.Vector3; target: THREE.Vector3; fov: number } {
  const spec = SCREEN_SPECS.find((s) => s.id === screenId) ?? SCREEN_SPECS[0];
  const isPortrait = spec.height > spec.width;
  const { d, targetOffsetY } = computeScreenFocusDistance(
    spec.width,
    spec.height,
    fovDeg,
    aspect,
    safeArea,
    isPortrait ? 0.72 : 0.84
  );

  const normal = getScreenWorldNormal(spec, _normal);
  const upVec = getScreenWorldUp(spec, _upVec);
  const screenCenter = new THREE.Vector3(spec.center[0], spec.center[1], spec.center[2]);
  const target = screenCenter.clone().addScaledVector(upVec, targetOffsetY);
  const pos = target.clone().addScaledVector(normal, d);

  let safetySteps = 0;
  while (checkSphereColliderOverlap(pos, 0.16, spec.id) && safetySteps < 20) {
    pos.y += 0.03;
    pos.addScaledVector(normal, 0.03);
    safetySteps++;
  }

  return { position: pos, target, fov: fovDeg };
}

/**
 * Derive all 6 tour camera stops (0..5) from TOUR_CAMERA_STOPS in src/config/layout.ts,
 * accounting for the effective 3D canvas viewport aspect ratio and safe-area insets:
 * 0: Overview (Room)
 * 1: About (Laptop)
 * 2: Projects (Monitor 2)
 * 3: Experience (Monitor 3)
 * 4: Contact (Phone on coffee table)
 * 5: Certificates (Floating certificate shelf & wall heading)
 */
export function computeCameraStops(
  aspect: number = 16 / 9,
  fovDeg: number = DEFAULT_FOV_DEG,
  safeArea: SafeAreaInsets = {
    ...DEFAULT_SAFE_AREA,
    viewportW: Math.round(1080 * aspect),
    viewportH: 1080,
  }
): CameraStopPose[] {
  const vh = Math.max(320, safeArea.viewportH);
  const usableH = Math.max(160, vh - safeArea.topReservedPx - safeArea.bottomReservedPx);
  const usableHRatio = usableH / vh;
  const heightFitScale = Math.max(1.0, 0.822 / Math.max(0.35, usableHRatio));
  const aspectFitScale = aspect < 16 / 9 ? (16 / 9) / Math.max(0.6, aspect) : 1.0;
  const overviewScale = Math.max(1.0, aspectFitScale, heightFitScale);

  const stops: CameraStopPose[] = [];

  for (const cfg of TOUR_CAMERA_STOPS) {
    const stopFov = cfg.fov || fovDeg;
    const fovRad = THREE.MathUtils.degToRad(stopFov);
    const halfTan = Math.tan(fovRad / 2);

    if (cfg.id === 'overview') {
      const baseTarget = new THREE.Vector3(cfg.target[0], cfg.target[1], cfg.target[2]);
      const baseOffset = new THREE.Vector3(
        cfg.position[0] - cfg.target[0],
        cfg.position[1] - cfg.target[1],
        cfg.position[2] - cfg.target[2]
      );
      const safeShiftY =
        ((safeArea.topReservedPx - safeArea.bottomReservedPx) / vh) *
        baseOffset.length() *
        overviewScale *
        halfTan *
        0.35;

      const overviewTarget = new THREE.Vector3(
        baseTarget.x,
        baseTarget.y + safeShiftY,
        baseTarget.z
      );
      const overviewPos = overviewTarget.clone().addScaledVector(baseOffset, overviewScale);

      stops.push({
        stopIndex: cfg.stopIndex,
        id: 'overview-start',
        title: cfg.label,
        subtitle: cfg.subtitle,
        locationName: cfg.locationName,
        position: overviewPos,
        target: overviewTarget,
        fov: stopFov,
        distanceToScreen: overviewPos.distanceTo(overviewTarget),
        targetOffsetY: Number(safeShiftY.toFixed(4)),
        leftMarginPx: safeArea.viewportW,
      });
      continue;
    }

    // For stops 1..5, compute framing from the configured world target, subjectSize, and subjectNormal,
    // scaling distance if the effective canvas aspect ratio is narrower than 16:9 so the subject stays in 55%–75% height.
    const baseTarget = new THREE.Vector3(cfg.target[0], cfg.target[1], cfg.target[2]);
    const basePos = new THREE.Vector3(cfg.position[0], cfg.position[1], cfg.position[2]);
    const baseDist = basePos.distanceTo(baseTarget);

    const { d: adaptiveDist, targetOffsetY, leftMarginPx } = computeScreenFocusDistance(
      cfg.subjectSize[0],
      cfg.subjectSize[1],
      stopFov,
      aspect,
      safeArea,
      0.65
    );

    const effectiveDist = Math.max(baseDist, adaptiveDist);
    const dir = basePos.clone().sub(baseTarget).normalize();
    const upVec = new THREE.Vector3(cfg.subjectUp[0], cfg.subjectUp[1], cfg.subjectUp[2]).normalize();

    const target = baseTarget.clone().addScaledVector(upVec, targetOffsetY);
    const pos = target.clone().addScaledVector(dir, effectiveDist);

    let safetySteps = 0;
    while (checkSphereColliderOverlap(pos, 0.16, cfg.screenId) && safetySteps < 20) {
      pos.y += 0.03;
      pos.addScaledVector(dir, 0.03);
      safetySteps++;
    }

    stops.push({
      stopIndex: cfg.stopIndex,
      id: cfg.id,
      title: cfg.label,
      subtitle: cfg.subtitle,
      locationName: cfg.locationName,
      position: pos,
      target,
      fov: stopFov,
      screenId: cfg.screenId,
      distanceToScreen: Number(effectiveDist.toFixed(3)),
      targetOffsetY: Number(targetOffsetY.toFixed(4)),
      leftMarginPx: Math.round(leftMarginPx),
    });
  }

  return stops;
}

/**
 * Part 2 Gate: Project the TV screen to the viewport at the Overview stop at 1920x1080
 * and compute the projected cap height in pixels of "ABHINAV" (must be >= 14 px).
 */
export function computeTvProjectedCapHeightPx(
  viewportW = 1920,
  viewportH = 1080,
  capHeightToScreenHeightRatio = 0.18
): { screenHeightPx: number; capHeightPx: number; passed: boolean } {
  const aspect = viewportW / Math.max(1, viewportH);
  const stops = computeCameraStops(aspect, DEFAULT_FOV_DEG, {
    ...DEFAULT_SAFE_AREA,
    viewportW,
    viewportH,
  });
  const overview = stops[0];

  const persp = new THREE.PerspectiveCamera(DEFAULT_FOV_DEG, aspect, 0.05, 80);
  persp.position.copy(overview.position);
  persp.up.set(0, 1, 0);
  persp.lookAt(overview.target);
  persp.updateMatrixWorld(true);
  persp.updateProjectionMatrix();

  const tvTop = new THREE.Vector3(
    TV_SPEC.center[0],
    TV_SPEC.center[1] + TV_SPEC.height * 0.5,
    TV_SPEC.center[2]
  ).project(persp);
  const tvBottom = new THREE.Vector3(
    TV_SPEC.center[0],
    TV_SPEC.center[1] - TV_SPEC.height * 0.5,
    TV_SPEC.center[2]
  ).project(persp);

  const screenHeightPx = Math.abs(tvTop.y - tvBottom.y) * 0.5 * viewportH;
  const capHeightPx = screenHeightPx * capHeightToScreenHeightRatio;

  return {
    screenHeightPx: Number(screenHeightPx.toFixed(2)),
    capHeightPx: Number(capHeightPx.toFixed(2)),
    passed: capHeightPx >= 14,
  };
}

/**
 * Synchronized per-segment curves between consecutive stops (0->1, 1->2, 2->3, 3->4, 4->5):
 * 0: Overview (Room)
 * 1: About (Laptop)
 * 2: Projects (Monitor 2)
 * 3: Experience & Roles (Monitor 3)
 * 4: Certificates (Floating certificate shelf & wall heading)
 * 5: Contact (Phone on coffee table)
 * Each segment k in [0..4] maps local segment parameter s in [0..1] to both position and target,
 * guaranteeing that at stop k (u = k / 5), position === stops[k].position and target === stops[k].target
 * with zero desynchronization or 11-second arc-length skew.
 */
export function buildSplineControlPoints(stops: CameraStopPose[]): {
  positionPoints: THREE.Vector3[];
  targetPoints: THREE.Vector3[];
  stopSplineParams: number[];
  sampleSynchronizedAtU: (u: number, outPos: THREE.Vector3, outTarget: THREE.Vector3) => void;
} {
  // Waypoint between Overview (stop 0) and About Laptop (stop 1)
  const wpEntryPos = new THREE.Vector3(-0.65, 1.85, 0.65);
  const wpEntryTarget = new THREE.Vector3(-1.95, 1.0, -2.1);

  // Waypoint between Experience Monitor 3 (stop 3) and Certificates Shelf (stop 4) along the back wall
  const wpCertApproachPos = new THREE.Vector3(0.55, 1.38, -1.68);
  const wpCertApproachTarget = new THREE.Vector3(0.60, 1.32, -2.70);

  // Waypoint between Certificates Shelf (stop 4) and Contact Phone on coffee table (stop 5)
  const wpPhoneApproachPos = new THREE.Vector3(0.25, 1.32, 0.20);
  const wpPhoneApproachTarget = new THREE.Vector3(-0.35, 0.95, -0.65);

  const segPosCurves: THREE.CatmullRomCurve3[] = [
    // Segment 0: Overview (0) -> About Laptop (1)
    new THREE.CatmullRomCurve3(
      [stops[0].position.clone(), wpEntryPos, stops[1].position.clone()],
      false,
      'centripetal'
    ),
    // Segment 1: About Laptop (1) -> Projects Monitor 2 (2)
    new THREE.CatmullRomCurve3(
      [stops[1].position.clone(), stops[2].position.clone()],
      false,
      'centripetal'
    ),
    // Segment 2: Projects Monitor 2 (2) -> Experience Monitor 3 (3)
    new THREE.CatmullRomCurve3(
      [stops[2].position.clone(), stops[3].position.clone()],
      false,
      'centripetal'
    ),
    // Segment 3: Experience Monitor 3 (3) -> Certificates Shelf (4)
    new THREE.CatmullRomCurve3(
      [stops[3].position.clone(), wpCertApproachPos, stops[4].position.clone()],
      false,
      'centripetal'
    ),
    // Segment 4: Certificates Shelf (4) -> Contact Phone (5)
    new THREE.CatmullRomCurve3(
      [stops[4].position.clone(), wpPhoneApproachPos, stops[5].position.clone()],
      false,
      'centripetal'
    ),
  ];

  const segTarCurves: THREE.CatmullRomCurve3[] = [
    new THREE.CatmullRomCurve3(
      [stops[0].target.clone(), wpEntryTarget, stops[1].target.clone()],
      false,
      'centripetal'
    ),
    new THREE.CatmullRomCurve3(
      [stops[1].target.clone(), stops[2].target.clone()],
      false,
      'centripetal'
    ),
    new THREE.CatmullRomCurve3(
      [stops[2].target.clone(), stops[3].target.clone()],
      false,
      'centripetal'
    ),
    new THREE.CatmullRomCurve3(
      [stops[3].target.clone(), wpCertApproachTarget, stops[4].target.clone()],
      false,
      'centripetal'
    ),
    new THREE.CatmullRomCurve3(
      [stops[4].target.clone(), wpPhoneApproachTarget, stops[5].target.clone()],
      false,
      'centripetal'
    ),
  ];

  segPosCurves.forEach((c) => {
    c.arcLengthDivisions = 400;
    c.updateArcLengths();
  });
  segTarCurves.forEach((c) => {
    c.arcLengthDivisions = 400;
    c.updateArcLengths();
  });

  // Equal spline parameter spacing across the 6 stops (0.0, 0.2, 0.4, 0.6, 0.8, 1.0)
  const stopSplineParams = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  const sampleSynchronizedAtU = (
    u: number,
    outPos: THREE.Vector3,
    outTarget: THREE.Vector3
  ): void => {
    const clampedU = THREE.MathUtils.clamp(u, 0, 1);
    const numSegs = segPosCurves.length; // 5
    const scaled = clampedU * numSegs;
    const segIdx = Math.min(numSegs - 1, Math.floor(scaled));
    const localU = THREE.MathUtils.clamp(scaled - segIdx, 0, 1);

    const pCurve = segPosCurves[segIdx];
    const tCurve = segTarCurves[segIdx];
    pCurve.getPointAt(localU, outPos);
    tCurve.getPointAt(localU, outTarget);
  };

  const positionPoints = [
    stops[0].position.clone(),
    wpEntryPos,
    stops[1].position.clone(),
    stops[2].position.clone(),
    stops[3].position.clone(),
    wpCertApproachPos,
    stops[4].position.clone(),
    wpPhoneApproachPos,
    stops[5].position.clone(),
  ];

  const targetPoints = [
    stops[0].target.clone(),
    wpEntryTarget,
    stops[1].target.clone(),
    stops[2].target.clone(),
    stops[3].target.clone(),
    wpCertApproachTarget,
    stops[4].target.clone(),
    wpPhoneApproachTarget,
    stops[5].target.clone(),
  ];

  return {
    positionPoints,
    targetPoints,
    stopSplineParams,
    sampleSynchronizedAtU,
  };
}
