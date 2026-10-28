import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import gsap from 'gsap';
import {
  CAMERA_SPHERE_RADIUS,
  CameraStopPose,
  DEFAULT_FOV_DEG,
  SafeAreaInsets,
  buildSplineControlPoints,
  computeCameraStops,
  computeFocusedScreenPose,
} from '../config/cameraStops';
import { ScreenId } from '../config/layout';
import { PacingCurve } from './pacing';
import {
  EXPLORE_TARGET_BOUNDS,
  auditPathCollisions,
  auditScreenStopVisibility,
  clampExploreTargetAndShiftCamera,
  raycastExploreHitPoint,
  resolveCameraCollision,
} from './collision';

export type PortfolioMode = 'TOUR' | 'EXPLORE' | 'FOCUSED';

export interface SavedCameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface CameraRigProps {
  scrollProgressRef: React.MutableRefObject<number>;
  modeRef: React.MutableRefObject<PortfolioMode>;
  focusedStopRef: React.MutableRefObject<number | null>;
  focusedScreenIdRef?: React.MutableRefObject<ScreenId | null>;
  isFlyingRef: React.MutableRefObject<boolean>;
  safeArea: SafeAreaInsets;
  reducedMotion: boolean;
  debugFreeCam: boolean;
  viewerOpen?: boolean;
  onStopProximityChange: (stopIdx: number, nearFactor: number) => void;
  onRequestExploreHandoff: () => void;
  onExploreFirstZoom?: () => void;
  onRegisterRigApi: (api: CameraRigApi) => void;
}

export interface CameraRigApi {
  getStops: () => CameraStopPose[];
  getStopScrollPosition: (stopIndex: number) => number;
  sampleAtProgress: (progress: number, outPos: THREE.Vector3, outTarget: THREE.Vector3) => void;
  getCurrentCameraPose: () => SavedCameraPose;
  getFocusedScreenPose: (screenId: ScreenId) => SavedCameraPose;
  flyToPose: (
    goalPose: SavedCameraPose,
    durationSec: number,
    onComplete?: () => void
  ) => void;
  cancelPoseTween: () => void;
  playIntroReveal: (durationSec?: number) => void;
  syncOrbitTargetToCurrent: (customPose?: SavedCameraPose) => void;
  resetExploreView: (durationSec?: number) => void;
  resetExploreOffsetsImmediate: () => void;
  zoomExploreByFactor: (factorDelta: number) => void;
  orbitExploreByAngles: (deltaAzimuthRad: number, deltaPolarRad: number) => void;
  simulateExploreCursorZoom: (clientX: number, clientY: number, stepFraction: number) => void;
  simulateExploreDoubleClick: (
    clientX: number,
    clientY: number,
    immediate?: boolean
  ) => boolean;
  getExploreState: () => {
    cameraPosition: [number, number, number];
    target: [number, number, number];
    distance: number;
    minDistance: number;
    maxDistance: number;
    minAzimuthDeg: number;
    maxAzimuthDeg: number;
    minPolarDeg: number;
    maxPolarDeg: number;
    zoomToCursor: boolean;
  };
  runDiagnostics: () => {
    collisionReport: ReturnType<typeof auditPathCollisions>;
    visibilityReports: ReturnType<typeof auditScreenStopVisibility>;
  };
}

const LUT_SAMPLES = 2000;
const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;

export const EXPLORE_MIN_DISTANCE = 0.9;
export const EXPLORE_MAX_DISTANCE = 14.0;
export const EXPLORE_CLOSE_DISTANCE_THRESHOLD = 3.0;
export const EXPLORE_DOUBLE_CLICK_DISTANCE = 1.6;
export const EXPLORE_MAX_ZOOM_STEP_FRACTION = 0.08;
export const EXPLORE_DAMPING_FACTOR = 0.08;
export const EXPLORE_ZOOM_SPEED = 0.8;
export const EXPLORE_PAN_SPEED = 0.8;

// Module-scope reusable math objects — zero allocations in wheel/pinch/update paths
const _posA = new THREE.Vector3();
const _posB = new THREE.Vector3();
const _tarA = new THREE.Vector3();
const _tarB = new THREE.Vector3();
const _curPos = new THREE.Vector3(3.385, 2.37, 8.84);
const _curTarget = new THREE.Vector3(0.35, 0.45, 0.0);
const _prevPos = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _right = new THREE.Vector3();
const _up = new THREE.Vector3();
const _parallaxOffset = new THREE.Vector3();

const _exploreRay = new THREE.Ray();
const _dollyDir = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _candCamPos = new THREE.Vector3();
const _candTarget = new THREE.Vector3();
const _viewOffset = new THREE.Vector3();
const _spherical = new THREE.Spherical();
const _tweenStartPos = new THREE.Vector3();
const _tweenStartTarget = new THREE.Vector3();
const _tweenGoalPos = new THREE.Vector3();
const _tweenGoalTarget = new THREE.Vector3();

function updateOrbitAngleLimits(
  controls: OrbitControlsImpl,
  distance: number,
  debugFreeCam: boolean
): void {
  if (debugFreeCam) {
    controls.minAzimuthAngle = -Infinity;
    controls.maxAzimuthAngle = Infinity;
    controls.minPolarAngle = 0.05;
    controls.maxPolarAngle = Math.PI - 0.05;
    return;
  }

  controls.minPolarAngle = 20 * DEG2RAD;
  controls.maxPolarAngle = 85 * DEG2RAD;

  if (distance < EXPLORE_CLOSE_DISTANCE_THRESHOLD) {
    controls.minAzimuthAngle = -10 * DEG2RAD;
    controls.maxAzimuthAngle = 100 * DEG2RAD;
  } else {
    controls.minAzimuthAngle = 0 * DEG2RAD;
    controls.maxAzimuthAngle = 90 * DEG2RAD;
  }
}

function normalizeWheelZoomStep(event: WheelEvent): number {
  if (event.deltaY === 0) return 0;
  const sign = -Math.sign(event.deltaY);
  const absDelta = Math.abs(event.deltaY);

  let stepMag: number;
  if (event.ctrlKey || event.metaKey) {
    stepMag = Math.min(0.045, absDelta * 0.004 * EXPLORE_ZOOM_SPEED);
  } else if (event.deltaMode === 1 || absDelta >= 40) {
    const normalizedNotch =
      event.deltaMode === 1 ? Math.min(2, absDelta / 3) : Math.min(2, absDelta / 100);
    stepMag = Math.max(0.045, normalizedNotch * 0.075 * EXPLORE_ZOOM_SPEED);
  } else if (event.deltaMode === 2) {
    stepMag = EXPLORE_MAX_ZOOM_STEP_FRACTION;
  } else {
    stepMag = absDelta * 0.0018 * EXPLORE_ZOOM_SPEED;
  }

  return THREE.MathUtils.clamp(
    sign * stepMag,
    -EXPLORE_MAX_ZOOM_STEP_FRACTION,
    EXPLORE_MAX_ZOOM_STEP_FRACTION
  );
}

export const CameraRig: React.FC<CameraRigProps> = ({
  scrollProgressRef,
  modeRef,
  focusedStopRef,
  focusedScreenIdRef,
  isFlyingRef,
  safeArea,
  reducedMotion,
  debugFreeCam,
  viewerOpen = false,
  onStopProximityChange,
  onExploreFirstZoom,
  onRegisterRigApi,
}) => {
  const { camera, size, scene, gl } = useThree();
  const orbitRef = useRef<OrbitControlsImpl | null>(null);
  const viewerOpenRef = useRef(viewerOpen);
  viewerOpenRef.current = viewerOpen;

  const onExploreFirstZoomRef = useRef(onExploreFirstZoom);
  onExploreFirstZoomRef.current = onExploreFirstZoom;

  const exploreTweenRef = useRef<gsap.core.Tween | null>(null);
  const isExploreTweeningRef = useRef(false);

  // Direct pose-to-pose tween state (for sub-views, focus, and smooth state restoration)
  const poseTweenRef = useRef<gsap.core.Tween | null>(null);
  const isPoseTweeningRef = useRef(false);
  const lockedFocusPoseRef = useRef<{
    pos: THREE.Vector3;
    target: THREE.Vector3;
    fov: number;
  } | null>(null);

  const aspect = size.width / Math.max(1, size.height);
  const isMobile = size.width <= 768;

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    if (persp.near !== 0.1 || persp.far !== 60) {
      persp.near = 0.1;
      persp.far = 60;
      persp.updateProjectionMatrix();
    }
  }, [camera]);

  const effectiveSafeArea = useMemo<SafeAreaInsets>(
    () => ({
      viewportW: size.width || safeArea.viewportW,
      viewportH: size.height || safeArea.viewportH,
      topReservedPx: safeArea.topReservedPx,
      bottomReservedPx: safeArea.bottomReservedPx,
      sideReservedPx: safeArea.sideReservedPx,
    }),
    [
      size.width,
      size.height,
      safeArea.viewportW,
      safeArea.viewportH,
      safeArea.topReservedPx,
      safeArea.bottomReservedPx,
      safeArea.sideReservedPx,
    ]
  );

  // Recompute stops & 2000-sample synchronized lookup tables on viewport resize and when HUD is minimized
  const { stops, posLUT, targetLUT, pacing } = useMemo(() => {
    const computedStops = computeCameraStops(aspect, DEFAULT_FOV_DEG, effectiveSafeArea);
    const { stopSplineParams, sampleSynchronizedAtU } = buildSplineControlPoints(computedStops);

    const rawPos = new Array<THREE.Vector3>(LUT_SAMPLES + 1);
    const rawTar = new Array<THREE.Vector3>(LUT_SAMPLES + 1);

    for (let i = 0; i <= LUT_SAMPLES; i++) {
      const u = i / LUT_SAMPLES;
      const p = new THREE.Vector3();
      const t = new THREE.Vector3();
      sampleSynchronizedAtU(u, p, t);
      rawPos[i] = p;
      rawTar[i] = t;
    }

    // Preserve exact stop positions at stop indices while lightly smoothing interior samples
    const stopSampleIndices = new Set(
      stopSplineParams.map((u) => Math.round(u * LUT_SAMPLES))
    );
    const pLut = new Array<THREE.Vector3>(LUT_SAMPLES + 1);
    const tLut = new Array<THREE.Vector3>(LUT_SAMPLES + 1);

    for (let i = 0; i <= LUT_SAMPLES; i++) {
      if (
        i < 2 ||
        i > LUT_SAMPLES - 2 ||
        stopSampleIndices.has(i) ||
        stopSampleIndices.has(i - 1) ||
        stopSampleIndices.has(i + 1)
      ) {
        pLut[i] = rawPos[i].clone();
        tLut[i] = rawTar[i].clone();
      } else {
        pLut[i] = new THREE.Vector3()
          .addScaledVector(rawPos[i - 2], 1 / 16)
          .addScaledVector(rawPos[i - 1], 4 / 16)
          .addScaledVector(rawPos[i], 6 / 16)
          .addScaledVector(rawPos[i + 1], 4 / 16)
          .addScaledVector(rawPos[i + 2], 1 / 16);
        tLut[i] = new THREE.Vector3()
          .addScaledVector(rawTar[i - 2], 1 / 16)
          .addScaledVector(rawTar[i - 1], 4 / 16)
          .addScaledVector(rawTar[i], 6 / 16)
          .addScaledVector(rawTar[i + 1], 4 / 16)
          .addScaledVector(rawTar[i + 2], 1 / 16);
      }
    }

    const pacingCurve = new PacingCurve(stopSplineParams);
    return {
      stops: computedStops,
      posLUT: pLut,
      targetLUT: tLut,
      pacing: pacingCurve,
    };
  }, [aspect, effectiveSafeArea]);

  const pointerRef = useRef({ x: 0, y: 0 });
  const dampedPointerRef = useRef({ x: 0, y: 0 });
  const dampedFovOffsetRef = useRef(0);
  const dampedRollRef = useRef(0);
  const prevProgressRef = useRef(0);
  const lastReportedStopRef = useRef(-1);
  const lastReportedNearTierRef = useRef(-1);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current.x = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      pointerRef.current.y = -(e.clientY / Math.max(1, window.innerHeight)) * 2 + 1;
    };
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    return () => window.removeEventListener('pointermove', onPointerMove);
  }, []);

  const killExploreTween = () => {
    if (exploreTweenRef.current) {
      exploreTweenRef.current.kill();
      exploreTweenRef.current = null;
    }
    isExploreTweeningRef.current = false;
  };

  const killPoseTween = () => {
    if (poseTweenRef.current) {
      poseTweenRef.current.kill();
      poseTweenRef.current = null;
    }
    isPoseTweeningRef.current = false;
  };

  const enforceExploreConstraints = (controls: OrbitControlsImpl) => {
    clampExploreTargetAndShiftCamera(controls.target, camera.position);
    const pushed = resolveCameraCollision(camera.position, CAMERA_SPHERE_RADIUS);
    const dist = camera.position.distanceTo(controls.target);
    updateOrbitAngleLimits(controls, dist, debugFreeCam);
    if (pushed) {
      camera.lookAt(controls.target);
    }
    _curPos.copy(camera.position);
    _curTarget.copy(controls.target);
  };

  const applyCursorZoomStep = (
    clientX: number,
    clientY: number,
    rawStepFraction: number
  ) => {
    const controls = orbitRef.current;
    if (!controls) return;

    const stepFraction = THREE.MathUtils.clamp(
      rawStepFraction,
      -EXPLORE_MAX_ZOOM_STEP_FRACTION,
      EXPLORE_MAX_ZOOM_STEP_FRACTION
    );
    if (Math.abs(stepFraction) < 1e-5) return;

    killExploreTween();
    killPoseTween();
    onExploreFirstZoomRef.current?.();

    const domEl = gl.domElement;
    const rect = domEl.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const ndcX = ((clientX - rect.left) / w) * 2 - 1;
    const ndcY = -((clientY - rect.top) / h) * 2 + 1;

    camera.updateMatrixWorld();
    _dollyDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
    _exploreRay.origin.copy(camera.position);
    _exploreRay.direction.copy(_dollyDir);

    _forward.subVectors(controls.target, camera.position);
    const curTargetDist = _forward.length();
    if (curTargetDist > 1e-5) {
      _forward.divideScalar(curTargetDist);
    } else {
      _forward.set(0, 0, -1);
    }

    const hitFound = raycastExploreHitPoint(_exploreRay, null, _hitPoint, false);
    const hitDist = hitFound ? camera.position.distanceTo(_hitPoint) : curTargetDist;

    let deltaC = 0;
    let newTargetDist = curTargetDist;

    if (stepFraction > 0) {
      if (hitDist <= EXPLORE_MIN_DISTANCE && curTargetDist <= EXPLORE_MIN_DISTANCE) {
        return;
      }
      const effectiveSurfaceDist = Math.max(EXPLORE_MIN_DISTANCE, hitDist);
      const nextHitDist = THREE.MathUtils.clamp(
        effectiveSurfaceDist * (1 - stepFraction),
        EXPLORE_MIN_DISTANCE,
        EXPLORE_MAX_DISTANCE
      );
      deltaC = effectiveSurfaceDist - nextHitDist;

      const denom = Math.max(1e-5, effectiveSurfaceDist - EXPLORE_MIN_DISTANCE);
      const remRatio = (nextHitDist - EXPLORE_MIN_DISTANCE) / denom;
      const blendedTargetDist =
        nextHitDist +
        remRatio * (1 - Math.min(1, stepFraction * 2.5)) * (curTargetDist - effectiveSurfaceDist);

      newTargetDist = THREE.MathUtils.clamp(
        blendedTargetDist,
        EXPLORE_MIN_DISTANCE,
        EXPLORE_MAX_DISTANCE
      );
    } else {
      const outFraction = -stepFraction;
      if (curTargetDist >= EXPLORE_MAX_DISTANCE) {
        return;
      }
      newTargetDist = THREE.MathUtils.clamp(
        curTargetDist * (1 + outFraction),
        EXPLORE_MIN_DISTANCE,
        EXPLORE_MAX_DISTANCE
      );
      deltaC = curTargetDist - newTargetDist;
    }

    _candCamPos.copy(camera.position).addScaledVector(_dollyDir, deltaC);
    _candTarget.copy(_candCamPos).addScaledVector(_forward, newTargetDist);

    clampExploreTargetAndShiftCamera(_candTarget, _candCamPos);
    resolveCameraCollision(_candCamPos, CAMERA_SPHERE_RADIUS);

    _viewOffset.subVectors(_candCamPos, _candTarget);
    const finalDist = _viewOffset.length();
    if (finalDist < EXPLORE_MIN_DISTANCE && finalDist > 1e-5) {
      _candCamPos
        .copy(_candTarget)
        .addScaledVector(_viewOffset, EXPLORE_MIN_DISTANCE / finalDist);
      resolveCameraCollision(_candCamPos, CAMERA_SPHERE_RADIUS);
    } else if (finalDist > EXPLORE_MAX_DISTANCE) {
      _candCamPos
        .copy(_candTarget)
        .addScaledVector(_viewOffset, EXPLORE_MAX_DISTANCE / finalDist);
    }

    camera.position.copy(_candCamPos);
    controls.target.copy(_candTarget);
    updateOrbitAngleLimits(controls, camera.position.distanceTo(controls.target), debugFreeCam);
    controls.update();
    enforceExploreConstraints(controls);
  };

  const handleExploreDoubleClick = (
    clientX: number,
    clientY: number,
    immediate = false
  ): boolean => {
    const controls = orbitRef.current;
    if (!controls) return false;
    if (modeRef.current !== 'EXPLORE' || isFlyingRef.current || viewerOpenRef.current) {
      return false;
    }

    const domEl = gl.domElement;
    const rect = domEl.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const ndcX = ((clientX - rect.left) / w) * 2 - 1;
    const ndcY = -((clientY - rect.top) / h) * 2 + 1;

    camera.updateMatrixWorld();
    _dollyDir.set(ndcX, ndcY, 0.5).unproject(camera).sub(camera.position).normalize();
    _exploreRay.origin.copy(camera.position);
    _exploreRay.direction.copy(_dollyDir);

    const hit = raycastExploreHitPoint(_exploreRay, scene, _hitPoint, true);
    if (!hit) {
      return false;
    }

    killExploreTween();
    killPoseTween();

    _tweenStartPos.copy(camera.position);
    _tweenStartTarget.copy(controls.target);

    _tweenGoalTarget.set(
      THREE.MathUtils.clamp(_hitPoint.x, EXPLORE_TARGET_BOUNDS.minX, EXPLORE_TARGET_BOUNDS.maxX),
      THREE.MathUtils.clamp(_hitPoint.y, EXPLORE_TARGET_BOUNDS.minY, EXPLORE_TARGET_BOUNDS.maxY),
      THREE.MathUtils.clamp(_hitPoint.z, EXPLORE_TARGET_BOUNDS.minZ, EXPLORE_TARGET_BOUNDS.maxZ)
    );

    _viewOffset.subVectors(camera.position, controls.target);
    if (_viewOffset.lengthSq() < 1e-6) {
      _viewOffset.set(0, 0.4, 1);
    }
    _spherical.setFromVector3(_viewOffset);
    _spherical.phi = THREE.MathUtils.clamp(_spherical.phi, 20 * DEG2RAD, 85 * DEG2RAD);
    _spherical.theta = THREE.MathUtils.clamp(_spherical.theta, -10 * DEG2RAD, 100 * DEG2RAD);
    _spherical.radius = THREE.MathUtils.clamp(
      EXPLORE_DOUBLE_CLICK_DISTANCE,
      EXPLORE_MIN_DISTANCE,
      EXPLORE_MAX_DISTANCE
    );

    _viewOffset.setFromSpherical(_spherical);
    _tweenGoalPos.copy(_tweenGoalTarget).add(_viewOffset);
    resolveCameraCollision(_tweenGoalPos, CAMERA_SPHERE_RADIUS);

    if (immediate || reducedMotion) {
      controls.target.copy(_tweenGoalTarget);
      camera.position.copy(_tweenGoalPos);
      updateOrbitAngleLimits(controls, camera.position.distanceTo(controls.target), debugFreeCam);
      controls.update();
      enforceExploreConstraints(controls);
      return true;
    }

    const proxy = { t: 0 };
    isExploreTweeningRef.current = true;
    exploreTweenRef.current = gsap.to(proxy, {
      t: 1,
      duration: 0.8,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.lerpVectors(_tweenStartPos, _tweenGoalPos, proxy.t);
        controls.target.lerpVectors(_tweenStartTarget, _tweenGoalTarget, proxy.t);
        clampExploreTargetAndShiftCamera(controls.target, camera.position);
        resolveCameraCollision(camera.position, CAMERA_SPHERE_RADIUS);
        updateOrbitAngleLimits(
          controls,
          camera.position.distanceTo(controls.target),
          debugFreeCam
        );
        controls.update();
        _curPos.copy(camera.position);
        _curTarget.copy(controls.target);
      },
      onComplete: () => {
        isExploreTweeningRef.current = false;
        exploreTweenRef.current = null;
        enforceExploreConstraints(controls);
      },
    });

    return true;
  };

  const resetExploreView = (durationSec = 1.0) => {
    const controls = orbitRef.current;
    if (!controls) return;
    const overviewStop = stops[0];
    if (!overviewStop) return;

    killExploreTween();
    killPoseTween();

    _tweenStartPos.copy(camera.position);
    _tweenStartTarget.copy(controls.target);
    _tweenGoalPos.copy(overviewStop.position);
    _tweenGoalTarget.copy(overviewStop.target);

    if (durationSec <= 0 || reducedMotion) {
      controls.target.copy(_tweenGoalTarget);
      camera.position.copy(_tweenGoalPos);
      updateOrbitAngleLimits(controls, camera.position.distanceTo(controls.target), debugFreeCam);
      controls.update();
      enforceExploreConstraints(controls);
      return;
    }

    const proxy = { t: 0 };
    isExploreTweeningRef.current = true;
    exploreTweenRef.current = gsap.to(proxy, {
      t: 1,
      duration: durationSec,
      ease: 'power3.inOut',
      onUpdate: () => {
        camera.position.lerpVectors(_tweenStartPos, _tweenGoalPos, proxy.t);
        controls.target.lerpVectors(_tweenStartTarget, _tweenGoalTarget, proxy.t);
        updateOrbitAngleLimits(
          controls,
          camera.position.distanceTo(controls.target),
          debugFreeCam
        );
        controls.update();
        _curPos.copy(camera.position);
        _curTarget.copy(controls.target);
      },
      onComplete: () => {
        isExploreTweeningRef.current = false;
        exploreTweenRef.current = null;
        enforceExploreConstraints(controls);
      },
    });
  };

  useEffect(() => {
    const domEl = gl.domElement;
    domEl.style.touchAction = 'none';

    if (orbitRef.current) {
      orbitRef.current.zoomToCursor = true;
    }

    const onWheel = (e: WheelEvent) => {
      if (modeRef.current !== 'EXPLORE' || isFlyingRef.current || viewerOpenRef.current) {
        return;
      }
      if (e.target !== domEl) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const step = normalizeWheelZoomStep(e);
      if (step !== 0) {
        applyCursorZoomStep(e.clientX, e.clientY, step);
      }
    };

    const onDblClick = (e: MouseEvent) => {
      if (modeRef.current !== 'EXPLORE' || isFlyingRef.current || viewerOpenRef.current) {
        return;
      }
      if (e.target !== domEl) return;
      e.preventDefault();
      handleExploreDoubleClick(e.clientX, e.clientY, false);
    };

    let prevPinchDist = 0;
    let lastTapTime = 0;
    let lastTapX = 0;
    let lastTapY = 0;
    let touchDownX = 0;
    let touchDownY = 0;
    let touchMoved = false;

    const onTouchStart = (e: TouchEvent) => {
      if (modeRef.current !== 'EXPLORE' || isFlyingRef.current || viewerOpenRef.current) {
        return;
      }
      if (e.target !== domEl) return;

      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        prevPinchDist = Math.hypot(dx, dy);
        touchMoved = true;
      } else if (e.touches.length === 1) {
        touchDownX = e.touches[0].clientX;
        touchDownY = e.touches[0].clientY;
        touchMoved = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (modeRef.current !== 'EXPLORE' || isFlyingRef.current || viewerOpenRef.current) {
        return;
      }
      if (e.target !== domEl) return;

      if (e.touches.length === 2) {
        const t0 = e.touches[0];
        const t1 = e.touches[1];
        const dx = t0.clientX - t1.clientX;
        const dy = t0.clientY - t1.clientY;
        const dist = Math.hypot(dx, dy);
        const midX = (t0.clientX + t1.clientX) * 0.5;
        const midY = (t0.clientY + t1.clientY) * 0.5;

        if (prevPinchDist > 12 && dist > 12) {
          const ratio = (dist - prevPinchDist) / prevPinchDist;
          const clampedStep = THREE.MathUtils.clamp(
            ratio * EXPLORE_ZOOM_SPEED,
            -EXPLORE_MAX_ZOOM_STEP_FRACTION,
            EXPLORE_MAX_ZOOM_STEP_FRACTION
          );
          if (Math.abs(clampedStep) > 0.001) {
            applyCursorZoomStep(midX, midY, clampedStep);
          }
        }
        prevPinchDist = dist;
        touchMoved = true;
      } else if (e.touches.length === 1) {
        const moveDist = Math.hypot(
          e.touches[0].clientX - touchDownX,
          e.touches[0].clientY - touchDownY
        );
        if (moveDist > 6) {
          touchMoved = true;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) {
        prevPinchDist = 0;
      }
      if (modeRef.current !== 'EXPLORE' || isFlyingRef.current || viewerOpenRef.current) {
        return;
      }
      if (e.target !== domEl) return;

      if (e.touches.length === 0 && e.changedTouches.length === 1 && !touchMoved) {
        const now = performance.now();
        const cx = e.changedTouches[0].clientX;
        const cy = e.changedTouches[0].clientY;
        if (now - lastTapTime < 300 && Math.hypot(cx - lastTapX, cy - lastTapY) < 24) {
          lastTapTime = 0;
          handleExploreDoubleClick(cx, cy, false);
        } else {
          lastTapTime = now;
          lastTapX = cx;
          lastTapY = cy;
        }
      }
    };

    domEl.addEventListener('wheel', onWheel, { passive: false, capture: true });
    domEl.addEventListener('dblclick', onDblClick);
    domEl.addEventListener('touchstart', onTouchStart, { passive: true });
    domEl.addEventListener('touchmove', onTouchMove, { passive: true });
    domEl.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      domEl.removeEventListener('wheel', onWheel, { capture: true });
      domEl.removeEventListener('dblclick', onDblClick);
      domEl.removeEventListener('touchstart', onTouchStart);
      domEl.removeEventListener('touchmove', onTouchMove);
      domEl.removeEventListener('touchend', onTouchEnd);
    };
  }, [gl, scene, stops, reducedMotion, debugFreeCam]);

  useEffect(() => {
    return () => {
      killExploreTween();
      killPoseTween();
    };
  }, []);

  const sampleAtSplineU = (u: number, outPos: THREE.Vector3, outTarget: THREE.Vector3) => {
    const clamped = Math.max(0, Math.min(1, u));
    const exactIdx = clamped * LUT_SAMPLES;
    const idx0 = Math.min(LUT_SAMPLES - 1, Math.floor(exactIdx));
    const frac = exactIdx - idx0;
    _posA.copy(posLUT[idx0]);
    _posB.copy(posLUT[idx0 + 1]);
    outPos.lerpVectors(_posA, _posB, frac);

    _tarA.copy(targetLUT[idx0]);
    _tarB.copy(targetLUT[idx0 + 1]);
    outTarget.lerpVectors(_tarA, _tarB, frac);
  };

  const sampleAtProgress = (progress: number, outPos: THREE.Vector3, outTarget: THREE.Vector3) => {
    const u = pacing.evaluate(progress);
    sampleAtSplineU(u, outPos, outTarget);
  };

  useEffect(() => {
    const visibilityReports = auditScreenStopVisibility(scene, stops, true);

    const api: CameraRigApi = {
      getStops: () => stops,
      getStopScrollPosition: (idx: number) => pacing.getStopScrollPosition(idx),
      sampleAtProgress,
      getCurrentCameraPose: () => {
        const persp = camera as THREE.PerspectiveCamera;
        const activeTarget =
          modeRef.current === 'EXPLORE' && orbitRef.current
            ? orbitRef.current.target
            : _curTarget;
        return {
          position: [
            Number(camera.position.x.toFixed(4)),
            Number(camera.position.y.toFixed(4)),
            Number(camera.position.z.toFixed(4)),
          ],
          target: [
            Number(activeTarget.x.toFixed(4)),
            Number(activeTarget.y.toFixed(4)),
            Number(activeTarget.z.toFixed(4)),
          ],
          fov: Number((persp.fov || DEFAULT_FOV_DEG).toFixed(2)),
        };
      },
      getFocusedScreenPose: (screenId: ScreenId) => {
        const p = computeFocusedScreenPose(
          screenId,
          aspect,
          DEFAULT_FOV_DEG,
          effectiveSafeArea
        );
        return {
          position: [p.position.x, p.position.y, p.position.z],
          target: [p.target.x, p.target.y, p.target.z],
          fov: p.fov,
        };
      },
      flyToPose: (goalPose, durationSec, onComplete) => {
        killExploreTween();
        killPoseTween();

        const persp = camera as THREE.PerspectiveCamera;
        const startPos = camera.position.clone();
        const startTarget = (
          modeRef.current === 'EXPLORE' && orbitRef.current
            ? orbitRef.current.target
            : _curTarget
        ).clone();
        const startFov = persp.fov || DEFAULT_FOV_DEG;

        const goalPos = new THREE.Vector3(
          goalPose.position[0],
          goalPose.position[1],
          goalPose.position[2]
        );
        const goalTarget = new THREE.Vector3(
          goalPose.target[0],
          goalPose.target[1],
          goalPose.target[2]
        );
        const goalFov = goalPose.fov || DEFAULT_FOV_DEG;

        lockedFocusPoseRef.current = {
          pos: goalPos.clone(),
          target: goalTarget.clone(),
          fov: goalFov,
        };

        if (durationSec <= 0 || reducedMotion) {
          _curPos.copy(goalPos);
          _curTarget.copy(goalTarget);
          camera.position.copy(goalPos);
          camera.up.set(0, 1, 0);
          camera.lookAt(goalTarget);
          if (Math.abs(persp.fov - goalFov) > 0.01) {
            persp.fov = goalFov;
            persp.updateProjectionMatrix();
          }
          if (orbitRef.current) {
            orbitRef.current.target.copy(goalTarget);
            orbitRef.current.update();
          }
          onComplete?.();
          return;
        }

        const proxy = { t: 0 };
        isPoseTweeningRef.current = true;
        poseTweenRef.current = gsap.to(proxy, {
          t: 1,
          duration: durationSec,
          ease: 'power3.inOut',
          onUpdate: () => {
            _curPos.lerpVectors(startPos, goalPos, proxy.t);
            _curTarget.lerpVectors(startTarget, goalTarget, proxy.t);
            camera.position.copy(_curPos);
            camera.up.set(0, 1, 0);
            camera.lookAt(_curTarget);

            const nextFov = THREE.MathUtils.lerp(startFov, goalFov, proxy.t);
            if (Math.abs(persp.fov - nextFov) > 0.01) {
              persp.fov = nextFov;
              persp.updateProjectionMatrix();
            }
          },
          onComplete: () => {
            isPoseTweeningRef.current = false;
            poseTweenRef.current = null;
            _curPos.copy(goalPos);
            _curTarget.copy(goalTarget);
            camera.position.copy(goalPos);
            camera.up.set(0, 1, 0);
            camera.lookAt(goalTarget);
            if (orbitRef.current) {
              orbitRef.current.target.copy(goalTarget);
              orbitRef.current.update();
            }
            onComplete?.();
          },
        });
      },
      cancelPoseTween: () => {
        killPoseTween();
        lockedFocusPoseRef.current = null;
      },
      playIntroReveal: (durationSec = 1.05) => {
        const overviewStop = stops[0];
        if (!overviewStop || reducedMotion) return;
        killExploreTween();
        killPoseTween();

        const startPos = new THREE.Vector3(
          overviewStop.position.x * 1.07,
          overviewStop.position.y * 1.05,
          overviewStop.position.z * 1.07
        );
        const startTarget = new THREE.Vector3(
          overviewStop.target.x,
          overviewStop.target.y + 0.08,
          overviewStop.target.z
        );
        const goalPos = overviewStop.position.clone();
        const goalTarget = overviewStop.target.clone();

        const proxy = { t: 0 };
        isPoseTweeningRef.current = true;
        poseTweenRef.current = gsap.to(proxy, {
          t: 1,
          duration: durationSec,
          ease: 'power3.out',
          onUpdate: () => {
            _curPos.lerpVectors(startPos, goalPos, proxy.t);
            _curTarget.lerpVectors(startTarget, goalTarget, proxy.t);
            camera.position.copy(_curPos);
            camera.up.set(0, 1, 0);
            camera.lookAt(_curTarget);
          },
          onComplete: () => {
            isPoseTweeningRef.current = false;
            poseTweenRef.current = null;
            _curPos.copy(goalPos);
            _curTarget.copy(goalTarget);
            camera.position.copy(goalPos);
            camera.up.set(0, 1, 0);
            camera.lookAt(goalTarget);
          },
        });
      },
      syncOrbitTargetToCurrent: (customPose) => {
        killExploreTween();
        killPoseTween();
        lockedFocusPoseRef.current = null;
        if (customPose) {
          camera.position.set(
            customPose.position[0],
            customPose.position[1],
            customPose.position[2]
          );
          _curPos.copy(camera.position);
          _curTarget.set(customPose.target[0], customPose.target[1], customPose.target[2]);
        }
        if (orbitRef.current) {
          orbitRef.current.zoomToCursor = true;
          orbitRef.current.target.copy(_curTarget);
          updateOrbitAngleLimits(
            orbitRef.current,
            camera.position.distanceTo(orbitRef.current.target),
            debugFreeCam
          );
          orbitRef.current.update();
        }
      },
      resetExploreView: (durationSec = 1.0) => {
        resetExploreView(durationSec);
      },
      resetExploreOffsetsImmediate: () => {
        killExploreTween();
        killPoseTween();
        lockedFocusPoseRef.current = null;
        const overviewStop = stops[0];
        if (orbitRef.current && overviewStop) {
          orbitRef.current.enabled = false;
          orbitRef.current.target.copy(overviewStop.target);
          _curPos.copy(overviewStop.position);
          _curTarget.copy(overviewStop.target);
          updateOrbitAngleLimits(
            orbitRef.current,
            overviewStop.position.distanceTo(overviewStop.target),
            debugFreeCam
          );
        }
      },
      zoomExploreByFactor: (factorDelta: number) => {
        const controls = orbitRef.current;
        if (!controls || modeRef.current !== 'EXPLORE' || viewerOpenRef.current) return;
        killExploreTween();
        killPoseTween();
        onExploreFirstZoomRef.current?.();

        _viewOffset.subVectors(camera.position, controls.target);
        const curDist = _viewOffset.length();
        if (curDist < 1e-5) return;

        const nextDist = THREE.MathUtils.clamp(
          curDist * (1 - factorDelta),
          EXPLORE_MIN_DISTANCE,
          EXPLORE_MAX_DISTANCE
        );
        camera.position.copy(controls.target).addScaledVector(_viewOffset, nextDist / curDist);
        clampExploreTargetAndShiftCamera(controls.target, camera.position);
        resolveCameraCollision(camera.position, CAMERA_SPHERE_RADIUS);
        updateOrbitAngleLimits(controls, camera.position.distanceTo(controls.target), debugFreeCam);
        controls.update();
        enforceExploreConstraints(controls);
      },
      orbitExploreByAngles: (deltaAzimuthRad: number, deltaPolarRad: number) => {
        const controls = orbitRef.current;
        if (!controls || modeRef.current !== 'EXPLORE' || viewerOpenRef.current) return;
        killExploreTween();
        killPoseTween();

        _viewOffset.subVectors(camera.position, controls.target);
        const curDist = _viewOffset.length();
        updateOrbitAngleLimits(controls, curDist, debugFreeCam);

        _spherical.setFromVector3(_viewOffset);
        _spherical.theta = THREE.MathUtils.clamp(
          _spherical.theta + deltaAzimuthRad,
          controls.minAzimuthAngle,
          controls.maxAzimuthAngle
        );
        _spherical.phi = THREE.MathUtils.clamp(
          _spherical.phi + deltaPolarRad,
          controls.minPolarAngle,
          controls.maxPolarAngle
        );
        _spherical.makeSafe();
        _viewOffset.setFromSpherical(_spherical);

        camera.position.copy(controls.target).add(_viewOffset);
        clampExploreTargetAndShiftCamera(controls.target, camera.position);
        resolveCameraCollision(camera.position, CAMERA_SPHERE_RADIUS);
        controls.update();
        enforceExploreConstraints(controls);
      },
      simulateExploreCursorZoom: (clientX: number, clientY: number, stepFraction: number) => {
        applyCursorZoomStep(clientX, clientY, stepFraction);
      },
      simulateExploreDoubleClick: (
        clientX: number,
        clientY: number,
        immediate = false
      ): boolean => {
        return handleExploreDoubleClick(clientX, clientY, immediate);
      },
      getExploreState: () => {
        const controls = orbitRef.current;
        const target = controls ? controls.target : _curTarget;
        const dist = camera.position.distanceTo(target);
        return {
          cameraPosition: [
            Number(camera.position.x.toFixed(4)),
            Number(camera.position.y.toFixed(4)),
            Number(camera.position.z.toFixed(4)),
          ],
          target: [
            Number(target.x.toFixed(4)),
            Number(target.y.toFixed(4)),
            Number(target.z.toFixed(4)),
          ],
          distance: Number(dist.toFixed(4)),
          minDistance: controls ? controls.minDistance : EXPLORE_MIN_DISTANCE,
          maxDistance: controls ? controls.maxDistance : EXPLORE_MAX_DISTANCE,
          minAzimuthDeg: controls ? Math.round(controls.minAzimuthAngle * RAD2DEG) : 0,
          maxAzimuthDeg: controls ? Math.round(controls.maxAzimuthAngle * RAD2DEG) : 90,
          minPolarDeg: controls ? Math.round(controls.minPolarAngle * RAD2DEG) : 20,
          maxPolarDeg: controls ? Math.round(controls.maxPolarAngle * RAD2DEG) : 85,
          zoomToCursor: controls ? Boolean(controls.zoomToCursor) : true,
        };
      },
      runDiagnostics: () => {
        const collisionReport = auditPathCollisions(
          (u, out) => sampleAtSplineU(u, out, _tarA),
          stops,
          500,
          camera.near
        );
        const currentVisibility = auditScreenStopVisibility(scene, stops, true);
        return { collisionReport, visibilityReports: currentVisibility };
      },
    };
    onRegisterRigApi(api);

    (window as unknown as Record<string, unknown>).__PORTFOLIO_RIG__ = api;
    (window as unknown as Record<string, unknown>).__PORTFOLIO_VISIBILITY__ = visibilityReports;
  }, [
    stops,
    posLUT,
    targetLUT,
    pacing,
    scene,
    camera,
    debugFreeCam,
    reducedMotion,
    aspect,
    effectiveSafeArea,
  ]);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const mode = modeRef.current;

    // If a direct pose tween is active (focusing screen, opening phone contact panel, or restoring saved camera state),
    // let the pose tween drive camera.position and lookAt directly with zero snap.
    if (isPoseTweeningRef.current) {
      if (orbitRef.current) {
        orbitRef.current.enabled = false;
      }
      return;
    }

    if ((mode === 'EXPLORE' && !isFlyingRef.current) || debugFreeCam) {
      const controls = orbitRef.current;
      if (controls) {
        if (viewerOpenRef.current) {
          controls.enabled = false;
          return;
        }
        controls.enabled = !isExploreTweeningRef.current;
        controls.zoomToCursor = true;

        const frameDamping = 1 - Math.pow(1 - EXPLORE_DAMPING_FACTOR, dt * 60);
        controls.dampingFactor = THREE.MathUtils.clamp(frameDamping, 0.01, 0.45);

        const curDist = camera.position.distanceTo(controls.target);
        updateOrbitAngleLimits(controls, curDist, debugFreeCam);

        if (!isExploreTweeningRef.current) {
          controls.update();
          enforceExploreConstraints(controls);
        }
      }
      return;
    }

    if (orbitRef.current) {
      orbitRef.current.enabled = false;
    }

    const p = scrollProgressRef.current;

    if (mode === 'FOCUSED' && !isFlyingRef.current) {
      const fScreenId = focusedScreenIdRef?.current;
      if (fScreenId) {
        const focusPose = computeFocusedScreenPose(
          fScreenId,
          aspect,
          DEFAULT_FOV_DEG,
          effectiveSafeArea
        );
        _curPos.copy(focusPose.position);
        _curTarget.copy(focusPose.target);
      } else if (lockedFocusPoseRef.current) {
        _curPos.copy(lockedFocusPoseRef.current.pos);
        _curTarget.copy(lockedFocusPoseRef.current.target);
      } else if (focusedStopRef.current !== null) {
        const stop = stops[focusedStopRef.current] ?? stops[0];
        _curPos.copy(stop.position);
        _curTarget.copy(stop.target);
      }
    } else {
      sampleAtProgress(p, _curPos, _curTarget);
    }

    const pVelocity = (p - prevProgressRef.current) / Math.max(0.001, dt);
    prevProgressRef.current = p;

    if (!reducedMotion && !isMobile && mode !== 'FOCUSED') {
      const targetFovOffset = THREE.MathUtils.clamp(Math.abs(pVelocity) * 1.2, -1.2, 1.2);
      dampedFovOffsetRef.current = THREE.MathUtils.damp(
        dampedFovOffsetRef.current,
        targetFovOffset,
        6,
        dt
      );

      const lateralMove = _curPos.x - _prevPos.x;
      const targetRoll = THREE.MathUtils.clamp(-lateralMove * 0.3, -0.5 * DEG2RAD, 0.5 * DEG2RAD);
      dampedRollRef.current = THREE.MathUtils.damp(dampedRollRef.current, targetRoll, 6, dt);

      dampedPointerRef.current.x = THREE.MathUtils.damp(
        dampedPointerRef.current.x,
        pointerRef.current.x,
        5,
        dt
      );
      dampedPointerRef.current.y = THREE.MathUtils.damp(
        dampedPointerRef.current.y,
        pointerRef.current.y,
        5,
        dt
      );
    } else {
      dampedFovOffsetRef.current = 0;
      dampedRollRef.current = 0;
      dampedPointerRef.current.x = 0;
      dampedPointerRef.current.y = 0;
    }

    _prevPos.copy(_curPos);

    _forward.subVectors(_curTarget, _curPos).normalize();
    _up.set(0, 1, 0);
    _right.crossVectors(_forward, _up).normalize();
    _up.crossVectors(_right, _forward).normalize();

    const maxParallax = mode === 'FOCUSED' ? 0 : 0.05;
    _parallaxOffset
      .set(0, 0, 0)
      .addScaledVector(_right, dampedPointerRef.current.x * maxParallax)
      .addScaledVector(_up, dampedPointerRef.current.y * maxParallax * 0.65);

    camera.position.copy(_curPos).add(_parallaxOffset);
    camera.up.set(0, 1, 0);
    camera.lookAt(_curTarget);

    if (Math.abs(dampedRollRef.current) > 0.0001) {
      camera.rotateZ(dampedRollRef.current);
    }

    const persp = camera as THREE.PerspectiveCamera;
    const nextFov = DEFAULT_FOV_DEG + dampedFovOffsetRef.current;
    if (Math.abs(persp.fov - nextFov) > 0.01) {
      persp.fov = nextFov;
      persp.updateProjectionMatrix();
    }

    const nearestIdx = pacing.findNearestStopIndex(p);
    const stopScrollPos = pacing.getStopScrollPosition(nearestIdx);
    const distInScroll =
      nearestIdx === stops.length - 1 && p >= stopScrollPos
        ? 0
        : Math.abs(p - stopScrollPos);
    const nearFactor = Math.max(0, 1 - distInScroll / 0.075);
    const nearTier = nearFactor > 0.65 ? 2 : nearFactor > 0.2 ? 1 : 0;

    if (
      nearestIdx !== lastReportedStopRef.current ||
      nearTier !== lastReportedNearTierRef.current
    ) {
      lastReportedStopRef.current = nearestIdx;
      lastReportedNearTierRef.current = nearTier;
      onStopProximityChange(nearestIdx, nearFactor);
    }
  });

  return (
    <OrbitControls
      ref={orbitRef}
      makeDefault={false}
      enabled={false}
      zoomToCursor
      enableDamping
      dampingFactor={EXPLORE_DAMPING_FACTOR}
      enableZoom={false}
      zoomSpeed={EXPLORE_ZOOM_SPEED}
      enablePan
      screenSpacePanning
      panSpeed={EXPLORE_PAN_SPEED}
      minAzimuthAngle={debugFreeCam ? -Infinity : 0 * DEG2RAD}
      maxAzimuthAngle={debugFreeCam ? Infinity : 90 * DEG2RAD}
      minPolarAngle={debugFreeCam ? 0.05 : 20 * DEG2RAD}
      maxPolarAngle={debugFreeCam ? Math.PI - 0.05 : 85 * DEG2RAD}
      minDistance={debugFreeCam ? 0.5 : EXPLORE_MIN_DISTANCE}
      maxDistance={debugFreeCam ? 25 : EXPLORE_MAX_DISTANCE}
    />
  );
};
