import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useProgress } from '@react-three/drei';
import './RoomLoader.css';

export interface RoomLoaderProps {
  /** Fires when the exit zoom starts; use to start camera intro */
  onReveal?: () => void;
  /** Fires when the loader is completely gone; use to show the HUD */
  onDone?: () => void;
  /** Optional scroll container element to lock while loader is visible (defaults to document.body / documentElement) */
  scrollContainer?: HTMLElement | null;
}

type LoaderPhase = 'loading' | 'lit' | 'exit' | 'unmounted';

const COS30 = 0.8660254;
const SIN30 = 0.5;
const ORIGIN_X = 180;
const ORIGIN_Y = 166;

/**
 * Tiny isometric projection helper:
 * x -> right-down, y -> left-down, z -> up
 */
function iso(x: number, y: number, z: number): [number, number] {
  const sx = ORIGIN_X + (x - y) * COS30;
  const sy = ORIGIN_Y + (x + y) * SIN30 - z;
  return [Number(sx.toFixed(2)), Number(sy.toFixed(2))];
}

function pts(coords: Array<[number, number]>): string {
  return coords.map(([px, py]) => `${px},${py}`).join(' ');
}

interface IsoBoxGeometry {
  top: string;
  left: string;
  right: string;
  outlinePath: string;
}

/**
 * Builds the 3 visible faces (top, left-front, right-front) and outer hexagonal
 * silhouette path for an axis-aligned isometric box [x..x+dx, y..y+dy, z..z+dz].
 */
function buildIsoBox(
  x: number,
  y: number,
  z: number,
  dx: number,
  dy: number,
  dz: number
): IsoBoxGeometry {
  const p001 = iso(x, y, z + dz);
  const p101 = iso(x + dx, y, z + dz);
  const p111 = iso(x + dx, y + dy, z + dz);
  const p011 = iso(x, y + dy, z + dz);

  const p100 = iso(x + dx, y, z);
  const p110 = iso(x + dx, y + dy, z);
  const p010 = iso(x, y + dy, z);

  const top = pts([p001, p101, p111, p011]);
  const left = pts([p011, p111, p110, p010]);
  const right = pts([p111, p101, p100, p110]);

  const outlinePath = `M ${p001[0]} ${p001[1]} L ${p101[0]} ${p101[1]} L ${p100[0]} ${p100[1]} L ${p110[0]} ${p110[1]} L ${p010[0]} ${p010[1]} L ${p011[0]} ${p011[1]} Z`;

  return { top, left, right, outlinePath };
}

const STARS = [
  { x: '10%', y: '14%', size: 2.5, dur: '2.8s', delay: '0.1s' },
  { x: '22%', y: '9%', size: 2, dur: '3.5s', delay: '0.7s' },
  { x: '35%', y: '16%', size: 3, dur: '3.1s', delay: '1.2s' },
  { x: '66%', y: '11%', size: 2.5, dur: '2.9s', delay: '0.4s' },
  { x: '79%', y: '15%', size: 2, dur: '3.7s', delay: '1.5s' },
  { x: '88%', y: '23%', size: 3, dur: '3.3s', delay: '0.2s' },
  { x: '14%', y: '34%', size: 2, dur: '4.0s', delay: '0.9s' },
  { x: '84%', y: '41%', size: 2.5, dur: '2.7s', delay: '1.1s' },
  { x: '9%', y: '58%', size: 2.5, dur: '3.4s', delay: '0.5s' },
  { x: '21%', y: '74%', size: 2, dur: '3.8s', delay: '1.7s' },
  { x: '77%', y: '68%', size: 2.5, dur: '3.0s', delay: '0.3s' },
  { x: '91%', y: '62%', size: 2, dur: '3.6s', delay: '1.3s' },
  { x: '16%', y: '88%', size: 2.5, dur: '2.9s', delay: '0.8s' },
  { x: '48%', y: '8%', size: 2, dur: '3.2s', delay: '1.6s' },
  { x: '62%', y: '86%', size: 2, dur: '3.9s', delay: '0.6s' },
  { x: '85%', y: '84%', size: 3, dur: '3.1s', delay: '1.0s' },
] as const;

function getStatusLabel(pct: number, phase: LoaderPhase): string {
  if (phase === 'lit' || phase === 'exit' || pct >= 100) return 'Lights on';
  if (pct >= 90) return 'Hanging the certificates';
  if (pct >= 82) return 'Watering the plant';
  if (pct >= 72) return 'Powering on the monitor';
  if (pct >= 60) return 'Setting up the desk';
  if (pct >= 50) return 'Moving in the sofa';
  if (pct >= 42) return 'Rolling out the rug';
  if (pct >= 30) return 'Hanging the window';
  if (pct >= 20) return 'Putting up the walls';
  if (pct >= 8) return 'Laying the floor';
  return 'Opening the door';
}

export const RoomLoader: React.FC<RoomLoaderProps> = ({
  onReveal,
  onDone,
  scrollContainer,
}) => {
  const { active, progress, total } = useProgress();

  const [displayProgress, setDisplayProgress] = useState(0);
  const [phase, setPhase] = useState<LoaderPhase>('loading');
  const [showSlowNote, setShowSlowNote] = useState(false);

  const reducedMotion = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const onRevealRef = useRef(onReveal);
  onRevealRef.current = onReveal;
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  const realProgressRef = useRef({ active, progress, total });
  realProgressRef.current = { active, progress, total };

  // Lock page scroll (or provided inner scroll container) while loader is mounted
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const targetEl = scrollContainer ?? document.body;
    const htmlEl = document.documentElement;
    const prevTargetOverflow = targetEl.style.overflow;
    const prevHtmlOverflow = htmlEl.style.overflow;

    targetEl.style.overflow = 'hidden';
    if (!scrollContainer) {
      htmlEl.style.overflow = 'hidden';
    }

    return () => {
      targetEl.style.overflow = prevTargetOverflow;
      if (!scrollContainer) {
        htmlEl.style.overflow = prevHtmlOverflow;
      }
    };
  }, [scrollContainer]);

  // Show slow-connection note after 9 seconds if still in loading phase
  useEffect(() => {
    if (phase !== 'loading') {
      setShowSlowNote(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setShowSlowNote(true);
    }, 9000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  // Smooth progress loop with minimum display time (~2.8s normal, ~1.1s reduced-motion)
  // and 0.9s fallback when the scene has 0 external assets queued in useProgress
  useEffect(() => {
    if (phase !== 'loading') return;

    const minDisplayMs = reducedMotion ? 1100 : 2800;
    const emptySceneFallbackMs = 900;
    const maxAssetWaitMs = 7500;
    const startMs = performance.now();
    let currentSmoothed = 0;
    let rafId = 0;

    const tick = (nowMs: number) => {
      const elapsed = nowMs - startMs;
      const timeFraction = Math.min(1, elapsed / minDisplayMs);
      const timeCap = timeFraction * 100;

      const { active: isLoaderActive, progress: rawPct, total: totalAssets } =
        realProgressRef.current;

      // If nothing is registered with THREE.DefaultLoadingManager (total === 0 && !active)
      // after 0.9s, or if a slow/blocked asset exceeds maxAssetWaitMs (7.5s), treat asset load as complete (100%).
      let effectiveAssetPct = rawPct;
      if (elapsed >= maxAssetWaitMs) {
        effectiveAssetPct = 100;
      } else if (!isLoaderActive && totalAssets > 0) {
        effectiveAssetPct = 100;
      } else if (!isLoaderActive && totalAssets === 0 && elapsed >= emptySceneFallbackMs) {
        effectiveAssetPct = 100;
      } else if (!isLoaderActive && totalAssets === 0) {
        // Before 0.9s when total===0, pace smoothly along timeCap so pieces start drawing immediately
        effectiveAssetPct = Math.min(92, (elapsed / emptySceneFallbackMs) * 92);
      } else if (isLoaderActive && totalAssets > 0) {
        // While real assets are downloading, blend real progress with a gentle time floor so progress never sits frozen at 0%
        const gentleFloor = Math.min(88, (elapsed / maxAssetWaitMs) * 88);
        effectiveAssetPct = Math.max(rawPct, gentleFloor);
      }

      const targetPct = Math.min(timeCap, effectiveAssetPct);
      const delta = targetPct - currentSmoothed;
      const step = Math.max(0.35, delta * 0.16);

      if (delta > 0) {
        currentSmoothed = Math.min(targetPct, currentSmoothed + step);
      }

      const rounded = Math.min(100, Math.floor(currentSmoothed));
      setDisplayProgress((prev) => (rounded > prev ? rounded : prev));

      if (elapsed >= minDisplayMs && effectiveAssetPct >= 100 && currentSmoothed >= 99.4) {
        setDisplayProgress(100);
        setPhase('lit');
        return;
      }

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [phase, reducedMotion]);

  // Phase handoff: 'lit' (~0.9s) -> 'exit' (~1.1s, fires onReveal) -> 'unmounted' (fires onDone)
  useEffect(() => {
    if (phase === 'lit') {
      const litDurationMs = reducedMotion ? 320 : 900;
      const t = window.setTimeout(() => {
        onRevealRef.current?.();
        setPhase('exit');
      }, litDurationMs);
      return () => window.clearTimeout(t);
    }

    if (phase === 'exit') {
      const exitDurationMs = reducedMotion ? 350 : 1100;
      const t = window.setTimeout(() => {
        setPhase('unmounted');
        onDoneRef.current?.();
      }, exitDurationMs);
      return () => window.clearTimeout(t);
    }
  }, [phase, reducedMotion]);

  // Precompute miniature isometric room geometry
  const geom = useMemo(() => {
    const floor = buildIsoBox(0, 0, -7, 104, 104, 7);
    const plank1A = iso(26, 0, 0);
    const plank1B = iso(26, 104, 0);
    const plank2A = iso(52, 0, 0);
    const plank2B = iso(52, 104, 0);
    const plank3A = iso(78, 0, 0);
    const plank3B = iso(78, 104, 0);

    const leftWall = buildIsoBox(0, 0, 0, 6, 104, 74);
    const rightWall = buildIsoBox(0, 0, 0, 104, 6, 74);

    // Night window on the left wall (x = 6.2, y = 16..46, z = 26..58)
    const winOuter = [
      iso(6.2, 16, 58),
      iso(6.2, 46, 58),
      iso(6.2, 46, 26),
      iso(6.2, 16, 26),
    ];
    const winGlass = [
      iso(6.4, 18.5, 55.5),
      iso(6.4, 43.5, 55.5),
      iso(6.4, 43.5, 28.5),
      iso(6.4, 18.5, 28.5),
    ];
    const winMidV1 = iso(6.5, 31, 55.5);
    const winMidV2 = iso(6.5, 31, 28.5);
    const winMidH1 = iso(6.5, 18.5, 42);
    const winMidH2 = iso(6.5, 43.5, 42);
    const moonCenter = iso(6.6, 25, 48);

    // Rug on the floor (x = 34..88, y = 38..92, z = 0.6)
    const rugOuter = [
      iso(34, 38, 0.6),
      iso(88, 38, 0.6),
      iso(88, 92, 0.6),
      iso(34, 92, 0.6),
    ];
    const rugInner = [
      iso(40, 44, 0.8),
      iso(82, 44, 0.8),
      iso(82, 86, 0.8),
      iso(40, 86, 0.8),
    ];

    // Sofa along left wall (x = 10..34, y = 44..90)
    const sofaBase = buildIsoBox(10, 44, 0, 24, 46, 11);
    const sofaBack = buildIsoBox(10, 44, 11, 8, 46, 15);
    const sofaArmL = buildIsoBox(10, 44, 11, 24, 7, 8);
    const sofaArmR = buildIsoBox(10, 83, 11, 24, 7, 8);
    const sofaCushion1 = buildIsoBox(18, 52, 11, 14, 14, 4);
    const sofaCushion2 = buildIsoBox(18, 68, 11, 14, 14, 4);

    // Desk along right wall (x = 30..82, y = 10..34)
    const deskLegL = buildIsoBox(32, 12, 0, 6, 20, 20);
    const deskDrawerR = buildIsoBox(66, 12, 0, 14, 20, 20);
    const deskTop = buildIsoBox(30, 10, 20, 52, 24, 4);

    // Monitor on the desk (x = 44..68, y = 14..18)
    const monitorStand = buildIsoBox(53, 14, 24, 6, 4, 5);
    const monitorBody = buildIsoBox(42, 14, 29, 28, 4, 17);
    const monitorScreen = [
      iso(44, 18.2, 44),
      iso(68, 18.2, 44),
      iso(68, 18.2, 31),
      iso(44, 18.2, 31),
    ];

    // Plant near right wall / desk (x = 84..96, y = 16..28)
    const plantPot = buildIsoBox(84, 16, 0, 12, 12, 13);
    const plantLeafLower = buildIsoBox(82, 14, 13, 16, 16, 11);
    const plantLeafUpper = buildIsoBox(85, 17, 24, 10, 10, 9);

    // Certificate frames on left wall (x = 6.2, y = 54..92, z = 38..50) + certificate shelf on right wall
    const makeWallFrame = (yStart: number, yEnd: number, zLow: number, zHigh: number) => {
      const outer = [
        iso(6.2, yStart, zHigh),
        iso(6.2, yEnd, zHigh),
        iso(6.2, yEnd, zLow),
        iso(6.2, yStart, zLow),
      ];
      const inner = [
        iso(6.4, yStart + 1.6, zHigh - 1.6),
        iso(6.4, yEnd - 1.6, zHigh - 1.6),
        iso(6.4, yEnd - 1.6, zLow + 1.6),
        iso(6.4, yStart + 1.6, zLow + 1.6),
      ];
      return {
        outerPts: pts(outer),
        innerPts: pts(inner),
        outlinePath: `M ${outer[0][0]} ${outer[0][1]} L ${outer[1][0]} ${outer[1][1]} L ${outer[2][0]} ${outer[2][1]} L ${outer[3][0]} ${outer[3][1]} Z`,
      };
    };

    const certFrame1 = makeWallFrame(54, 65, 38, 49);
    const certFrame2 = makeWallFrame(67, 78, 38, 49);
    const certFrame3 = makeWallFrame(80, 91, 38, 49);
    const certShelf = buildIsoBox(40, 6, 52, 32, 6, 3);

    return {
      floor,
      plankLinePath: `M ${plank1A[0]} ${plank1A[1]} L ${plank1B[0]} ${plank1B[1]} M ${plank2A[0]} ${plank2A[1]} L ${plank2B[0]} ${plank2B[1]} M ${plank3A[0]} ${plank3A[1]} L ${plank3B[0]} ${plank3B[1]}`,
      leftWall,
      rightWall,
      winOuterPts: pts(winOuter),
      winGlassPts: pts(winGlass),
      winOutlinePath: `M ${winOuter[0][0]} ${winOuter[0][1]} L ${winOuter[1][0]} ${winOuter[1][1]} L ${winOuter[2][0]} ${winOuter[2][1]} L ${winOuter[3][0]} ${winOuter[3][1]} Z`,
      winPanesPath: `M ${winMidV1[0]} ${winMidV1[1]} L ${winMidV2[0]} ${winMidV2[1]} M ${winMidH1[0]} ${winMidH1[1]} L ${winMidH2[0]} ${winMidH2[1]}`,
      moonCenter,
      rugOuterPts: pts(rugOuter),
      rugInnerPts: pts(rugInner),
      rugOutlinePath: `M ${rugOuter[0][0]} ${rugOuter[0][1]} L ${rugOuter[1][0]} ${rugOuter[1][1]} L ${rugOuter[2][0]} ${rugOuter[2][1]} L ${rugOuter[3][0]} ${rugOuter[3][1]} Z`,
      sofaBase,
      sofaBack,
      sofaArmL,
      sofaArmR,
      sofaCushion1,
      sofaCushion2,
      deskLegL,
      deskDrawerR,
      deskTop,
      monitorStand,
      monitorBody,
      monitorScreenPts: pts(monitorScreen),
      plantPot,
      plantLeafLower,
      plantLeafUpper,
      certFrame1,
      certFrame2,
      certFrame3,
      certShelf,
    };
  }, []);

  if (phase === 'unmounted') {
    return null;
  }

  const statusText = getStatusLabel(displayProgress, phase);
  const pieceClass = (threshold: number) =>
    `rl-piece ${displayProgress >= threshold ? 'rl-piece--visible' : ''}`;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Loading portfolio: ${statusText}, ${displayProgress}%`}
      className={`room-loader ${phase === 'lit' ? 'room-loader--lit' : ''} ${
        phase === 'exit' ? 'room-loader--exit' : ''
      }`}
    >
      {/* 16 twinkling background stars */}
      <div className="room-loader__stars" aria-hidden="true">
        {STARS.map((s, idx) => (
          <span
            key={idx}
            className="room-loader__star"
            style={
              {
                left: s.x,
                top: s.y,
                width: `${s.size}px`,
                height: `${s.size}px`,
                '--star-dur': s.dur,
                '--star-delay': s.delay,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <div className="room-loader__card">
        <div className="room-loader__stage">
          <div className="room-loader__bloom" aria-hidden="true" />

          <svg
            className="room-loader__svg"
            viewBox="0 0 360 310"
            aria-hidden="true"
            focusable="false"
          >
            {/* 1. Floor (outline draws immediately from 0%, fills fade in at 8%) */}
            <g className={`rl-piece rl-piece--outline ${displayProgress >= 8 ? 'rl-piece--visible' : ''}`}>
              <g className="rl-piece__fills">
                <polygon className="rl-face-floor-top" points={geom.floor.top} />
                <polygon className="rl-face-floor-left" points={geom.floor.left} />
                <polygon className="rl-face-floor-right" points={geom.floor.right} />
                <path
                  d={geom.plankLinePath}
                  stroke="rgba(110, 62, 22, 0.28)"
                  strokeWidth="1"
                  fill="none"
                />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={geom.floor.outlinePath}
              />
            </g>

            {/* 2. Left wall (threshold 20) */}
            <g className={pieceClass(20)}>
              <g className="rl-piece__fills">
                <polygon className="rl-face-lwall-top" points={geom.leftWall.top} />
                <polygon className="rl-face-lwall-left" points={geom.leftWall.left} />
                <polygon className="rl-face-lwall-right" points={geom.leftWall.right} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={geom.leftWall.outlinePath}
              />
            </g>

            {/* 3. Right wall (threshold 24) */}
            <g className={pieceClass(24)}>
              <g className="rl-piece__fills">
                <polygon className="rl-face-rwall-top" points={geom.rightWall.top} />
                <polygon className="rl-face-rwall-left" points={geom.rightWall.left} />
                <polygon className="rl-face-rwall-right" points={geom.rightWall.right} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={geom.rightWall.outlinePath}
              />
            </g>

            {/* 4. Night window (threshold 30) */}
            <g className={pieceClass(30)}>
              <g className="rl-piece__fills">
                <polygon fill="#fbeed6" points={geom.winOuterPts} />
                <polygon fill="#1c2247" points={geom.winGlassPts} />
                <circle
                  cx={geom.moonCenter[0]}
                  cy={geom.moonCenter[1]}
                  r="3.2"
                  fill="#fbeed6"
                />
                <path
                  d={geom.winPanesPath}
                  stroke="#fbeed6"
                  strokeWidth="1.2"
                  fill="none"
                />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={geom.winOutlinePath}
              />
            </g>

            {/* 5. Rug (threshold 42) */}
            <g className={pieceClass(42)}>
              <g className="rl-piece__fills">
                <polygon fill="#fbeed6" points={geom.rugOuterPts} />
                <polygon fill="#e9d8b6" points={geom.rugInnerPts} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={geom.rugOutlinePath}
              />
            </g>

            {/* 6. Sofa (threshold 50) */}
            <g className={pieceClass(50)}>
              <g className="rl-piece__fills">
                <polygon className="rl-face-sofa-top" points={geom.sofaBase.top} />
                <polygon className="rl-face-sofa-left" points={geom.sofaBase.left} />
                <polygon className="rl-face-sofa-right" points={geom.sofaBase.right} />

                <polygon className="rl-face-sofa-top" points={geom.sofaBack.top} />
                <polygon className="rl-face-sofa-left" points={geom.sofaBack.left} />
                <polygon className="rl-face-sofa-right" points={geom.sofaBack.right} />

                <polygon className="rl-face-sofa-top" points={geom.sofaArmL.top} />
                <polygon className="rl-face-sofa-left" points={geom.sofaArmL.left} />
                <polygon className="rl-face-sofa-right" points={geom.sofaArmL.right} />

                <polygon className="rl-face-cushion-top" points={geom.sofaCushion1.top} />
                <polygon className="rl-face-cushion-left" points={geom.sofaCushion1.left} />
                <polygon className="rl-face-cushion-right" points={geom.sofaCushion1.right} />

                <polygon className="rl-face-cushion-top" points={geom.sofaCushion2.top} />
                <polygon className="rl-face-cushion-left" points={geom.sofaCushion2.left} />
                <polygon className="rl-face-cushion-right" points={geom.sofaCushion2.right} />

                <polygon className="rl-face-sofa-top" points={geom.sofaArmR.top} />
                <polygon className="rl-face-sofa-left" points={geom.sofaArmR.left} />
                <polygon className="rl-face-sofa-right" points={geom.sofaArmR.right} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={`${geom.sofaBase.outlinePath} ${geom.sofaBack.outlinePath}`}
              />
            </g>

            {/* 7. Desk (threshold 60) */}
            <g className={pieceClass(60)}>
              <g className="rl-piece__fills">
                <polygon className="rl-face-desk-top" points={geom.deskLegL.top} />
                <polygon className="rl-face-desk-left" points={geom.deskLegL.left} />
                <polygon className="rl-face-desk-right" points={geom.deskLegL.right} />

                <polygon className="rl-face-desk-top" points={geom.deskDrawerR.top} />
                <polygon className="rl-face-desk-left" points={geom.deskDrawerR.left} />
                <polygon className="rl-face-desk-right" points={geom.deskDrawerR.right} />

                <polygon className="rl-face-desk-top" points={geom.deskTop.top} />
                <polygon className="rl-face-desk-left" points={geom.deskTop.left} />
                <polygon className="rl-face-desk-right" points={geom.deskTop.right} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={`${geom.deskTop.outlinePath} ${geom.deskDrawerR.outlinePath}`}
              />
            </g>

            {/* 8. Monitor (threshold 72) */}
            <g className={pieceClass(72)}>
              <g className="rl-piece__fills">
                <polygon fill="#2f2f38" points={geom.monitorStand.top} />
                <polygon fill="#23232b" points={geom.monitorStand.left} />
                <polygon fill="#1b1b22" points={geom.monitorStand.right} />

                <polygon fill="#32323d" points={geom.monitorBody.top} />
                <polygon fill="#23232b" points={geom.monitorBody.left} />
                <polygon fill="#181820" points={geom.monitorBody.right} />

                <polygon className="rl-monitor-screen" points={geom.monitorScreenPts} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={geom.monitorBody.outlinePath}
              />
            </g>

            {/* 9. Plant (threshold 82) */}
            <g className={pieceClass(82)}>
              <g className="rl-piece__fills">
                <polygon className="rl-face-pot-top" points={geom.plantPot.top} />
                <polygon className="rl-face-pot-left" points={geom.plantPot.left} />
                <polygon className="rl-face-pot-right" points={geom.plantPot.right} />

                <polygon className="rl-face-leaf-top" points={geom.plantLeafLower.top} />
                <polygon className="rl-face-leaf-left" points={geom.plantLeafLower.left} />
                <polygon className="rl-face-leaf-right" points={geom.plantLeafLower.right} />

                <polygon className="rl-face-leaf-top" points={geom.plantLeafUpper.top} />
                <polygon className="rl-face-leaf-left" points={geom.plantLeafUpper.left} />
                <polygon className="rl-face-leaf-right" points={geom.plantLeafUpper.right} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={`${geom.plantPot.outlinePath} ${geom.plantLeafLower.outlinePath} ${geom.plantLeafUpper.outlinePath}`}
              />
            </g>

            {/* 10. Certificate frames & shelf (threshold 90) */}
            <g className={pieceClass(90)}>
              <g className="rl-piece__fills">
                <polygon fill="#f2b441" points={geom.certFrame1.outerPts} />
                <polygon fill="#fbeed6" points={geom.certFrame1.innerPts} />

                <polygon fill="#f2b441" points={geom.certFrame2.outerPts} />
                <polygon fill="#fbeed6" points={geom.certFrame2.innerPts} />

                <polygon fill="#f2b441" points={geom.certFrame3.outerPts} />
                <polygon fill="#fbeed6" points={geom.certFrame3.innerPts} />

                <polygon className="rl-face-desk-top" points={geom.certShelf.top} />
                <polygon className="rl-face-desk-left" points={geom.certShelf.left} />
                <polygon className="rl-face-desk-right" points={geom.certShelf.right} />
              </g>
              <path
                className="rl-piece__outline"
                pathLength={1}
                d={`${geom.certFrame1.outlinePath} ${geom.certFrame2.outlinePath} ${geom.certFrame3.outlinePath} ${geom.certShelf.outlinePath}`}
              />
            </g>
          </svg>
        </div>

        <div className="room-loader__meta">
          <h1 className="room-loader__name">Abhinav</h1>
          <p className="room-loader__role">Full-Stack &amp; UI Engineer</p>

          <div className="room-loader__status-row">
            <span className="room-loader__status-label">{statusText}</span>
            <span className="room-loader__status-pct">{displayProgress}%</span>
          </div>

          {showSlowNote && phase === 'loading' && (
            <p className="room-loader__slow-note">
              Still building. Slow connections take a little longer.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default RoomLoader;
