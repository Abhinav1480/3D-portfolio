import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame } from '@react-three/fiber';
import gsap from 'gsap';
import { RoundedBox } from '@react-three/drei';
import { PortfolioMode } from '../camera/CameraRig';
import { GUITAR_SPEC } from '../config/layout';
import { PALETTE } from '../config/palette';
import {
  GuitarVisualStrumPlan,
  computeVisualStrumPlanForNextChord,
  getLastVisualStrumPlan,
  installGlobalAudioPriming,
  playGuitar,
  primeAudio,
} from '../audio/guitar';
import { RegisterClickableMeshFn } from './Room';

export interface GuitarProps {
  mode: PortfolioMode;
  isFlying: boolean;
  viewerOpen: boolean;
  reducedMotion: boolean;
  onHoverGuitarChange: (hovered: boolean) => void;
  registerClickableMesh: RegisterClickableMeshFn;
  registerPlayGuitarTrigger?: (fn: () => void) => void;
}

const STRING_BASE_X: readonly [number, number, number, number, number, number] = [
  -0.0165,
  -0.0099,
  -0.0033,
  0.0033,
  0.0099,
  0.0165,
];

const STRING_RADII: readonly [number, number, number, number, number, number] = [
  0.00145,
  0.00132,
  0.0012,
  0.00108,
  0.00098,
  0.0009,
];

const FRET_Y_OFFSETS: readonly [number, number, number, number, number] = [
  -0.045,
  -0.11,
  -0.172,
  -0.23,
  -0.285,
];

// Task 4: Position music symbols ABOVE the guitar body (yTop of body is -0.37; symbols spawn at -0.33..-0.18
// and rise +0.42..+0.55 m to +0.10..+0.37 m, well above the guitar body and forward at z = 0.18 m so never occluded).
const NOTE_COUNT = 4;
const NOTE_BASE_OFFSETS: readonly [
  [number, number, number],
  [number, number, number],
  [number, number, number],
  [number, number, number],
] = [
  [-0.14, -0.32, 0.18],
  [0.12, -0.26, 0.19],
  [-0.08, -0.20, 0.20],
  [0.15, -0.16, 0.18],
];

const NOTE_RISE_METERS: readonly [number, number, number, number] = [0.44, 0.50, 0.54, 0.48];
const NOTE_DRIFT_X: readonly [number, number, number, number] = [-0.055, 0.06, -0.045, 0.055];
const NOTE_STAGGER_SEC: readonly [number, number, number, number] = [0.0, 0.14, 0.28, 0.42];
const NOTE_DURATION_SEC = 1.65;
// Guitar body height is 0.45 m (-0.82 to -0.37). Scale 0.175 m = ~39% of body height (>> 12% minimum requirement).
const NOTE_BASE_SCALE = 0.175;

/**
 * Builds a soft, rounded figure-eight acoustic guitar body shape centered horizontally at x = 0,
 * spanning y from -0.82 m (bottom of lower bout) to -0.37 m (neck joint) in hook-local coordinates.
 */
function createFigureEightBodyShape(scale = 1.0): THREE.Shape {
  const s = new THREE.Shape();
  const yTop = -0.37;
  const yWaist = -0.535;
  const yBottom = -0.82;

  const wUpper = 0.126 * scale;
  const wWaist = 0.098 * scale;
  const wLower = 0.165 * scale;

  s.moveTo(0, yTop);

  s.bezierCurveTo(
    wUpper * 0.92,
    yTop,
    wUpper * 1.12,
    yTop - 0.105,
    wWaist,
    yWaist
  );

  s.bezierCurveTo(
    wWaist * 0.88,
    yWaist - 0.055,
    wLower * 1.14,
    yWaist - 0.125,
    wLower,
    yBottom + 0.115
  );
  s.bezierCurveTo(
    wLower * 0.92,
    yBottom + 0.02,
    wLower * 0.42,
    yBottom,
    0,
    yBottom
  );

  s.bezierCurveTo(
    -wLower * 0.42,
    yBottom,
    -wLower * 0.92,
    yBottom + 0.02,
    -wLower,
    yBottom + 0.115
  );
  s.bezierCurveTo(
    -wLower * 1.14,
    yWaist - 0.125,
    -wWaist * 0.88,
    yWaist - 0.055,
    -wWaist,
    yWaist
  );

  s.bezierCurveTo(
    -wUpper * 1.12,
    yTop - 0.105,
    -wUpper * 0.92,
    yTop,
    0,
    yTop
  );

  return s;
}

/**
 * Builds a 60%-scale teardrop pickguard shape beside the soundhole.
 */
function createPickguardShape(): THREE.Shape {
  const s = new THREE.Shape();
  const sc = 0.6;
  s.moveTo(0.048 * sc, -0.45 * sc - 0.21);
  s.bezierCurveTo(
    0.115 * sc,
    -0.46 * sc - 0.21,
    0.135 * sc,
    -0.61 * sc - 0.21,
    0.075 * sc,
    -0.65 * sc - 0.21
  );
  s.bezierCurveTo(
    0.032 * sc,
    -0.67 * sc - 0.21,
    0.018 * sc,
    -0.56 * sc - 0.21,
    0.048 * sc,
    -0.45 * sc - 0.21
  );
  return s;
}

/**
 * Task 4: High-contrast 256x256 canvas-drawn music note texture with dark espresso/plum stroke outline
 * and warm gold/amber fill so it is unmistakably legible against both the cream wall and wood tones.
 */
function createMusicNoteTexture(symbol: '♪' | '♫'): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, 256, 256);

    // Subtle soft contrast backing disc so note pops at overview distance
    const grad = ctx.createRadialGradient(128, 128, 12, 128, 128, 96);
    grad.addColorStop(0, 'rgba(36, 27, 54, 0.34)');
    grad.addColorStop(0.65, 'rgba(36, 27, 54, 0.12)');
    grad.addColorStop(1, 'rgba(36, 27, 54, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(128, 128, 96, 0, Math.PI * 2);
    ctx.fill();

    ctx.font = '800 168px "Sora", "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    // High-contrast dark outline (#241B36)
    ctx.strokeStyle = PALETTE.screenDarkBg;
    ctx.lineWidth = 18;
    ctx.strokeText(symbol, 128, 134);

    // Warm vibrant amber-gold fill (#F2A33A -> #FFD27A)
    const fillGrad = ctx.createLinearGradient(0, 48, 0, 208);
    fillGrad.addColorStop(0, PALETTE.certOutlineGold);
    fillGrad.addColorStop(1, PALETTE.uiPrimaryAccent);
    ctx.fillStyle = fillGrad;
    ctx.fillText(symbol, 128, 134);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  return tex;
}

interface StrumAnimationState {
  active: boolean;
  startTimeSec: number;
  stringDelaysSec: [number, number, number, number, number, number];
  pluckedMask: [boolean, boolean, boolean, boolean, boolean, boolean];
}

export const Guitar: React.FC<GuitarProps> = ({
  mode,
  isFlying,
  viewerOpen,
  reducedMotion,
  onHoverGuitarChange,
  registerClickableMesh,
  registerPlayGuitarTrigger,
}) => {
  const hitGroupRef = useRef<THREE.Group | null>(null);
  const scaleGroupRef = useRef<THREE.Group | null>(null);
  const wobblePivotRef = useRef<THREE.Group | null>(null);
  const stringMeshRefs = useRef<Array<THREE.Mesh | null>>([null, null, null, null, null, null]);
  const noteSpriteRefs = useRef<Array<THREE.Sprite | null>>([null, null, null, null]);
  const noteMatRefs = useRef<Array<THREE.SpriteMaterial | null>>([null, null, null, null]);

  const hoveredRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const canInteract = (mode === 'TOUR' || mode === 'EXPLORE') && !isFlying && !viewerOpen;
  const canInteractRef = useRef(canInteract);
  canInteractRef.current = canInteract;

  const modeRef = useRef<PortfolioMode>(mode);
  modeRef.current = mode;

  const isFlyingRef = useRef(isFlying);
  isFlyingRef.current = isFlying;

  const viewerOpenRef = useRef(viewerOpen);
  viewerOpenRef.current = viewerOpen;

  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;

  const onHoverChangeRef = useRef(onHoverGuitarChange);
  onHoverChangeRef.current = onHoverGuitarChange;

  useEffect(() => {
    installGlobalAudioPriming();
  }, []);

  const animStateRef = useRef<StrumAnimationState>({
    active: false,
    startTimeSec: 0,
    stringDelaysSec: [0, 0, 0, 0, 0, 0],
    pluckedMask: [false, false, false, false, false, false],
  });

  const { bodyBackSidesGeo, bodyTopGeo, pickguardGeo, noteTexSingle, noteTexDouble } =
    useMemo(() => {
      const backShape = createFigureEightBodyShape(1.0);
      const backGeo = new THREE.ExtrudeGeometry(backShape, {
        depth: 0.068,
        bevelEnabled: true,
        bevelThickness: 0.008,
        bevelSize: 0.006,
        bevelSegments: 4,
        curveSegments: 24,
      });

      const topShape = createFigureEightBodyShape(0.975);
      const topGeo = new THREE.ExtrudeGeometry(topShape, {
        depth: 0.005,
        bevelEnabled: true,
        bevelThickness: 0.004,
        bevelSize: 0.004,
        bevelSegments: 3,
        curveSegments: 24,
      });

      const pgShape = createPickguardShape();
      const pgGeo = new THREE.ShapeGeometry(pgShape, 18);

      const tSingle = createMusicNoteTexture('♪');
      const tDouble = createMusicNoteTexture('♫');

      return {
        bodyBackSidesGeo: backGeo,
        bodyTopGeo: topGeo,
        pickguardGeo: pgGeo,
        noteTexSingle: tSingle,
        noteTexDouble: tDouble,
      };
    }, []);

  useEffect(() => {
    return () => {
      bodyBackSidesGeo.dispose();
      bodyTopGeo.dispose();
      pickguardGeo.dispose();
      noteTexSingle.dispose();
      noteTexDouble.dispose();
    };
  }, [bodyBackSidesGeo, bodyTopGeo, pickguardGeo, noteTexSingle, noteTexDouble]);

  const resetActiveAnimationsToRest = useCallback(() => {
    animStateRef.current.active = false;
    if (wobblePivotRef.current) {
      wobblePivotRef.current.rotation.z = GUITAR_SPEC.tiltZRad;
    }
    for (let i = 0; i < 6; i++) {
      const sMesh = stringMeshRefs.current[i];
      if (sMesh) {
        sMesh.position.x = STRING_BASE_X[i];
      }
    }
    for (let i = 0; i < NOTE_COUNT; i++) {
      const sp = noteSpriteRefs.current[i];
      const mat = noteMatRefs.current[i];
      if (sp) {
        sp.visible = false;
        sp.position.set(
          NOTE_BASE_OFFSETS[i][0],
          NOTE_BASE_OFFSETS[i][1],
          NOTE_BASE_OFFSETS[i][2]
        );
        sp.scale.set(NOTE_BASE_SCALE, NOTE_BASE_SCALE, NOTE_BASE_SCALE);
      }
      if (mat) {
        mat.opacity = 0;
        mat.rotation = 0;
      }
    }
  }, []);

  const startVisualAnimation = useCallback(
    (strum: GuitarVisualStrumPlan) => {
      if (reducedMotionRef.current) {
        resetActiveAnimationsToRest();
        return;
      }

      const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
      animStateRef.current = {
        active: true,
        startTimeSec: nowSec,
        stringDelaysSec: [
          strum.stringStartDelaysMs[0] / 1000,
          strum.stringStartDelaysMs[1] / 1000,
          strum.stringStartDelaysMs[2] / 1000,
          strum.stringStartDelaysMs[3] / 1000,
          strum.stringStartDelaysMs[4] / 1000,
          strum.stringStartDelaysMs[5] / 1000,
        ],
        pluckedMask: [...strum.pluckedMask],
      };

      for (let i = 0; i < NOTE_COUNT; i++) {
        const sp = noteSpriteRefs.current[i];
        const mat = noteMatRefs.current[i];
        if (sp && mat) {
          sp.visible = true;
          sp.position.set(
            NOTE_BASE_OFFSETS[i][0],
            NOTE_BASE_OFFSETS[i][1],
            NOTE_BASE_OFFSETS[i][2]
          );
          sp.scale.set(NOTE_BASE_SCALE * 0.85, NOTE_BASE_SCALE * 0.85, NOTE_BASE_SCALE * 0.85);
          mat.opacity = 0;
          mat.rotation = 0;
        }
      }
    },
    [resetActiveAnimationsToRest]
  );

  const triggerGuitarInteraction = useCallback(() => {
    if (
      modeRef.current === 'FOCUSED' ||
      viewerOpenRef.current ||
      isFlyingRef.current ||
      (modeRef.current !== 'TOUR' && modeRef.current !== 'EXPLORE')
    ) {
      return;
    }

    const fallbackVisualPlan = computeVisualStrumPlanForNextChord();

    primeAudio();
    void playGuitar();

    const latestPlan = getLastVisualStrumPlan() ?? fallbackVisualPlan;
    if (!latestPlan.accepted) {
      return;
    }
    startVisualAnimation(latestPlan);
  }, [startVisualAnimation]);

  const handlePlayGuitar = useCallback(() => {
    triggerGuitarInteraction();
  }, [triggerGuitarInteraction]);

  useEffect(() => {
    if (!registerPlayGuitarTrigger) return;
    registerPlayGuitarTrigger(handlePlayGuitar);
  }, [registerPlayGuitarTrigger, handlePlayGuitar]);

  useEffect(() => {
    if (!registerClickableMesh || !hitGroupRef.current) return;
    return registerClickableMesh(hitGroupRef.current, {
      id: 'wall-acoustic-guitar',
      onHoverMove: () => {
        if (!canInteractRef.current) return false;
        if (!hoveredRef.current) {
          hoveredRef.current = true;
          onHoverChangeRef.current(true);
          if (scaleGroupRef.current) {
            gsap.to(scaleGroupRef.current.scale, {
              x: 1.02,
              y: 1.02,
              z: 1.02,
              duration: 0.2,
              ease: 'power2.out',
            });
          }
        }
        return true;
      },
      onHoverLeave: () => {
        if (!hoveredRef.current) return;
        hoveredRef.current = false;
        onHoverChangeRef.current(false);
        if (scaleGroupRef.current) {
          gsap.to(scaleGroupRef.current.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.2,
            ease: 'power2.out',
          });
        }
      },
    });
  }, [registerClickableMesh]);

  useEffect(() => {
    if (hoveredRef.current) {
      hoveredRef.current = false;
      onHoverChangeRef.current(false);
    }
    if (scaleGroupRef.current) {
      gsap.killTweensOf(scaleGroupRef.current.scale);
      scaleGroupRef.current.scale.set(1, 1, 1);
    }
    resetActiveAnimationsToRest();
  }, [mode, isFlying, viewerOpen, reducedMotion, resetActiveAnimationsToRest]);

  useFrame(() => {
    const state = animStateRef.current;
    if (!state.active) return;

    if (reducedMotionRef.current) {
      resetActiveAnimationsToRest();
      return;
    }

    const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const elapsed = nowSec - state.startTimeSec;

    // 1. Guitar body wobbles by +/-1.5 degrees about the hook with a damped oscillation over 0.8 s
    if (wobblePivotRef.current) {
      if (elapsed >= 0 && elapsed < 0.8) {
        const wobbleAmpRad = (1.5 * Math.PI) / 180;
        const decay = Math.exp(-3.6 * elapsed) * (1 - elapsed / 0.8);
        const angleOffset = wobbleAmpRad * decay * Math.sin(elapsed * Math.PI * 5.5);
        wobblePivotRef.current.rotation.z = GUITAR_SPEC.tiltZRad + angleOffset;
      } else {
        wobblePivotRef.current.rotation.z = GUITAR_SPEC.tiltZRad;
      }
    }

    // 2. Strings vibrate for 0.9 s
    let anyStringActive = false;
    for (let i = 0; i < 6; i++) {
      const sMesh = stringMeshRefs.current[i];
      if (!sMesh) continue;

      if (!state.pluckedMask[i]) {
        sMesh.position.x = STRING_BASE_X[i];
        continue;
      }

      const strElapsed = elapsed - state.stringDelaysSec[i];
      if (strElapsed < 0) {
        anyStringActive = true;
        sMesh.position.x = STRING_BASE_X[i];
      } else if (strElapsed < 0.9) {
        anyStringActive = true;
        const progress = strElapsed / 0.9;
        const env = (1 - progress) * (1 - progress);
        const freqRad = 52 + i * 7;
        const disp = 0.004 * env * Math.sin(strElapsed * freqRad);
        sMesh.position.x = STRING_BASE_X[i] + disp;
      } else {
        sMesh.position.x = STRING_BASE_X[i];
      }
    }

    // 3. Task 4: Four high-contrast music notes float above the guitar body (rising 0.44..0.54 m)
    // with subtle sideways drift, slight rotation, and smooth fade-in / fade-out
    let anyNoteActive = false;
    for (let i = 0; i < NOTE_COUNT; i++) {
      const sp = noteSpriteRefs.current[i];
      const mat = noteMatRefs.current[i];
      if (!sp || !mat) continue;

      const noteElapsed = elapsed - NOTE_STAGGER_SEC[i];
      if (noteElapsed < 0) {
        anyNoteActive = true;
        sp.visible = true;
        mat.opacity = 0;
      } else if (noteElapsed < NOTE_DURATION_SEC) {
        anyNoteActive = true;
        sp.visible = true;
        const u = noteElapsed / NOTE_DURATION_SEC;
        const base = NOTE_BASE_OFFSETS[i];
        const rise = NOTE_RISE_METERS[i];
        const driftX = NOTE_DRIFT_X[i];

        // Upward + sideways drift with gentle sinusoidal wave
        const swayX = driftX * u + Math.sin(u * Math.PI * 2.2 + i * 1.3) * 0.032;
        const liftY = u * rise;
        sp.position.set(base[0] + swayX, base[1] + liftY, base[2]);

        // Slight scale-up to full size
        const scaleFactor = NOTE_BASE_SCALE * (0.88 + 0.22 * Math.sin(u * Math.PI));
        sp.scale.set(scaleFactor, scaleFactor, scaleFactor);

        // Slight Z rotation wobble
        const rotDir = i % 2 === 0 ? 1 : -1;
        mat.rotation = rotDir * Math.sin(u * Math.PI * 1.6) * 0.22;

        // Smooth fade-in over first 16%, sustained visibility, smooth fade-out over final 35%
        const fadeIn = Math.min(1, u / 0.16);
        const fadeOut = u < 0.65 ? 1 : Math.max(0, 1 - (u - 0.65) / 0.35);
        mat.opacity = Math.max(0, Math.min(1, fadeIn * fadeOut));
      } else {
        sp.visible = false;
        mat.opacity = 0;
      }
    }

    if (elapsed >= 0.8 && !anyStringActive && !anyNoteActive) {
      resetActiveAnimationsToRest();
    }
  });

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    pointerDownRef.current = {
      x: e.nativeEvent.clientX,
      y: e.nativeEvent.clientY,
      time: performance.now(),
    };
  };

  const handlePointerUp = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();

    const down = pointerDownRef.current;
    pointerDownRef.current = null;

    const dx = down ? e.nativeEvent.clientX - down.x : 0;
    const dy = down ? e.nativeEvent.clientY - down.y : 0;
    const dist = Math.hypot(dx, dy);
    const dt = down ? performance.now() - down.time : 0;
    const passed = dist < 6 && dt < 400;

    if (!passed) {
      return;
    }

    triggerGuitarInteraction();
  };

  return (
    <group
      ref={hitGroupRef}
      name="WallAcousticGuitar"
      position={GUITAR_SPEC.hookPosition}
      userData={{ ignoreForCamera: true }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Wall Hook Plate (#F5F1EA) mounted flush on the back wall behind the neck */}
      <RoundedBox
        args={[0.072, 0.11, 0.016]}
        radius={0.008}
        smoothness={3}
        position={[0, 0, -0.068]}
        castShadow
        receiveShadow
        userData={{ ignoreForCamera: true }}
      >
        <meshStandardMaterial color={PALETTE.guitarPegsHook} roughness={0.68} metalness={0} />
      </RoundedBox>

      {/* Hanger Bracket stem & U-yoke behind the neck */}
      <mesh
        position={[0, 0, -0.036]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        userData={{ ignoreForCamera: true }}
      >
        <cylinderGeometry args={[0.008, 0.01, 0.056, 14]} />
        <meshStandardMaterial color={PALETTE.guitarSoundhole} roughness={0.65} metalness={0} />
      </mesh>
      <mesh
        position={[-0.024, 0.004, -0.008]}
        rotation={[Math.PI / 3, 0, 0]}
        castShadow
        userData={{ ignoreForCamera: true }}
      >
        <cylinderGeometry args={[0.006, 0.006, 0.036, 12]} />
        <meshStandardMaterial color={PALETTE.guitarSoundhole} roughness={0.65} metalness={0} />
      </mesh>
      <mesh
        position={[0.024, 0.004, -0.008]}
        rotation={[Math.PI / 3, 0, 0]}
        castShadow
        userData={{ ignoreForCamera: true }}
      >
        <cylinderGeometry args={[0.006, 0.006, 0.036, 12]} />
        <meshStandardMaterial color={PALETTE.guitarSoundhole} roughness={0.65} metalness={0} />
      </mesh>

      {/* Hover Scale Group */}
      <group ref={scaleGroupRef} userData={{ ignoreForCamera: true }}>
        {/* Wobble Pivot Group centered at the hook above the TV, tilted 10 degrees around Z */}
        <group
          ref={wobblePivotRef}
          rotation={[0, 0, GUITAR_SPEC.tiltZRad]}
          userData={{ ignoreForCamera: true }}
        >
          {/* Clickable box covering 1.2x the body and neck bounds */}
          <mesh
            name="GuitarClickableHitBox"
            position={[0, -0.32, 0.015]}
            userData={{ ignoreForCamera: true }}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
          >
            <boxGeometry args={[0.34 * 1.2, 1.0 * 1.2, 0.12 * 1.2]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>

          {/* 1. Figure-Eight Acoustic Body: Back & Sides (#D9A571, extruded with bevel) */}
          <mesh
            geometry={bodyBackSidesGeo}
            position={[0, 0, -0.042]}
            castShadow
            receiveShadow
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarBackSides} roughness={0.72} metalness={0} />
          </mesh>

          {/* 2. Figure-Eight Acoustic Body: Soundboard Top (#F2A33A, extruded with soft bevel) */}
          <mesh
            geometry={bodyTopGeo}
            position={[0, 0, 0.031]}
            castShadow
            receiveShadow
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarTop} roughness={0.65} metalness={0} />
          </mesh>

          {/* 3. Soundhole Rosette Ring (#B87846) & Dark Soundhole (#3A2F2A) */}
          <mesh position={[0, -0.495, 0.0415]} userData={{ ignoreForCamera: true }}>
            <ringGeometry args={[0.045, 0.056, 32]} />
            <meshStandardMaterial color={PALETTE.guitarRosette} roughness={0.68} metalness={0} />
          </mesh>
          <mesh position={[0, -0.495, 0.041]} userData={{ ignoreForCamera: true }}>
            <circleGeometry args={[0.043, 32]} />
            <meshStandardMaterial color={PALETTE.guitarSoundhole} roughness={0.8} metalness={0} />
          </mesh>

          {/* 4. Pickguard (#3A2F2A at 60% scale) */}
          <mesh
            geometry={pickguardGeo}
            position={[0, 0, 0.0415]}
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarPickguard} roughness={0.66} metalness={0} />
          </mesh>

          {/* 5. Bridge (#7A4A2A) with Bone Saddle (#F4EBDD) */}
          <RoundedBox
            args={[0.112, 0.026, 0.012]}
            radius={0.004}
            smoothness={3}
            position={[0, -0.64, 0.043]}
            castShadow
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarBridge} roughness={0.7} metalness={0} />
          </RoundedBox>
          <RoundedBox
            args={[0.072, 0.006, 0.008]}
            radius={0.002}
            smoothness={2}
            position={[0, -0.636, 0.05]}
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarBoneStrings} roughness={0.62} metalness={0} />
          </RoundedBox>

          {/* 6. Neck (#B87846) + Fretboard (#7A4A2A) + 5 Thin Fret Lines (#F2C96B) + Bone Nut (#F4EBDD) */}
          <RoundedBox
            args={[0.044, 0.42, 0.022]}
            radius={0.007}
            smoothness={3}
            position={[0, -0.175, 0.018]}
            castShadow
            receiveShadow
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarNeckWood} roughness={0.68} metalness={0} />
          </RoundedBox>

          <RoundedBox
            args={[0.046, 0.435, 0.008]}
            radius={0.003}
            smoothness={2}
            position={[0, -0.195, 0.038]}
            castShadow
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarFretboard} roughness={0.72} metalness={0} />
          </RoundedBox>

          {/* Bone Nut (#F4EBDD) at top of fretboard */}
          <mesh position={[0, 0.02, 0.044]} userData={{ ignoreForCamera: true }}>
            <boxGeometry args={[0.045, 0.006, 0.006]} />
            <meshStandardMaterial color={PALETTE.guitarBoneStrings} roughness={0.62} metalness={0} />
          </mesh>

          {/* 5 Thin Fret Lines (#F2C96B) */}
          {FRET_Y_OFFSETS.map((fy, idx) => (
            <mesh
              key={`fret-${idx}`}
              position={[0, fy, 0.043]}
              userData={{ ignoreForCamera: true }}
            >
              <boxGeometry args={[0.044, 0.0035, 0.003]} />
              <meshStandardMaterial color={PALETTE.guitarFrets} roughness={0.62} metalness={0} />
            </mesh>
          ))}

          {/* 7. Headstock (#B87846) with 6 Tuning Pegs (#F5F1EA) */}
          <RoundedBox
            args={[0.064, 0.15, 0.018]}
            radius={0.008}
            smoothness={3}
            position={[0, 0.098, 0.016]}
            castShadow
            receiveShadow
            userData={{ ignoreForCamera: true }}
          >
            <meshStandardMaterial color={PALETTE.guitarNeckWood} roughness={0.68} metalness={0} />
          </RoundedBox>

          {[0, 1, 2].map((rowIdx) => {
            const pegY = 0.052 + rowIdx * 0.042;
            return (
              <React.Fragment key={`peg-row-${rowIdx}`}>
                {/* Left Peg (#F5F1EA) */}
                <group position={[-0.042, pegY, 0.016]} userData={{ ignoreForCamera: true }}>
                  <mesh rotation={[0, 0, Math.PI / 2]} userData={{ ignoreForCamera: true }}>
                    <cylinderGeometry args={[0.0035, 0.0035, 0.018, 10]} />
                    <meshStandardMaterial
                      color={PALETTE.guitarPegsHook}
                      roughness={0.65}
                      metalness={0}
                    />
                  </mesh>
                  <RoundedBox
                    args={[0.008, 0.016, 0.012]}
                    radius={0.003}
                    smoothness={2}
                    position={[-0.01, 0, 0]}
                    userData={{ ignoreForCamera: true }}
                  >
                    <meshStandardMaterial
                      color={PALETTE.guitarPegsHook}
                      roughness={0.65}
                      metalness={0}
                    />
                  </RoundedBox>
                </group>

                {/* Right Peg (#F5F1EA) */}
                <group position={[0.042, pegY, 0.016]} userData={{ ignoreForCamera: true }}>
                  <mesh rotation={[0, 0, Math.PI / 2]} userData={{ ignoreForCamera: true }}>
                    <cylinderGeometry args={[0.0035, 0.0035, 0.018, 10]} />
                    <meshStandardMaterial
                      color={PALETTE.guitarPegsHook}
                      roughness={0.65}
                      metalness={0}
                    />
                  </mesh>
                  <RoundedBox
                    args={[0.008, 0.016, 0.012]}
                    radius={0.003}
                    smoothness={2}
                    position={[0.01, 0, 0]}
                    userData={{ ignoreForCamera: true }}
                  >
                    <meshStandardMaterial
                      color={PALETTE.guitarPegsHook}
                      roughness={0.65}
                      metalness={0}
                    />
                  </RoundedBox>
                </group>
              </React.Fragment>
            );
          })}

          {/* 8. 6 Strings (#F4EBDD) running from bridge saddle (y = -0.636) to nut (y = +0.02) */}
          {STRING_BASE_X.map((sx, sIdx) => (
            <mesh
              key={`guitar-string-${sIdx}`}
              ref={(el) => {
                stringMeshRefs.current[sIdx] = el;
              }}
              position={[sx, -0.308, 0.048]}
              userData={{ ignoreForCamera: true }}
            >
              <cylinderGeometry args={[STRING_RADII[sIdx], STRING_RADII[sIdx], 0.656, 8]} />
              <meshStandardMaterial
                color={PALETTE.guitarBoneStrings}
                roughness={0.6}
                metalness={0}
              />
            </mesh>
          ))}
        </group>

        {/* Task 4: Pooled 4 Floating High-Contrast Music Note Sprites rising above the guitar body */}
        {[0, 1, 2, 3].map((nIdx) => (
          <sprite
            key={`music-note-${nIdx}`}
            ref={(el) => {
              noteSpriteRefs.current[nIdx] = el;
            }}
            visible={false}
            renderOrder={25}
            position={NOTE_BASE_OFFSETS[nIdx]}
            scale={[NOTE_BASE_SCALE, NOTE_BASE_SCALE, NOTE_BASE_SCALE]}
            userData={{
              ignoreForCamera: true,
              ignoreVisibilityRay: true,
              isOutlinePlane: true,
            }}
          >
            <spriteMaterial
              ref={(el) => {
                noteMatRefs.current[nIdx] = el;
              }}
              map={nIdx % 2 === 1 ? noteTexDouble : noteTexSingle}
              transparent
              opacity={0}
              blending={THREE.NormalBlending}
              depthTest={true}
              depthWrite={false}
            />
          </sprite>
        ))}
      </group>
    </group>
  );
};
