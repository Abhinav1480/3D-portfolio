import React, {
  Component,
  ErrorInfo,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { PALETTE, injectPaletteCssVars } from './config/palette';
import { SCREEN_SPECS, ScreenId, TOUR_CAMERA_STOPS } from './config/layout';
import {
  DEFAULT_FOV_DEG,
  DEFAULT_SAFE_AREA,
  OVERVIEW_BASE_POS,
  SafeAreaInsets,
  computeScreenFocusDistance,
  computeTvProjectedCapHeightPx,
} from './config/cameraStops';
import {
  CERTIFICATES,
  hasOpenedAnyCertificate,
  hasShownExploreHintInSession,
  hasShownShelfHintInSession,
  markCertificateOpenedInSession,
  markExploreHintShownInSession,
  markShelfHintShownInSession,
} from './data/certificates';
import { CameraRig, CameraRigApi, PortfolioMode, SavedCameraPose } from './camera/CameraRig';
import { FlightController } from './camera/flights';
import { SCREEN_CONTRAST_REPORT, ScreenTextureController } from './screens/ScreenTexture';
import { HitActionType } from './screens/hitRegions';
import { Room } from './scene/Room';
import {
  CertificateRect,
  WALL_CERT_TEXTURE_DIAGNOSTICS,
  WallCertTextureDiagnostic,
} from './scene/Props';
import { PORTFOLIO_CONTENT } from './data/content';
import { LightDebugState } from './scene/Lights';
import { RoomLoader } from './ui/RoomLoader';
import { Nav } from './ui/Nav';
import { HUD } from './ui/HUD';
import { SectionOverlay } from './ui/SectionOverlay';
import { CertificateViewer } from './ui/CertificateViewer';
import { ContactPanel, ContactPanelState } from './ui/ContactPanel';
import {
  getGuitarAudioContextState,
  installGlobalAudioPriming,
  isMuted,
  playTestTone,
  setMuted,
  subscribeGuitarAudioToast,
  subscribeGuitarSoundMuted,
} from './audio/guitar';

gsap.registerPlugin(ScrollTrigger);

// 6 stops (0..5): Overview, About, Projects, Experience & Roles, Certificates, Contact
const STOP_NAMES = [
  'Overview',
  'About (Laptop)',
  'Projects (Monitor 2)',
  'Experience & Roles (Monitor 3)',
  'Certificates (Shelf)',
  'Contact (Phone)',
] as const;

const SCREEN_BY_STOP: Record<number, ScreenId | undefined> = {
  1: 'about',
  2: 'projects',
  3: 'experience',
  5: 'contact',
};

const STOP_BY_SCREEN: Record<ScreenId, number> = {
  about: 1,
  skills: 1,
  projects: 2,
  experience: 3,
  contact: 5,
};

interface SavedInteractionAndCameraState {
  pose: SavedCameraPose | null;
  mode: PortfolioMode;
  activeStopIndex: number;
  scrollProgress: number;
  focusedScreenId: ScreenId | null;
}

function copyTextWithFallback(text: string): void {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {
      fallbackTextareaCopy(text);
    });
    return;
  }
  fallbackTextareaCopy(text);
}

function fallbackTextareaCopy(text: string): void {
  if (typeof document === 'undefined') return;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', 'true');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.top = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {
    // ignore
  }
}

function openExternalLinkInNewTab(url: string): void {
  if (typeof document === 'undefined') return;
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

function detectWebGLSupport(): { supported: boolean; isSoftwareGl: boolean } {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGLRenderingContext | null) ||
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return { supported: false, isSoftwareGl: false };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    const isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return { supported: true, isSoftwareGl };
  } catch {
    return { supported: false, isSoftwareGl: false };
  }
}

interface CanvasErrorBoundaryProps {
  onErrorFallback: (reason: string) => void;
  children: ReactNode;
}

class CanvasErrorBoundary extends Component<CanvasErrorBoundaryProps, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.onErrorFallback(error.message || 'WebGL rendering error');
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const ADAPTIVE_DPR_STEPS = [2.0, 1.75, 1.5, 1.25, 1.0] as const;
const FRAME_RING_SIZE = 120;
// Pre-allocated module-scope Float32Arrays — zero per-frame allocations
const _frameTimeRing = new Float32Array(FRAME_RING_SIZE);
const _frameTimeScratch = new Float32Array(FRAME_RING_SIZE);
const _prevCamPos = new THREE.Vector3();
const _prevCamQuat = new THREE.Quaternion();

function computeBaseTargetDpr(isMobileViewport: boolean): number {
  if (typeof window === 'undefined') return 1.5;
  const rawDpr = window.devicePixelRatio || 1;
  if (isMobileViewport) {
    // Mobile (width <= 768): maximum 1.5, minimum 1.0
    const clamped = THREE.MathUtils.clamp(rawDpr, 1.25, 1.5);
    return clamped >= 1.375 ? 1.5 : 1.25;
  }
  // Desktop: Base target pixel ratio = clamp(window.devicePixelRatio, 1.5, 2)
  const clamped = THREE.MathUtils.clamp(rawDpr, 1.5, 2.0);
  if (clamped >= 1.875) return 2.0;
  if (clamped >= 1.625) return 1.75;
  return 1.5;
}

function computeP95NoAlloc(count: number): number {
  if (count <= 0) return 16.6;
  for (let i = 0; i < count; i++) {
    _frameTimeScratch[i] = _frameTimeRing[i];
  }
  // In-place insertion sort on pre-allocated scratch array (zero allocations)
  for (let i = 1; i < count; i++) {
    const val = _frameTimeScratch[i];
    let j = i - 1;
    while (j >= 0 && _frameTimeScratch[j] > val) {
      _frameTimeScratch[j + 1] = _frameTimeScratch[j];
      j--;
    }
    _frameTimeScratch[j + 1] = val;
  }
  const idx = Math.min(count - 1, Math.floor(count * 0.95));
  return _frameTimeScratch[idx];
}

export interface TextureParamSummary {
  found: boolean;
  name: string;
  anisotropy: number;
  minFilter: string;
  magFilter: string;
  generateMipmaps: boolean;
  colorSpace: string;
  width: number;
  height: number;
}

export interface RenderDiagnosticsSnapshot {
  timestampLabel: string;
  a_pixelRatio: {
    found: string;
    glPixelRatio: number;
    windowDevicePixelRatio: number;
    canvasWidth: number;
    canvasHeight: number;
    clientWidth: number;
    clientHeight: number;
    widthRatio: number;
    heightRatio: number;
    ratiosMatch: boolean;
  };
  b_adaptiveDpr: {
    found: string;
    activeDpr: number;
    adaptiveStepDpr: number;
    baseTargetDpr: number;
    maxAllowedDpr: number;
    minNormalDpr: number;
    progressiveRefinementAtRest: boolean;
    restIdleMs: number;
    p95FrameMs: number;
    above28Sec: number;
    below14Sec: number;
    above40Sec: number;
    whatLoweredIt: string;
  };
  c_antialiasing: {
    webglAntialias: string;
    effectComposer: string;
    multisampling: string;
    smaa: string;
  };
  d_textures: {
    maxRendererAnisotropy: number;
    floor: TextureParamSummary;
    wall: TextureParamSummary;
    frame: TextureParamSummary;
    screen: TextureParamSummary;
    phone: TextureParamSummary;
  };
  e_cssDom: {
    filterOnCanvasOrParents: string;
    backdropFilterOnCanvasOrParents: string;
    transformScaleOnCanvasOrParents: string;
    imageRendering: string;
    opacityBelowOneOnCanvasOrParents: string;
    semiTransparentFullViewportOverlay: string;
  };
  f_wallCertificates: WallCertTextureDiagnostic[];
}

function filterConstToName(filterVal: number): string {
  if (filterVal === THREE.LinearMipmapLinearFilter) return 'LinearMipmapLinearFilter';
  if (filterVal === THREE.LinearFilter) return 'LinearFilter';
  if (filterVal === THREE.NearestFilter) return 'NearestFilter';
  return String(filterVal);
}

interface RenderQualityManagerProps {
  isMobile: boolean;
  renderDiagOpen: boolean;
  controllers: Record<ScreenId, ScreenTextureController>;
  scrollProgressRef: React.MutableRefObject<number>;
  isFlyingRef: React.MutableRefObject<boolean>;
  onDprChange: (nextDpr: number) => void;
  onDiagnosticsUpdate: (snap: RenderDiagnosticsSnapshot) => void;
}

/**
 * Step 1 & Step 2:
 * - Supersampling with progressive refinement (base DPR = clamp(devicePixelRatio, 1.5, 2.0),
 *   300 ms after camera stops -> raises to maxAllowed (2.0 desktop, 1.5 mobile) with updateStyle=false,
 *   drops back immediately on motion start).
 * - Hysteresis adaptive DPR steps [2.0, 1.75, 1.5, 1.25, 1.0]:
 *   step down by 1 only after p95 > 28 ms for 3 s; step up by 1 after p95 < 14 ms for 5 s;
 *   never below 1.25 unless p95 > 40 ms for 3 s. Zero per-frame allocations.
 * - Ensures all scene color textures have anisotropy = min(16, maxAnisotropy), trilinear mipmaps, SRGBColorSpace.
 * - ResizeObserver on canvas parent calling setPixelRatio and setSize(w, h, false).
 * - Prints STEP 1 diagnostic report once after load and again after 3 seconds.
 */
const RenderQualityManager: React.FC<RenderQualityManagerProps> = ({
  isMobile,
  renderDiagOpen,
  controllers,
  scrollProgressRef,
  isFlyingRef,
  onDprChange,
  onDiagnosticsUpdate,
}) => {
  const { gl, scene, camera } = useThree();

  const stateRef = useRef({
    adaptiveDpr: computeBaseTargetDpr(isMobile),
    activeDpr: isMobile ? 1.5 : 2.0,
    baseTargetDpr: computeBaseTargetDpr(isMobile),
    maxAllowedDpr: isMobile ? 1.5 : 2.0,
    minNormalDpr: isMobile ? 1.0 : 1.25,
    minSevereDpr: 1.0,
    isAtRest: true,
    restTimerSec: 0.3,
    prevScrollProgress: 0,
    ringIdx: 0,
    ringCount: 0,
    p95Ms: 12.0,
    above28Sec: 0,
    below14Sec: 0,
    above40Sec: 0,
    whatLoweredIt: 'not found (holding target step)',
    camInitialized: false,
    uiSyncTimerSec: 0,
  });

  const applyPixelRatioToRenderer = useCallback(
    (nextRatio: number) => {
      const s = stateRef.current;
      s.activeDpr = nextRatio;
      const canvasEl = gl.domElement;
      const parentEl = canvasEl.parentElement;
      const clientW = Math.max(1, parentEl ? parentEl.clientWidth : canvasEl.clientWidth || window.innerWidth);
      const clientH = Math.max(1, parentEl ? parentEl.clientHeight : canvasEl.clientHeight || window.innerHeight);

      if (gl.getPixelRatio() !== nextRatio) {
        gl.setPixelRatio(nextRatio);
      }
      const targetBufW = Math.round(clientW * nextRatio);
      const targetBufH = Math.round(clientH * nextRatio);
      if (canvasEl.width !== targetBufW || canvasEl.height !== targetBufH) {
        gl.setSize(clientW, clientH, false);
      }
      canvasEl.style.width = '100%';
      canvasEl.style.height = '100%';
      canvasEl.style.display = 'block';
      canvasEl.style.imageRendering = 'auto';
      onDprChange(nextRatio);
    },
    [gl, onDprChange]
  );

  // Sync mobile/desktop bounds and ResizeObserver on the canvas container
  useEffect(() => {
    const s = stateRef.current;
    s.baseTargetDpr = computeBaseTargetDpr(isMobile);
    s.maxAllowedDpr = isMobile ? 1.5 : 2.0;
    s.minNormalDpr = isMobile ? 1.0 : 1.25;
    s.adaptiveDpr = THREE.MathUtils.clamp(s.adaptiveDpr, s.minNormalDpr, s.maxAllowedDpr);
    const targetNow = s.isAtRest ? s.maxAllowedDpr : s.adaptiveDpr;
    applyPixelRatioToRenderer(targetNow);

    const canvasEl = gl.domElement;
    const observeTarget = canvasEl.parentElement || canvasEl;
    if (typeof ResizeObserver === 'undefined') return;

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, Math.round(entry.contentRect.width));
        const h = Math.max(1, Math.round(entry.contentRect.height));
        const ratio = stateRef.current.activeDpr;
        gl.setPixelRatio(ratio);
        gl.setSize(w, h, false);
        canvasEl.style.width = '100%';
        canvasEl.style.height = '100%';
        canvasEl.style.display = 'block';
        canvasEl.style.imageRendering = 'auto';
      }
    });
    ro.observe(observeTarget);
    return () => ro.disconnect();
  }, [gl, isMobile, applyPixelRatioToRenderer]);

  // Enforce anisotropy = min(16, renderer.capabilities.getMaxAnisotropy()), mipmaps, and SRGBColorSpace on all scene color textures
  const syncSceneTexturesAndBuildDiagnostics = useCallback(
    (label: string): RenderDiagnosticsSnapshot => {
      const maxAniso = Math.min(16, Math.max(1, gl.capabilities.getMaxAnisotropy() || 16));
      Object.values(controllers).forEach((ctrl) => ctrl.syncMaxAnisotropy(maxAniso));

      const emptyTexSummary = (defaultName: string): TextureParamSummary => ({
        found: false,
        name: defaultName,
        anisotropy: maxAniso,
        minFilter: 'LinearMipmapLinearFilter',
        magFilter: 'LinearFilter',
        generateMipmaps: true,
        colorSpace: THREE.SRGBColorSpace,
        width: 0,
        height: 0,
      });

      let floorSummary = emptyTexSummary('floor-wood-grain-2048');
      let wallSummary = emptyTexSummary('wall-matte-plaster-1024');
      let frameSummary = emptyTexSummary('wall-cert-frame');
      let screenSummary = emptyTexSummary('screen-about-1536x864');
      let phoneSummary = emptyTexSummary('phone-contact-720x1560');

      const inspectAndConfigureTex = (tex: THREE.Texture | null | undefined, meshName: string) => {
        if (!tex) return;
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = maxAniso;
        tex.generateMipmaps = true;
        tex.minFilter = THREE.LinearMipmapLinearFilter;
        tex.magFilter = THREE.LinearFilter;

        const img = tex.image as { width?: number; height?: number } | undefined;
        const w = img?.width ?? 0;
        const h = img?.height ?? 0;
        const summary: TextureParamSummary = {
          found: true,
          name: tex.name || meshName || 'texture',
          anisotropy: tex.anisotropy,
          minFilter: filterConstToName(tex.minFilter),
          magFilter: filterConstToName(tex.magFilter),
          generateMipmaps: tex.generateMipmaps,
          colorSpace: tex.colorSpace,
          width: w,
          height: h,
        };

        const cat = tex.userData?.category as string | undefined;
        if (cat === 'floor' || tex.name.includes('floor') || meshName.includes('Floor')) {
          floorSummary = summary;
        } else if (cat === 'wall' || tex.name.includes('wall-matte') || meshName.includes('Wall')) {
          wallSummary = summary;
        } else if (cat === 'phone' || tex.name.includes('phone')) {
          phoneSummary = summary;
        } else if (cat === 'screen' || tex.name.includes('screen-')) {
          screenSummary = summary;
        } else if (cat === 'frame' || tex.name.includes('cert') || tex.name.includes('art')) {
          if (!frameSummary.found || tex.name.includes('wall-cert-')) {
            frameSummary = summary;
          }
        }
      };

      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh || !mesh.material) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.map) inspectAndConfigureTex(std.map, mesh.name);
          if (std.emissiveMap && std.emissiveMap !== std.map) {
            inspectAndConfigureTex(std.emissiveMap, mesh.name);
          }
        }
      });

      const canvasEl = gl.domElement;
      const clientW = Math.max(1, canvasEl.clientWidth || window.innerWidth);
      const clientH = Math.max(1, canvasEl.clientHeight || window.innerHeight);
      const glRatio = Number(gl.getPixelRatio().toFixed(2));
      const widthRatio = Number((canvasEl.width / clientW).toFixed(2));
      const heightRatio = Number((canvasEl.height / clientH).toFixed(2));

      // Inspect canvas and ancestors for softening CSS
      let hasFilter = false;
      let hasBackdropFilter = false;
      let hasTransformScale = false;
      let hasOpacityBelowOne = false;
      let curEl: HTMLElement | null = canvasEl;
      while (curEl && typeof window !== 'undefined') {
        const cs = window.getComputedStyle(curEl);
        if (cs.filter && cs.filter !== 'none') hasFilter = true;
        if (
          (cs as unknown as Record<string, string>).backdropFilter &&
          (cs as unknown as Record<string, string>).backdropFilter !== 'none'
        ) {
          hasBackdropFilter = true;
        }
        if (cs.transform && cs.transform !== 'none' && !cs.transform.includes('matrix(1, 0, 0, 1')) {
          hasTransformScale = true;
        }
        if (cs.opacity && Number(cs.opacity) < 1) {
          hasOpacityBelowOne = true;
        }
        curEl = curEl.parentElement;
      }

      const glAttrs = gl.getContext()?.getContextAttributes?.();
      const antialiasEnabled = Boolean(glAttrs?.antialias ?? true);
      const s = stateRef.current;

      const certList: WallCertTextureDiagnostic[] = [0, 1, 2].map(
        (idx) =>
          WALL_CERT_TEXTURE_DIAGNOSTICS[idx] ?? {
            id: `cert-${idx + 1}`,
            title: `Wall Certificate ${idx + 1}`,
            width: 1536,
            height: 1086,
            anisotropy: maxAniso,
            memoryBytesEstimate: Math.round(1536 * 1086 * 4 * 1.33),
          }
      );

      const snapshot: RenderDiagnosticsSnapshot = {
        timestampLabel: label,
        a_pixelRatio: {
          found: 'found',
          glPixelRatio: glRatio,
          windowDevicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
          canvasWidth: canvasEl.width,
          canvasHeight: canvasEl.height,
          clientWidth: clientW,
          clientHeight: clientH,
          widthRatio,
          heightRatio,
          ratiosMatch:
            Math.abs(widthRatio - glRatio) <= 0.02 && Math.abs(heightRatio - glRatio) <= 0.02,
        },
        b_adaptiveDpr: {
          found: 'found',
          activeDpr: s.activeDpr,
          adaptiveStepDpr: s.adaptiveDpr,
          baseTargetDpr: s.baseTargetDpr,
          maxAllowedDpr: s.maxAllowedDpr,
          minNormalDpr: s.minNormalDpr,
          progressiveRefinementAtRest: s.isAtRest,
          restIdleMs: Math.round(s.restTimerSec * 1000),
          p95FrameMs: Number(s.p95Ms.toFixed(2)),
          above28Sec: Number(s.above28Sec.toFixed(2)),
          below14Sec: Number(s.below14Sec.toFixed(2)),
          above40Sec: Number(s.above40Sec.toFixed(2)),
          whatLoweredIt: s.whatLoweredIt,
        },
        c_antialiasing: {
          webglAntialias: antialiasEnabled
            ? 'found (WebGLRenderer antialias: true, native MSAA active)'
            : 'not found',
          effectComposer: 'not found (no EffectComposer; rendering directly with native MSAA)',
          multisampling: 'not found (N/A — no EffectComposer)',
          smaa: 'not found (N/A — no EffectComposer)',
        },
        d_textures: {
          maxRendererAnisotropy: maxAniso,
          floor: floorSummary,
          wall: wallSummary,
          frame: frameSummary,
          screen: screenSummary,
          phone: phoneSummary,
        },
        e_cssDom: {
          filterOnCanvasOrParents: hasFilter ? 'found' : 'not found',
          backdropFilterOnCanvasOrParents: hasBackdropFilter ? 'found' : 'not found',
          transformScaleOnCanvasOrParents: hasTransformScale ? 'found' : 'not found',
          imageRendering: window.getComputedStyle(canvasEl).imageRendering || 'auto',
          opacityBelowOneOnCanvasOrParents: hasOpacityBelowOne ? 'found' : 'not found',
          semiTransparentFullViewportOverlay: 'not found (background gradient is behind canvas)',
        },
        f_wallCertificates: certList,
      };

      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__PORTFOLIO_RENDER_DIAG__ = snapshot;
      }
      onDiagnosticsUpdate(snapshot);
      return snapshot;
    },
    [gl, scene, controllers, onDiagnosticsUpdate]
  );

  // STEP 1: Build diagnostic snapshot once after load and again after 3 seconds
  useEffect(() => {
    const t1 = window.setTimeout(() => {
      syncSceneTexturesAndBuildDiagnostics('initial-load');
    }, 200);

    const t2 = window.setTimeout(() => {
      syncSceneTexturesAndBuildDiagnostics('after-3-seconds');
    }, 3000);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [syncSceneTexturesAndBuildDiagnostics]);

  useFrame((_, delta) => {
    const s = stateRef.current;
    const dt = Math.min(Math.max(delta, 0.001), 0.25);
    const ms = delta * 1000;

    // 1. Record frame delta in pre-allocated ring buffer (zero allocations)
    if (ms > 0 && ms < 250) {
      _frameTimeRing[s.ringIdx] = ms;
      s.ringIdx = (s.ringIdx + 1) % FRAME_RING_SIZE;
      if (s.ringCount < FRAME_RING_SIZE) {
        s.ringCount++;
      }
    }

    if (s.ringCount >= 30) {
      s.p95Ms = computeP95NoAlloc(s.ringCount);

      // Hysteresis timers:
      // - Step down by 1 step only after p95 > 28 ms stays true for 3.0 s
      // - Step up by 1 step only after p95 < 14 ms stays true for 5.0 s
      // - Never go below 1.25 unless p95 > 40 ms stays true for 3.0 s
      if (s.p95Ms > 28) {
        s.above28Sec += dt;
        s.below14Sec = 0;
      } else if (s.p95Ms < 14) {
        s.below14Sec += dt;
        s.above28Sec = 0;
        s.above40Sec = 0;
      } else {
        s.above28Sec = Math.max(0, s.above28Sec - dt * 0.5);
        s.below14Sec = Math.max(0, s.below14Sec - dt * 0.5);
        s.above40Sec = Math.max(0, s.above40Sec - dt * 0.5);
      }

      if (s.p95Ms > 40) {
        s.above40Sec += dt;
      } else {
        s.above40Sec = Math.max(0, s.above40Sec - dt * 0.5);
      }

      const curStepIdx = ADAPTIVE_DPR_STEPS.findIndex(
        (v) => Math.abs(v - s.adaptiveDpr) < 0.05
      );
      const validIdx = curStepIdx >= 0 ? curStepIdx : 2; // default 1.5 index

      if (s.above28Sec >= 3.0) {
        const nextIdx = Math.min(ADAPTIVE_DPR_STEPS.length - 1, validIdx + 1);
        const candidateDpr = ADAPTIVE_DPR_STEPS[nextIdx];
        const floorDpr = s.above40Sec >= 3.0 ? s.minSevereDpr : s.minNormalDpr;
        if (candidateDpr >= floorDpr && candidateDpr < s.adaptiveDpr) {
          s.adaptiveDpr = candidateDpr;
          s.whatLoweredIt =
            s.above40Sec >= 3.0
              ? `p95 (${s.p95Ms.toFixed(1)} ms) > 40 ms for 3s`
              : `p95 (${s.p95Ms.toFixed(1)} ms) > 28 ms for 3s`;
        }
        s.above28Sec = 0;
        s.above40Sec = 0;
      } else if (s.below14Sec >= 5.0) {
        const prevIdx = Math.max(0, validIdx - 1);
        const candidateDpr = Math.min(s.maxAllowedDpr, ADAPTIVE_DPR_STEPS[prevIdx]);
        if (candidateDpr > s.adaptiveDpr) {
          s.adaptiveDpr = candidateDpr;
          if (s.adaptiveDpr >= s.baseTargetDpr) {
            s.whatLoweredIt = 'not found (holding target step)';
          }
        }
        s.below14Sec = 0;
      }
    }

    // 2. Progressive refinement: detect camera motion (tour scroll, flights, orbit/zoom/pan)
    let isMovingNow = isFlyingRef.current;
    const curScroll = scrollProgressRef.current;
    if (Math.abs(curScroll - s.prevScrollProgress) > 1e-5) {
      isMovingNow = true;
    }
    s.prevScrollProgress = curScroll;

    if (!s.camInitialized) {
      _prevCamPos.copy(camera.position);
      _prevCamQuat.copy(camera.quaternion);
      s.camInitialized = true;
    } else {
      const posDeltaSq = camera.position.distanceToSquared(_prevCamPos);
      const quatDot = Math.abs(camera.quaternion.dot(_prevCamQuat));
      // Ignore tiny sub-millimeter pointer parallax micro-tremor (< 1.5 mm) so rest refinement stays locked
      if (posDeltaSq > 2.25e-6 || 1 - quatDot > 2e-6) {
        isMovingNow = true;
      }
      _prevCamPos.copy(camera.position);
      _prevCamQuat.copy(camera.quaternion);
    }

    if (isMovingNow) {
      s.restTimerSec = 0;
      if (s.isAtRest || Math.abs(s.activeDpr - s.adaptiveDpr) > 0.01) {
        s.isAtRest = false;
        applyPixelRatioToRenderer(s.adaptiveDpr);
      }
    } else {
      s.restTimerSec += dt;
      if (s.restTimerSec >= 0.3) {
        if (!s.isAtRest || Math.abs(s.activeDpr - s.maxAllowedDpr) > 0.01) {
          s.isAtRest = true;
          applyPixelRatioToRenderer(s.maxAllowedDpr);
        }
      }
    }

    // Periodically refresh diagnostic snapshot only when Q-key overlay is open (every 0.5 s)
    if (renderDiagOpen) {
      s.uiSyncTimerSec += dt;
      if (s.uiSyncTimerSec >= 0.5) {
        s.uiSyncTimerSec = 0;
        syncSceneTexturesAndBuildDiagnostics('live');
      }
    }
  });

  return null;
};

export function App() {
  useEffect(() => {
    injectPaletteCssVars();
    THREE.ColorManagement.enabled = true;
  }, []);

  const renderCountRef = useRef(0);
  renderCountRef.current += 1;

  const [{ supported: webglSupported, isSoftwareGl }] = useState(() => detectWebGLSupport());
  const [webglError, setWebglError] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth <= 768 : false
  );
  // Step 2.1: Start at base target DPR = clamp(window.devicePixelRatio, 1.5, 2.0) (or 1.5 max on mobile)
  const [dpr, setDpr] = useState<number>(() =>
    computeBaseTargetDpr(typeof window !== 'undefined' ? window.innerWidth <= 768 : false)
  );
  const [renderDiagOpen, setRenderDiagOpen] = useState(false);
  const [renderDiagSnapshot, setRenderDiagSnapshot] = useState<RenderDiagnosticsSnapshot | null>(
    null
  );

  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );

  const [debugFreeCam] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === 'cam';
  });

  const [tabHidden, setTabHidden] = useState(false);
  const [loaderDone, setLoaderDone] = useState(false);

  // Refs owned by ScrollTrigger / Lenis / CameraRig (updated at 60fps without React re-renders)
  const scrollProgressRef = useRef(0);
  const modeRef = useRef<PortfolioMode>('TOUR');
  const previousModeBeforeFocusRef = useRef<'TOUR' | 'EXPLORE'>('TOUR');
  const focusedStopRef = useRef<number | null>(null);
  const isFlyingRef = useRef(false);
  const flightController = useMemo(() => new FlightController(), []);
  const lenisRef = useRef<Lenis | null>(null);
  const rigApiRef = useRef<CameraRigApi | null>(null);
  const exposureCalibratorRef = useRef<(() => void) | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const canvasWrapperRef = useRef<HTMLDivElement | null>(null);

  // Saved exact camera & interaction state before opening any sub-view (screen focus, phone contact panel, certificate viewer)
  const savedStateBeforeFocusRef = useRef<SavedInteractionAndCameraState | null>(null);
  const savedStateBeforeContactRef = useRef<SavedInteractionAndCameraState | null>(null);
  const savedStateBeforeCertRef = useRef<SavedInteractionAndCameraState | null>(null);

  // Coarse UI state
  const [mode, setModeState] = useState<PortfolioMode>('TOUR');
  const [activeStopIndex, setActiveStopIndex] = useState(0);
  const activeStopIndexRef = useRef(0);
  activeStopIndexRef.current = activeStopIndex;
  const [nearFactor, setNearFactor] = useState(1);
  const [focusedScreenId, setFocusedScreenId] = useState<ScreenId | null>(null);
  const focusedScreenIdRef = useRef<ScreenId | null>(null);
  focusedScreenIdRef.current = focusedScreenId;
  const [focusedPage, setFocusedPage] = useState(0);
  const [hoveredScreenInfo, setHoveredScreenInfo] = useState<{
    screenId: ScreenId;
    label: string;
  } | null>(null);
  const [hoveredCertificateInfo, setHoveredCertificateInfo] = useState<{
    index: number;
    title: string;
  } | null>(null);
  const [hoveredGuitar, setHoveredGuitar] = useState(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(() => isMuted());
  const [guitarAudioToast, setGuitarAudioToast] = useState<string | null>(null);
  const guitarToastTimerRef = useRef<number | null>(null);
  const playGuitarTriggerRef = useRef<(() => void) | null>(null);

  // Phone Contact Panel state ('closed' | 'opening' | 'open' | 'closing')
  const [contactPanelState, setContactPanelState] = useState<ContactPanelState>('closed');
  const contactPanelStateRef = useRef<ContactPanelState>('closed');
  contactPanelStateRef.current = contactPanelState;
  const phoneRectGetterRef = useRef<(() => CertificateRect | null) | null>(null);

  const registerPhoneRectGetter = useCallback((getter: () => CertificateRect | null) => {
    phoneRectGetterRef.current = getter;
  }, []);

  const getPhoneProjectedRect = useCallback((): CertificateRect | null => {
    return phoneRectGetterRef.current ? phoneRectGetterRef.current() : null;
  }, []);

  // Auto-advance hint state in TOUR mode ("Auto-advance in 3s" after 6s of inactivity)
  const [showAutoAdvanceHint, setShowAutoAdvanceHint] = useState(false);
  const lastUserActivityMsRef = useRef<number>(
    typeof performance !== 'undefined' ? performance.now() : Date.now()
  );

  useEffect(() => {
    installGlobalAudioPriming();
    const unsubMute = subscribeGuitarSoundMuted((muted) => {
      setSoundMuted(muted);
    });
    const unsubToast = subscribeGuitarAudioToast((msg) => {
      setGuitarAudioToast(msg);
      if (guitarToastTimerRef.current !== null) {
        window.clearTimeout(guitarToastTimerRef.current);
      }
      guitarToastTimerRef.current = window.setTimeout(() => {
        guitarToastTimerRef.current = null;
        setGuitarAudioToast(null);
      }, 2000);
    });
    return () => {
      unsubMute();
      unsubToast();
      if (guitarToastTimerRef.current !== null) {
        window.clearTimeout(guitarToastTimerRef.current);
      }
    };
  }, []);

  const [hasScrolled, setHasScrolled] = useState(false);
  const [hudMinimized, setHudMinimized] = useState(false);
  const [safeArea, setSafeArea] = useState<SafeAreaInsets>(DEFAULT_SAFE_AREA);
  const [lightDebugOpen, setLightDebugOpen] = useState(false);
  const [lightDebug, setLightDebug] = useState<LightDebugState>({
    environment: true,
    hemisphere: true,
    ambient: true,
    moon: true,
    lamps: true,
    backglow: true,
    emissives: true,
    exposure: 0.95,
  });

  // One-Time Bookshelf Certificate Hint Chip state (shown at most once per session)
  const [showShelfHintChip, setShowShelfHintChip] = useState(false);
  const shelfHintTimerRef = useRef<number | null>(null);

  const dismissShelfHintChip = useCallback(() => {
    if (shelfHintTimerRef.current !== null) {
      window.clearTimeout(shelfHintTimerRef.current);
      shelfHintTimerRef.current = null;
    }
    setShowShelfHintChip(false);
  }, []);

  // One-Time EXPLORE Mode Hint Chip state (shown at most once per session in EXPLORE mode)
  const [showExploreHintChip, setShowExploreHintChip] = useState(false);
  const exploreHintTimerRef = useRef<number | null>(null);

  const dismissExploreHintChip = useCallback(() => {
    if (exploreHintTimerRef.current !== null) {
      window.clearTimeout(exploreHintTimerRef.current);
      exploreHintTimerRef.current = null;
    }
    setShowExploreHintChip(false);
  }, []);

  // Certificate Viewer state
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const viewerIndexRef = useRef<number | null>(null);
  viewerIndexRef.current = viewerIndex;
  const [viewerOriginRect, setViewerOriginRect] = useState<CertificateRect | null>(null);
  const [isFlyingState, setIsFlyingState] = useState(false);
  const viewerTriggerElRef = useRef<HTMLElement | null>(null);
  const certRectGettersRef = useRef<Record<number, () => CertificateRect | null>>({});

  const registerCertificateRectGetter = useCallback(
    (index: number, getter: () => CertificateRect | null) => {
      certRectGettersRef.current[index] = getter;
    },
    []
  );

  const getProjectedRectForCertificate = useCallback(
    (index: number): CertificateRect | null => {
      const fn = certRectGettersRef.current[index];
      return fn ? fn() : null;
    },
    []
  );

  const captureCurrentCameraAndInteractionState =
    useCallback((): SavedInteractionAndCameraState => {
      return {
        pose: rigApiRef.current?.getCurrentCameraPose() ?? null,
        mode: modeRef.current,
        activeStopIndex: activeStopIndexRef.current,
        scrollProgress: scrollProgressRef.current,
        focusedScreenId: focusedScreenIdRef.current,
      };
    }, []);

  // Trigger the one-time bookshelf hint chip at the Overview or Certificates view in TOUR mode
  useEffect(() => {
    if (!loaderDone) return;

    const isEligibleStop =
      mode === 'TOUR' && (activeStopIndex === 0 || activeStopIndex === 4);

    if (
      !isEligibleStop ||
      viewerIndex !== null ||
      contactPanelState !== 'closed'
    ) {
      if (showShelfHintChip) {
        dismissShelfHintChip();
      }
      return;
    }

    if (!hasShownShelfHintInSession() && !hasOpenedAnyCertificate()) {
      markShelfHintShownInSession();
      setShowShelfHintChip(true);
      if (shelfHintTimerRef.current !== null) {
        window.clearTimeout(shelfHintTimerRef.current);
      }
      shelfHintTimerRef.current = window.setTimeout(() => {
        shelfHintTimerRef.current = null;
        setShowShelfHintChip(false);
      }, 6000);
    }
  }, [
    loaderDone,
    mode,
    activeStopIndex,
    viewerIndex,
    contactPanelState,
    showShelfHintChip,
    dismissShelfHintChip,
  ]);

  // Trigger the one-time EXPLORE mode hint chip when entering EXPLORE mode
  useEffect(() => {
    if (!loaderDone) return;

    if (mode !== 'EXPLORE' || viewerIndex !== null || contactPanelState !== 'closed') {
      if (showExploreHintChip) {
        dismissExploreHintChip();
      }
      return;
    }

    if (!hasShownExploreHintInSession()) {
      markExploreHintShownInSession();
      setShowExploreHintChip(true);
      if (exploreHintTimerRef.current !== null) {
        window.clearTimeout(exploreHintTimerRef.current);
      }
      exploreHintTimerRef.current = window.setTimeout(() => {
        exploreHintTimerRef.current = null;
        setShowExploreHintChip(false);
      }, 6000);
    }
  }, [
    loaderDone,
    mode,
    viewerIndex,
    contactPanelState,
    showExploreHintChip,
    dismissExploreHintChip,
  ]);

  useEffect(() => {
    return () => {
      if (shelfHintTimerRef.current !== null) {
        window.clearTimeout(shelfHintTimerRef.current);
      }
      if (exploreHintTimerRef.current !== null) {
        window.clearTimeout(exploreHintTimerRef.current);
      }
    };
  }, []);

  // Clear hover tooltip, reset native cursor to default, and update Lenis scroll state on any mode change
  const setMode = useCallback(
    (next: PortfolioMode) => {
      const prev = modeRef.current;
      modeRef.current = next;
      setModeState(next);
      setHoveredScreenInfo(null);
      setHoveredCertificateInfo(null);
      setShowAutoAdvanceHint(false);
      lastUserActivityMsRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'default';
      }
      if (prev !== next) {
        dismissShelfHintChip();
        if (next !== 'EXPLORE') {
          dismissExploreHintChip();
        }
      }
      if (
        next === 'EXPLORE' ||
        viewerIndexRef.current !== null ||
        contactPanelStateRef.current !== 'closed'
      ) {
        lenisRef.current?.stop();
      } else {
        lenisRef.current?.start();
      }
    },
    [dismissShelfHintChip, dismissExploreHintChip]
  );

  // Open Certificate Viewer from 3D Wall Frame, 3D Shelf Book, Plaque, HUD button, Hint Chip, or keyboard
  const handleOpenCertificate = useCallback(
    (
      index: number,
      originRect: CertificateRect | null = null,
      triggerEl: HTMLElement | null = null
    ) => {
      if (
        !triggerEl &&
        (isFlyingRef.current ||
          modeRef.current === 'FOCUSED' ||
          viewerIndexRef.current !== null ||
          contactPanelStateRef.current !== 'closed')
      ) {
        return;
      }

      // Capture exact prior camera and interaction state before opening viewer
      if (viewerIndexRef.current === null) {
        savedStateBeforeCertRef.current = captureCurrentCameraAndInteractionState();
      }

      flightController.kill();
      rigApiRef.current?.cancelPoseTween();
      isFlyingRef.current = false;
      setIsFlyingState(false);

      const clampedIndex =
        ((index % CERTIFICATES.length) + CERTIFICATES.length) % CERTIFICATES.length;
      viewerTriggerElRef.current =
        triggerEl ??
        (document.activeElement instanceof HTMLElement ? document.activeElement : null);

      const resolvedRect = originRect ?? getProjectedRectForCertificate(clampedIndex);
      setHoveredScreenInfo(null);
      setHoveredCertificateInfo(null);
      setShowAutoAdvanceHint(false);
      dismissShelfHintChip();
      dismissExploreHintChip();
      markCertificateOpenedInSession();

      lenisRef.current?.stop();
      if (typeof document !== 'undefined') {
        document.body.style.overflow = 'hidden';
        document.body.style.cursor = 'default';
      }

      setViewerOriginRect(resolvedRect);
      setViewerIndex(clampedIndex);
    },
    [
      captureCurrentCameraAndInteractionState,
      dismissShelfHintChip,
      dismissExploreHintChip,
      flightController,
      getProjectedRectForCertificate,
    ]
  );

  // Close Certificate Viewer and smoothly restore the exact prior camera and interaction state
  const handleCloseCertificateImmediate = useCallback(() => {
    const saved = savedStateBeforeCertRef.current;
    savedStateBeforeCertRef.current = null;

    try {
      setViewerIndex(null);
      setViewerOriginRect(null);
      setHoveredScreenInfo(null);
      setHoveredCertificateInfo(null);
      setShowAutoAdvanceHint(false);
      lastUserActivityMsRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      dismissShelfHintChip();
      markCertificateOpenedInSession();

      if (saved) {
        scrollProgressRef.current = saved.scrollProgress;
        setActiveStopIndex(saved.activeStopIndex);
        if (saved.pose && rigApiRef.current) {
          if (saved.mode === 'EXPLORE') {
            rigApiRef.current.syncOrbitTargetToCurrent(saved.pose);
          } else {
            rigApiRef.current.flyToPose(saved.pose, 0.35);
          }
        }
        setMode(saved.mode);
      }
    } finally {
      if (typeof document !== 'undefined') {
        document.body.style.overflow = '';
        document.body.style.cursor = 'default';
      }
      if (modeRef.current !== 'EXPLORE' && contactPanelStateRef.current === 'closed') {
        lenisRef.current?.start();
      }
      const triggerEl = viewerTriggerElRef.current;
      viewerTriggerElRef.current = null;
      if (triggerEl && typeof triggerEl.focus === 'function') {
        try {
          triggerEl.focus({ preventScroll: true });
        } catch {
          // ignore
        }
      }
    }
  }, [dismissShelfHintChip, setMode]);

  // Measure real DOM heights of top nav and bottom HUD and the effective 3D canvas viewport
  const measureDomSafeArea = useCallback(() => {
    if (typeof window === 'undefined') return;
    const navEl = document.querySelector('[data-ui-nav="true"]') as HTMLElement | null;
    const hudEl = document.querySelector('[data-ui-hud="true"]') as HTMLElement | null;
    const canvasEl = canvasWrapperRef.current?.querySelector('canvas') ?? canvasWrapperRef.current;

    const navH = navEl ? Math.round(navEl.getBoundingClientRect().height) : 64;
    const hudH = hudEl ? Math.round(hudEl.getBoundingClientRect().height) : hudMinimized ? 36 : 76;

    const topReservedPx = navH + 16;
    const bottomReservedPx = hudH + 16;
    const sideReservedPx = 24;

    const canvasRect = canvasEl ? canvasEl.getBoundingClientRect() : null;
    const viewportW =
      canvasRect && canvasRect.width > 100
        ? Math.round(canvasRect.width)
        : window.innerWidth;
    const viewportH =
      canvasRect && canvasRect.height > 100
        ? Math.round(canvasRect.height)
        : window.innerHeight;

    setSafeArea((prev) => {
      if (
        prev.viewportW === viewportW &&
        prev.viewportH === viewportH &&
        prev.topReservedPx === topReservedPx &&
        prev.bottomReservedPx === bottomReservedPx &&
        prev.sideReservedPx === sideReservedPx
      ) {
        return prev;
      }
      return {
        viewportW,
        viewportH,
        topReservedPx,
        bottomReservedPx,
        sideReservedPx,
      };
    });
  }, [hudMinimized]);

  useEffect(() => {
    measureDomSafeArea();
    const rafId = requestAnimationFrame(measureDomSafeArea);
    return () => cancelAnimationFrame(rafId);
  }, [measureDomSafeArea, hudMinimized]);

  // Create the 5 persistent ScreenTextureControllers once (2048x1152 physical for laptop + 3 monitors, 1080x2340 for phone)
  const controllers = useMemo(() => {
    return {
      about: new ScreenTextureController('about'),
      skills: new ScreenTextureController('skills'),
      projects: new ScreenTextureController('projects'),
      experience: new ScreenTextureController('experience'),
      contact: new ScreenTextureController('contact'),
    };
  }, []);

  useEffect(() => {
    return () => {
      Object.values(controllers).forEach((c) => c.dispose());
    };
  }, [controllers]);

  // Listen for resize, reduced motion, and tab visibility
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      measureDomSafeArea();
    };
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMq = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    const onVis = () => {
      setTabHidden(document.hidden);
      if (document.hidden) {
        document.body.style.cursor = 'default';
      }
    };

    window.addEventListener('resize', onResize);
    mq.addEventListener('change', onMq);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('resize', onResize);
      mq.removeEventListener('change', onMq);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [measureDomSafeArea]);

  // ONE smoother (Lenis) synced to GSAP ScrollTrigger
  useEffect(() => {
    const lenis = new Lenis({
      lerp: 0.08,
      wheelMultiplier: 0.9,
      smoothWheel: true,
      syncTouch: false,
    });
    lenisRef.current = lenis;

    lenis.on('scroll', ScrollTrigger.update);

    const tickerFn = (timeSec: number) => {
      lenis.raf(timeSec * 1000);
    };
    gsap.ticker.add(tickerFn);
    gsap.ticker.lagSmoothing(0);

    const st = ScrollTrigger.create({
      trigger: scrollContainerRef.current || document.body,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => {
        if (
          !isFlyingRef.current &&
          modeRef.current === 'TOUR' &&
          viewerIndexRef.current === null &&
          contactPanelStateRef.current === 'closed'
        ) {
          scrollProgressRef.current = self.progress;
          lastUserActivityMsRef.current =
            typeof performance !== 'undefined' ? performance.now() : Date.now();
        }
      },
    });

    const onFirstWheel = () => {
      setHasScrolled(true);
      lastUserActivityMsRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      setShowAutoAdvanceHint(false);
    };
    window.addEventListener('wheel', onFirstWheel, { passive: true });

    return () => {
      window.removeEventListener('wheel', onFirstWheel);
      st.kill();
      gsap.ticker.remove(tickerFn);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, []);

  // Keep Lenis scroll paused while the preloader is visible, and resume once onDone fires
  useEffect(() => {
    if (!loaderDone) {
      lenisRef.current?.stop();
    } else if (
      modeRef.current !== 'EXPLORE' &&
      viewerIndexRef.current === null &&
      contactPanelStateRef.current === 'closed'
    ) {
      lenisRef.current?.start();
    }
  }, [loaderDone]);

  const syncDomScrollToProgress = useCallback((progress: number) => {
    const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    const targetY = progress * maxScroll;
    if (lenisRef.current) {
      lenisRef.current.scrollTo(targetY, { immediate: true });
    } else {
      window.scrollTo(0, targetY);
    }
  }, []);

  // Cancel any active flight or pose tween cleanly before starting a new transition
  const cancelActiveTransitions = useCallback(() => {
    flightController.kill();
    rigApiRef.current?.cancelPoseTween();
  }, [flightController]);

  // Smooth timed flight (1.2-1.6s ease-in-out) across stops 0..5
  const flyToStop = useCallback(
    (targetStopIndex: number, enterFocusAfter = false, enterExploreAfter = false) => {
      cancelActiveTransitions();

      const clampedIdx = Math.max(0, Math.min(5, targetStopIndex));
      const targetProgress =
        rigApiRef.current?.getStopScrollPosition(clampedIdx) ?? (clampedIdx / 5) * 0.9;
      const startProgress = scrollProgressRef.current;

      isFlyingRef.current = true;
      setIsFlyingState(true);
      setHoveredScreenInfo(null);
      setHoveredCertificateInfo(null);
      setShowAutoAdvanceHint(false);
      lastUserActivityMsRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();

      if (typeof document !== 'undefined') {
        document.body.style.cursor = 'default';
      }
      if (clampedIdx !== 0 && clampedIdx !== 4) {
        dismissShelfHintChip();
      }

      const targetScreen = SCREEN_BY_STOP[clampedIdx];
      if (targetScreen) {
        controllers[targetScreen].triggerWakeReveal(reducedMotion);
      }

      if (!enterFocusAfter && !enterExploreAfter) {
        focusedStopRef.current = null;
        setFocusedScreenId(null);
        setMode('TOUR');
      } else if (enterExploreAfter) {
        focusedStopRef.current = null;
        setFocusedScreenId(null);
      }

      flightController.startFlight(
        startProgress,
        targetProgress,
        (p) => {
          scrollProgressRef.current = p;
        },
        () => {
          isFlyingRef.current = false;
          setIsFlyingState(false);
          scrollProgressRef.current = targetProgress;
          syncDomScrollToProgress(targetProgress);
          setActiveStopIndex(clampedIdx);
          setNearFactor(1);
          setHoveredScreenInfo(null);
          setHoveredCertificateInfo(null);

          if (enterFocusAfter && targetScreen) {
            focusedStopRef.current = clampedIdx;
            setFocusedScreenId(targetScreen);
            setFocusedPage(controllers[targetScreen].getPage());
            setMode('FOCUSED');
          } else if (enterExploreAfter) {
            rigApiRef.current?.syncOrbitTargetToCurrent();
            setMode('EXPLORE');
          }

          exposureCalibratorRef.current?.();
        },
        reducedMotion
      );
    },
    [
      cancelActiveTransitions,
      controllers,
      dismissShelfHintChip,
      flightController,
      reducedMotion,
      setMode,
      syncDomScrollToProgress,
    ]
  );

  //Task 7: Open Phone Contact Panel when the phone is clicked or activated (strictly idempotent)
  const handleOpenContactPanel = useCallback(() => {
    if (
      viewerIndexRef.current !== null ||
      contactPanelStateRef.current !== 'closed' ||
      (modeRef.current === 'FOCUSED' && focusedScreenIdRef.current === 'contact')
    ) {
      return;
    }

    cancelActiveTransitions();

    // 1. Capture exact prior camera and interaction state before mutating focus state
    savedStateBeforeContactRef.current = captureCurrentCameraAndInteractionState();

    // Immediately lock state to 'opening' so repeated/rapid clicks are ignored
    contactPanelStateRef.current = 'opening';
    setContactPanelState('opening');

    setHoveredScreenInfo(null);
    setHoveredCertificateInfo(null);
    setShowAutoAdvanceHint(false);
    dismissShelfHintChip();
    dismissExploreHintChip();
    lenisRef.current?.stop();

    isFlyingRef.current = true;
    setIsFlyingState(true);
    focusedStopRef.current = 5;
    focusedScreenIdRef.current = 'contact';
    setFocusedScreenId('contact');
    setMode('FOCUSED');

    // 2. Smoothly focus the camera on the phone over ~1.15s (ease-in-out) while panel expands outward
    const phoneFocusPose = rigApiRef.current?.getFocusedScreenPose('contact');
    const durationSec = reducedMotion ? 0.12 : 1.15;

    if (phoneFocusPose && rigApiRef.current) {
      rigApiRef.current.flyToPose(phoneFocusPose, durationSec, () => {
        isFlyingRef.current = false;
        setIsFlyingState(false);
      });
    } else {
      isFlyingRef.current = false;
      setIsFlyingState(false);
    }
  }, [
    cancelActiveTransitions,
    captureCurrentCameraAndInteractionState,
    dismissExploreHintChip,
    dismissShelfHintChip,
    reducedMotion,
    setMode,
  ]);

  // Task 7: Close Phone Contact Panel and smoothly restore exact prior camera & interaction state
  const handleRequestCloseContactPanel = useCallback(() => {
    if (
      contactPanelStateRef.current === 'closed' ||
      contactPanelStateRef.current === 'closing'
    ) {
      return;
    }

    cancelActiveTransitions();
    contactPanelStateRef.current = 'closing';
    setContactPanelState('closing');

    const saved = savedStateBeforeContactRef.current;
    savedStateBeforeContactRef.current = null;

    focusedStopRef.current = null;
    focusedScreenIdRef.current = null;
    setFocusedScreenId(null);

    if (!saved) {
      setMode('TOUR');
      return;
    }

    const restoreDuration = reducedMotion ? 0.12 : 1.15;
    if (saved.pose && rigApiRef.current) {
      isFlyingRef.current = true;
      setIsFlyingState(true);
      rigApiRef.current.flyToPose(saved.pose, restoreDuration, () => {
        isFlyingRef.current = false;
        setIsFlyingState(false);
        scrollProgressRef.current = saved.scrollProgress;
        syncDomScrollToProgress(saved.scrollProgress);
        setActiveStopIndex(saved.activeStopIndex);
        if (saved.mode === 'EXPLORE') {
          rigApiRef.current?.syncOrbitTargetToCurrent(saved.pose ?? undefined);
          setMode('EXPLORE');
        } else {
          setMode('TOUR');
        }
      });
    } else {
      scrollProgressRef.current = saved.scrollProgress;
      syncDomScrollToProgress(saved.scrollProgress);
      setActiveStopIndex(saved.activeStopIndex);
      setMode(saved.mode === 'EXPLORE' ? 'EXPLORE' : 'TOUR');
    }
  }, [cancelActiveTransitions, reducedMotion, setMode, syncDomScrollToProgress]);

  const handleContactPanelStateChange = useCallback((nextState: ContactPanelState) => {
    contactPanelStateRef.current = nextState;
    setContactPanelState(nextState);
    if (
      nextState === 'closed' &&
      modeRef.current !== 'EXPLORE' &&
      viewerIndexRef.current === null
    ) {
      lenisRef.current?.start();
    }
  }, []);

  // Focus a monitor or laptop screen (or open Phone Contact Panel if screenId === 'contact')
  const handleFocusScreen = useCallback(
    (screenId: ScreenId) => {
      if (viewerIndexRef.current !== null) return;

      if (screenId === 'contact') {
        handleOpenContactPanel();
        return;
      }

      cancelActiveTransitions();
      setHoveredScreenInfo(null);
      setHoveredCertificateInfo(null);
      setShowAutoAdvanceHint(false);
      dismissShelfHintChip();

      if (modeRef.current !== 'FOCUSED') {
        previousModeBeforeFocusRef.current =
          modeRef.current === 'EXPLORE' ? 'EXPLORE' : 'TOUR';
        savedStateBeforeFocusRef.current = captureCurrentCameraAndInteractionState();
      }

      const stopIdx = STOP_BY_SCREEN[screenId];
      controllers[screenId].triggerWakeReveal(reducedMotion);

      const focusedPose = rigApiRef.current?.getFocusedScreenPose(screenId);
      if (focusedPose && rigApiRef.current) {
        isFlyingRef.current = true;
        setIsFlyingState(true);
        focusedStopRef.current = stopIdx;
        setFocusedScreenId(screenId);
        setFocusedPage(controllers[screenId].getPage());
        setMode('FOCUSED');

        rigApiRef.current.flyToPose(focusedPose, reducedMotion ? 0.12 : 1.15, () => {
          isFlyingRef.current = false;
          setIsFlyingState(false);
          setActiveStopIndex(stopIdx);
          exposureCalibratorRef.current?.();
        });
      } else {
        flyToStop(stopIdx, true, false);
      }
    },
    [
      cancelActiveTransitions,
      captureCurrentCameraAndInteractionState,
      controllers,
      dismissShelfHintChip,
      flyToStop,
      handleOpenContactPanel,
      reducedMotion,
      setMode,
    ]
  );

  // Restore exact prior camera state when exiting a focused screen
  const handleExitFocus = useCallback(() => {
    if (contactPanelStateRef.current !== 'closed') {
      handleRequestCloseContactPanel();
      return;
    }
    if (modeRef.current !== 'FOCUSED') return;

    cancelActiveTransitions();
    setHoveredScreenInfo(null);
    setHoveredCertificateInfo(null);

    const saved = savedStateBeforeFocusRef.current;
    savedStateBeforeFocusRef.current = null;
    const prevMode = saved ? saved.mode : previousModeBeforeFocusRef.current;

    if (saved && saved.pose && rigApiRef.current) {
      isFlyingRef.current = true;
      setIsFlyingState(true);
      rigApiRef.current.flyToPose(saved.pose, reducedMotion ? 0.12 : 1.1, () => {
        isFlyingRef.current = false;
        setIsFlyingState(false);
        focusedStopRef.current = null;
        setFocusedScreenId(null);
        scrollProgressRef.current = saved.scrollProgress;
        syncDomScrollToProgress(saved.scrollProgress);
        setActiveStopIndex(saved.activeStopIndex);
        if (prevMode === 'EXPLORE') {
          rigApiRef.current?.syncOrbitTargetToCurrent(saved.pose ?? undefined);
          setMode('EXPLORE');
        } else {
          setMode('TOUR');
        }
      });
    } else {
      isFlyingRef.current = false;
      setIsFlyingState(false);
      focusedStopRef.current = null;
      setFocusedScreenId(null);
      if (prevMode === 'EXPLORE') {
        rigApiRef.current?.syncOrbitTargetToCurrent();
        setMode('EXPLORE');
      } else {
        setMode('TOUR');
      }
    }
  }, [
    cancelActiveTransitions,
    handleRequestCloseContactPanel,
    reducedMotion,
    setMode,
    syncDomScrollToProgress,
  ]);

  const handleSkipToExplore = useCallback(() => {
    setHoveredScreenInfo(null);
    setHoveredCertificateInfo(null);
    previousModeBeforeFocusRef.current = 'EXPLORE';
    rigApiRef.current?.syncOrbitTargetToCurrent();
    setMode('EXPLORE');
  }, [setMode]);

  const handleBackToTour = useCallback(() => {
    setHoveredScreenInfo(null);
    setHoveredCertificateInfo(null);
    focusedStopRef.current = null;
    setFocusedScreenId(null);
    previousModeBeforeFocusRef.current = 'TOUR';
    rigApiRef.current?.resetExploreOffsetsImmediate();
    setMode('TOUR');
    flyToStop(activeStopIndexRef.current, false, false);
  }, [flyToStop, setMode]);

  const handleResetExploreView = useCallback(() => {
    if (modeRef.current !== 'EXPLORE') return;
    rigApiRef.current?.resetExploreView(1.0);
  }, []);

  const handlePrevStop = useCallback(() => {
    const prevIdx = Math.max(0, activeStopIndexRef.current - 1);
    flyToStop(prevIdx, false, false);
  }, [flyToStop]);

  const handleNextStop = useCallback(() => {
    const nextIdx = Math.min(5, activeStopIndexRef.current + 1);
    flyToStop(nextIdx, false, false);
  }, [flyToStop]);

  // Task 1: Auto-advance hint ("Auto-advance in 3s" after 6s without user input in TOUR mode, advancing at 9s)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const markUserActive = () => {
      lastUserActivityMsRef.current =
        typeof performance !== 'undefined' ? performance.now() : Date.now();
      setShowAutoAdvanceHint((prev) => (prev ? false : prev));
    };

    window.addEventListener('pointerdown', markUserActive, { passive: true });
    window.addEventListener('keydown', markUserActive, { passive: true });
    window.addEventListener('touchstart', markUserActive, { passive: true });

    const intervalId = window.setInterval(() => {
      if (
        !loaderDone ||
        tabHidden ||
        modeRef.current !== 'TOUR' ||
        isFlyingRef.current ||
        viewerIndexRef.current !== null ||
        contactPanelStateRef.current !== 'closed' ||
        activeStopIndexRef.current >= 5
      ) {
        setShowAutoAdvanceHint((prev) => (prev ? false : prev));
        return;
      }

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const idleSec = (now - lastUserActivityMsRef.current) / 1000;

      if (idleSec >= 9.0) {
        lastUserActivityMsRef.current = now;
        setShowAutoAdvanceHint(false);
        const nextIdx = Math.min(5, activeStopIndexRef.current + 1);
        flyToStop(nextIdx, false, false);
      } else if (idleSec >= 6.0) {
        setShowAutoAdvanceHint((prev) => (prev ? prev : true));
      } else {
        setShowAutoAdvanceHint((prev) => (prev ? false : prev));
      }
    }, 250);

    return () => {
      window.removeEventListener('pointerdown', markUserActive);
      window.removeEventListener('keydown', markUserActive);
      window.removeEventListener('touchstart', markUserActive);
      window.clearInterval(intervalId);
    };
  }, [flyToStop, loaderDone, tabHidden]);

  const handleHoverScreenChange = useCallback(
    (info: { screenId: ScreenId; label: string } | null) => {
      if (!info || viewerIndex !== null || contactPanelState !== 'closed') {
        setHoveredScreenInfo(null);
        return;
      }
      if (isFlyingRef.current) {
        setHoveredScreenInfo(null);
        return;
      }
      if (modeRef.current === 'FOCUSED' && focusedScreenIdRef.current === info.screenId) {
        setHoveredScreenInfo(null);
        return;
      }
      setHoveredScreenInfo(info);
    },
    [contactPanelState, viewerIndex]
  );

  const handleHoverCertificateChange = useCallback(
    (info: { index: number; title: string } | null) => {
      if (
        !info ||
        isFlyingRef.current ||
        modeRef.current === 'FOCUSED' ||
        viewerIndex !== null ||
        contactPanelState !== 'closed'
      ) {
        setHoveredCertificateInfo(null);
        return;
      }
      setHoveredCertificateInfo(info);
    },
    [contactPanelState, viewerIndex]
  );

  const handleHoverGuitarChange = useCallback(
    (hovered: boolean) => {
      if (
        !hovered ||
        isFlyingRef.current ||
        modeRef.current === 'FOCUSED' ||
        viewerIndex !== null ||
        contactPanelState !== 'closed'
      ) {
        setHoveredGuitar(false);
        return;
      }
      setHoveredGuitar(true);
    },
    [contactPanelState, viewerIndex]
  );

  const handleToggleSoundMuted = useCallback(() => {
    setMuted(!isMuted());
  }, []);

  const handlePlayGuitarFromUI = useCallback(() => {
    playGuitarTriggerRef.current?.();
  }, []);

  const handleExecuteHitAction = useCallback(
    (screenId: ScreenId, action: HitActionType) => {
      const ctrl = controllers[screenId];
      if (action.type === 'page') {
        ctrl.setPage(action.targetPage);
        setFocusedPage(action.targetPage);
      } else if (action.type === 'external-link') {
        openExternalLinkInNewTab(action.url);
      } else if (action.type === 'copy-text') {
        copyTextWithFallback(action.text);
        ctrl.showToast(action.toastMessage, 1500);
      }
    },
    [controllers]
  );

  const handleChangeFocusedPage = useCallback(
    (nextPage: number) => {
      if (!focusedScreenId) return;
      controllers[focusedScreenId].setPage(nextPage);
      setFocusedPage(nextPage);
    },
    [controllers, focusedScreenId]
  );

  // Room keyboard navigation (disabled while CertificateViewer or ContactPanel is open)
  useEffect(() => {
    if (viewerIndex !== null || contactPanelState !== 'closed') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        (e.target instanceof HTMLElement && e.target.isContentEditable)
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (modeRef.current === 'FOCUSED') {
          e.preventDefault();
          handleExitFocus();
        }
        return;
      }

      if (e.key.toLowerCase() === 'h' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setHudMinimized((prev) => !prev);
        return;
      }

      if (debugFreeCam && e.key.toLowerCase() === 'l' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        setLightDebugOpen((prev) => !prev);
        return;
      }

      if (debugFreeCam && e.key.toLowerCase() === 'q' && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        setRenderDiagOpen((prev) => !prev);
        return;
      }

      if (e.shiftKey && e.key.toLowerCase() === 'g' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        playGuitarTriggerRef.current?.();
        return;
      }

      if (debugFreeCam && e.shiftKey && e.key.toLowerCase() === 't' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void playTestTone();
        return;
      }

      // EXPLORE mode keyboard shortcuts (+ / - zoom by 12%, 0 resets view in 1.0 s, arrows orbit slowly)
      if (modeRef.current === 'EXPLORE' && !isFlyingRef.current) {
        if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          rigApiRef.current?.zoomExploreByFactor(0.12);
          return;
        }
        if ((e.key === '-' || e.key === '_') && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          rigApiRef.current?.zoomExploreByFactor(-0.12);
          return;
        }
        if (e.key === '0' && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          rigApiRef.current?.resetExploreView(1.0);
          return;
        }
        const orbitStepRad = (4 * Math.PI) / 180;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          rigApiRef.current?.orbitExploreByAngles(-orbitStepRad, 0);
          return;
        }
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          rigApiRef.current?.orbitExploreByAngles(orbitStepRad, 0);
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          rigApiRef.current?.orbitExploreByAngles(0, -orbitStepRad);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          rigApiRef.current?.orbitExploreByAngles(0, orbitStepRad);
          return;
        }
      }

      // Keyboard keys 0..5 jump to stops 0..5
      if (/^[0-5]$/.test(e.key)) {
        e.preventDefault();
        const idx = Number(e.key);
        flyToStop(idx, false, false);
        return;
      }

      if (modeRef.current === 'FOCUSED' && focusedScreenId) {
        const ctrl = controllers[focusedScreenId];
        const totalPages = ctrl.getTotalVisiblePages();
        if (totalPages > 1 && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
          e.preventDefault();
          const delta = e.key === 'ArrowRight' ? 1 : -1;
          const nextP = (ctrl.getPage() + delta + totalPages) % totalPages;
          handleChangeFocusedPage(nextP);
          return;
        }
      }

      if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ArrowRight') {
        e.preventDefault();
        flyToStop(Math.min(5, activeStopIndex + 1), false, false);
      } else if (e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ArrowLeft') {
        e.preventDefault();
        flyToStop(Math.max(0, activeStopIndex - 1), false, false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    viewerIndex,
    contactPanelState,
    activeStopIndex,
    focusedScreenId,
    controllers,
    flyToStop,
    handleExitFocus,
    handleChangeFocusedPage,
    debugFreeCam,
  ]);

  // Compute leftMarginPx outside the active screen's projected rectangle for SectionOverlay
  const activeLeftMarginPx = useMemo(() => {
    const scrId = SCREEN_BY_STOP[activeStopIndex];
    const spec = SCREEN_SPECS.find((s) => s.id === scrId) ?? SCREEN_SPECS[2];
    const aspect = safeArea.viewportW / Math.max(1, safeArea.viewportH);
    const { leftMarginPx } = computeScreenFocusDistance(
      spec.width,
      spec.height,
      DEFAULT_FOV_DEG,
      aspect,
      safeArea
    );
    return leftMarginPx;
  }, [activeStopIndex, safeArea]);

  // Expose comprehensive automated test harness on window.__PORTFOLIO_TEST__
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__PORTFOLIO_TEST__ = {
      getRenderCount: () => renderCountRef.current,
      getMode: () => modeRef.current,
      getActiveStopIndex: () => activeStopIndex,
      getTourCameraStops: () => TOUR_CAMERA_STOPS,
      getCurrentCameraPose: () => rigApiRef.current?.getCurrentCameraPose() ?? null,
      getFocusedScreenId: () => focusedScreenId,
      getContactPanelState: () => contactPanelState,
      openContactPanel: () => handleOpenContactPanel(),
      closeContactPanel: () => handleRequestCloseContactPanel(),
      getHoveredScreenInfo: () => hoveredScreenInfo,
      getHoveredCertificateInfo: () => hoveredCertificateInfo,
      getHoveredGuitar: () => hoveredGuitar,
      getGuitarAudioState: () => getGuitarAudioContextState(),
      playGuitar: () => playGuitarTriggerRef.current?.(),
      setSoundMuted: (m: boolean) => setMuted(m),
      isSoundMuted: () => isMuted(),
      getActiveCertificateIndex: () => viewerIndex,
      hasOpenedAnyCertificate: () => hasOpenedAnyCertificate(),
      getShowShelfHintChip: () => showShelfHintChip,
      getShowExploreHintChip: () => showExploreHintChip,
      getShowAutoAdvanceHint: () => showAutoAdvanceHint,
      getCertificates: () => CERTIFICATES,
      openCertificate: (idx: number) => handleOpenCertificate(idx, null, document.body),
      closeCertificate: () => handleCloseCertificateImmediate(),
      getSafeArea: () => safeArea,
      getScrollProgress: () => scrollProgressRef.current,
      setScrollProgressDirect: (p: number) => {
        scrollProgressRef.current = Math.max(0, Math.min(1, p));
      },
      getScreenContentId: (id: ScreenId) => controllers[id].contentId,
      getScreenPage: (id: ScreenId) => controllers[id].getPage(),
      getScreenHitRegions: (id: ScreenId) => controllers[id].hitRegions,
      getScreenLuminanceStats: (id: ScreenId) => controllers[id].luminanceStats,
      getContrastReport: () => SCREEN_CONTRAST_REPORT,
      getTvCapHeightReport: (vw = 1920, vh = 1080) => computeTvProjectedCapHeightPx(vw, vh),
      triggerHitRegion: (id: ScreenId, regionId: string) => {
        const region = controllers[id].hitRegions.find((r) => r.id === regionId);
        if (!region) return false;
        handleExecuteHitAction(id, region.action);
        return true;
      },
      flyToStop: (idx: number, focusAfter = false) => flyToStop(idx, focusAfter, false),
      prevStop: handlePrevStop,
      nextStop: handleNextStop,
      focusScreen: handleFocusScreen,
      exitFocus: handleExitFocus,
      skipToExplore: handleSkipToExplore,
      backToTour: handleBackToTour,
      resetExploreView: handleResetExploreView,
      getRenderDiagnostics: () =>
        (window as unknown as Record<string, unknown>).__PORTFOLIO_RENDER_DIAG__ ??
        renderDiagSnapshot,
    };
  }, [
    activeStopIndex,
    focusedScreenId,
    contactPanelState,
    hoveredScreenInfo,
    hoveredCertificateInfo,
    hoveredGuitar,
    viewerIndex,
    showShelfHintChip,
    showExploreHintChip,
    showAutoAdvanceHint,
    safeArea,
    controllers,
    flyToStop,
    handlePrevStop,
    handleNextStop,
    handleFocusScreen,
    handleExitFocus,
    handleOpenContactPanel,
    handleRequestCloseContactPanel,
    handleSkipToExplore,
    handleBackToTour,
    handleResetExploreView,
    handleExecuteHitAction,
    handleOpenCertificate,
    handleCloseCertificateImmediate,
    renderDiagSnapshot,
  ]);

  const canInteractWithCertificates =
    !isFlyingState &&
    mode !== 'FOCUSED' &&
    viewerIndex === null &&
    contactPanelState === 'closed';

  const activeController = focusedScreenId ? controllers[focusedScreenId] : null;
  const locationName = STOP_NAMES[activeStopIndex] ?? STOP_NAMES[0];

  if (!webglSupported || webglError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16 text-[#fbeed6]">
        <h1 className="text-3xl font-bold">{PORTFOLIO_CONTENT.profile.fullName}</h1>
        <p className="mt-1 text-lg opacity-85">{PORTFOLIO_CONTENT.profile.headline}</p>
        <p className="mt-4 text-sm opacity-80">{PORTFOLIO_CONTENT.about.page1.intro}</p>
        <h2 className="mt-8 text-xl font-bold text-[#f2b441]">Featured Projects</h2>
        <ul className="mt-3 space-y-3 text-sm">
          {PORTFOLIO_CONTENT.projects.map((proj) => (
            <li key={proj.id}>
              <strong>{proj.fullTitle}</strong> — {proj.oneLineSummary}{' '}
              <a
                href={proj.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-[#f2b441]"
              >
                GitHub
              </a>
              {proj.liveUrl && (
                <>
                  {' · '}
                  <a
                    href={proj.liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-[#f2b441]"
                  >
                    Live Demo
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold">
          <a
            href={PORTFOLIO_CONTENT.contact.github.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#f2b441]"
          >
            GitHub
          </a>
          <a
            href={PORTFOLIO_CONTENT.contact.linkedin.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-[#f2b441]"
          >
            LinkedIn
          </a>
          <a href={PORTFOLIO_CONTENT.contact.email.url} className="underline text-[#f2b441]">
            {PORTFOLIO_CONTENT.contact.email.address}
          </a>
        </div>
      </main>
    );
  }

  return (
    <div className="relative min-h-screen w-full select-none">
      {/* Isometric Room Preloader mounted outside <Canvas> */}
      {!loaderDone && (
        <RoomLoader
          onReveal={() => {
            rigApiRef.current?.playIntroReveal(1.05);
            exposureCalibratorRef.current?.();
          }}
          onDone={() => {
            setLoaderDone(true);
          }}
        />
      )}

      {/* Full-Viewport Certificate Viewer Overlay */}
      {viewerIndex !== null && (
        <CertificateViewer
          activeIndex={viewerIndex}
          initialOriginRect={viewerOriginRect}
          reducedMotion={reducedMotion}
          getProjectedRectForIndex={getProjectedRectForCertificate}
          onSelectIndex={(nextIdx) => setViewerIndex(nextIdx)}
          onCloseImmediate={handleCloseCertificateImmediate}
        />
      )}

      {/* Floating Phone Contact Panel Overlay (keeps 3D room visible around the panel) */}
      <ContactPanel
        panelState={contactPanelState}
        reducedMotion={reducedMotion}
        effectiveCanvasWidth={safeArea.viewportW}
        getPhoneProjectedRect={getPhoneProjectedRect}
        onStateChange={handleContactPanelStateChange}
        onRequestClose={handleRequestCloseContactPanel}
      />

      {/* Hide the whole HUD (location tag, side dots, "Scroll to tour room" pill, bottom bar) until onDone fires */}
      {loaderDone && (
        <>
          {/* Top Navigation Chrome */}
          <Nav
            activeStopIndex={activeStopIndex}
            onSelectStop={(idx) => flyToStop(idx, false, false)}
          />

          {/* Left Section Transition Overlay */}
          <SectionOverlay
            activeStopIndex={activeStopIndex}
            nearFactor={nearFactor}
            mode={mode}
            leftMarginPx={activeLeftMarginPx}
          />

          {/* Bottom HUD, Right Progress Rail, Screen Reader Mirror, One-Time Hint Chips & Light Debug Panel */}
          <HUD
            activeStopIndex={activeStopIndex}
            mode={mode}
            locationName={locationName}
            focusedScreenId={focusedScreenId}
            focusedPage={focusedPage}
            focusedTotalVisiblePages={
              activeController ? activeController.getTotalVisiblePages() : 1
            }
            focusedHitRegions={activeController ? activeController.hitRegions : []}
            hoveredScreenInfo={hoveredScreenInfo}
            hoveredCertificateInfo={hoveredCertificateInfo}
            hoveredGuitar={hoveredGuitar}
            soundMuted={soundMuted}
            guitarAudioToast={guitarAudioToast}
            hasScrolled={hasScrolled}
            hudMinimized={hudMinimized}
            reducedMotion={reducedMotion}
            safeAreaBottomReservedPx={safeArea.bottomReservedPx}
            showShelfHintChip={showShelfHintChip}
            showExploreHintChip={showExploreHintChip}
            showAutoAdvanceHint={showAutoAdvanceHint}
            lightDebugOpen={lightDebugOpen}
            lightDebug={lightDebug}
            onDismissShelfHintChip={dismissShelfHintChip}
            onDismissExploreHintChip={dismissExploreHintChip}
            onResetExploreView={handleResetExploreView}
            onToggleMinimize={() => setHudMinimized((prev) => !prev)}
            onToggleSoundMuted={handleToggleSoundMuted}
            onPlayGuitarFromUI={handlePlayGuitarFromUI}
            onSelectStop={(idx) => flyToStop(idx, false, false)}
            onPrevStop={handlePrevStop}
            onNextStop={handleNextStop}
            onSkipToExplore={handleSkipToExplore}
            onBackToTour={handleBackToTour}
            onExitFocus={handleExitFocus}
            onChangeFocusedPage={handleChangeFocusedPage}
            onExecuteHitAction={handleExecuteHitAction}
            onFocusScreen={handleFocusScreen}
            onOpenCertificateFromUI={(idx, triggerEl) =>
              handleOpenCertificate(idx, null, triggerEl)
            }
            onChangeLightDebug={setLightDebug}
          />
        </>
      )}

      {/* Small Render Quality Diagnostics Overlay toggled with the Q key */}
      {renderDiagOpen && renderDiagSnapshot && (
        <aside
          role="region"
          aria-label="Render Quality Diagnostics (Q)"
          data-testid="render-diag-overlay"
          className="fixed top-16 right-4 z-40 max-w-md rounded-2xl p-3.5 font-mono text-[11px] leading-relaxed shadow-lg"
          style={{
            backgroundColor: PALETTE.uiFrostedCreamSolid,
            color: PALETTE.uiText,
            border: `1.5px solid ${PALETTE.uiPrimaryAccent}`,
          }}
        >
          <div className="mb-1.5 flex items-center justify-between font-bold">
            <span>RENDER DIAGNOSTICS (Press Q to close)</span>
            <span style={{ color: PALETTE.accentProjects }}>
              {renderDiagSnapshot.b_adaptiveDpr.progressiveRefinementAtRest
                ? 'REST (MAX DPR)'
                : 'MOTION'}
            </span>
          </div>
          <div>
            <strong>a) Pixel Ratio:</strong> gl={renderDiagSnapshot.a_pixelRatio.glPixelRatio},
            device={renderDiagSnapshot.a_pixelRatio.windowDevicePixelRatio} | canvas=
            {renderDiagSnapshot.a_pixelRatio.canvasWidth}x
            {renderDiagSnapshot.a_pixelRatio.canvasHeight} vs client=
            {renderDiagSnapshot.a_pixelRatio.clientWidth}x
            {renderDiagSnapshot.a_pixelRatio.clientHeight} (ratio{' '}
            {renderDiagSnapshot.a_pixelRatio.widthRatio}x)
          </div>
          <div>
            <strong>b) Adaptive DPR:</strong> active={renderDiagSnapshot.b_adaptiveDpr.activeDpr},
            step={renderDiagSnapshot.b_adaptiveDpr.adaptiveStepDpr}, base=
            {renderDiagSnapshot.b_adaptiveDpr.baseTargetDpr}, p95=
            {renderDiagSnapshot.b_adaptiveDpr.p95FrameMs}ms | lowered:{' '}
            {renderDiagSnapshot.b_adaptiveDpr.whatLoweredIt}
          </div>
          <div>
            <strong>c) Antialias:</strong> {renderDiagSnapshot.c_antialiasing.webglAntialias} |
            EffectComposer: {renderDiagSnapshot.c_antialiasing.effectComposer}
          </div>
          <div>
            <strong>d) Textures (aniso / filter / mipmaps):</strong> maxAniso=
            {renderDiagSnapshot.d_textures.maxRendererAnisotropy} | floor=
            {renderDiagSnapshot.d_textures.floor.anisotropy}x (
            {renderDiagSnapshot.d_textures.floor.width}px), wall=
            {renderDiagSnapshot.d_textures.wall.anisotropy}x, frame=
            {renderDiagSnapshot.d_textures.frame.anisotropy}x, screen=
            {renderDiagSnapshot.d_textures.screen.anisotropy}x, phone=
            {renderDiagSnapshot.d_textures.phone.anisotropy}x
          </div>
          <div>
            <strong>e) CSS Softening:</strong> filter=
            {renderDiagSnapshot.e_cssDom.filterOnCanvasOrParents}, backdrop=
            {renderDiagSnapshot.e_cssDom.backdropFilterOnCanvasOrParents}, scale=
            {renderDiagSnapshot.e_cssDom.transformScaleOnCanvasOrParents}, imgRender=
            {renderDiagSnapshot.e_cssDom.imageRendering}
          </div>
          <div>
            <strong>f) Wall Certificates:</strong>{' '}
            {renderDiagSnapshot.f_wallCertificates
              .map((c, i) => `#${i + 1}: ${c.width}x${c.height}`)
              .join(', ')}
          </div>
        </aside>
      )}

      {/* Fixed Full-Viewport 3D Canvas on Vertical CSS Gradient */}
      <div
        ref={canvasWrapperRef}
        className="fixed inset-0 z-10 h-screen w-screen"
        onPointerLeave={() => {
          setHoveredScreenInfo(null);
          setHoveredCertificateInfo(null);
          setHoveredGuitar(false);
          if (typeof document !== 'undefined') {
            document.body.style.cursor = 'default';
          }
        }}
        style={{
          background: `linear-gradient(180deg, ${PALETTE.bgGradientTop} 0%, ${PALETTE.bgGradientMid} 52%, ${PALETTE.bgGradientBottom} 100%)`,
        }}
      >
        <CanvasErrorBoundary
          onErrorFallback={(reason) => {
            setWebglError(reason);
          }}
        >
          <Canvas
            shadows={!isSoftwareGl}
            dpr={dpr}
            frameloop={tabHidden ? 'never' : 'always'}
            camera={{
              fov: DEFAULT_FOV_DEG,
              near: 0.1,
              far: 60,
              position: OVERVIEW_BASE_POS,
            }}
            gl={{
              antialias: true,
              alpha: true,
              powerPreference: 'high-performance',
              logarithmicDepthBuffer: false,
              preserveDrawingBuffer: true,
            }}
            onCreated={({ gl }) => {
              gl.outputColorSpace = THREE.SRGBColorSpace;
              gl.toneMapping = THREE.ACESFilmicToneMapping;
              gl.toneMappingExposure = 0.95;
              gl.shadowMap.enabled = !isSoftwareGl;
              gl.shadowMap.type = THREE.PCFSoftShadowMap;

              const canvasEl = gl.domElement;
              canvasEl.style.width = '100%';
              canvasEl.style.height = '100%';
              canvasEl.style.display = 'block';
              canvasEl.style.imageRendering = 'auto';

              canvasEl.addEventListener('webglcontextlost', (e) => {
                e.preventDefault();
                console.warn('[WebGL] Context lost');
              });
            }}
            onPointerMissed={() => {
              if (
                modeRef.current === 'FOCUSED' &&
                viewerIndex === null &&
                contactPanelState === 'closed'
              ) {
                handleExitFocus();
              }
            }}
          >
            <Suspense fallback={null}>
              <RenderQualityManager
                isMobile={isMobile}
                renderDiagOpen={renderDiagOpen}
                controllers={controllers}
                scrollProgressRef={scrollProgressRef}
                isFlyingRef={isFlyingRef}
                onDprChange={setDpr}
                onDiagnosticsUpdate={setRenderDiagSnapshot}
              />

              <CameraRig
                scrollProgressRef={scrollProgressRef}
                modeRef={modeRef}
                focusedStopRef={focusedStopRef}
                focusedScreenIdRef={focusedScreenIdRef}
                isFlyingRef={isFlyingRef}
                safeArea={safeArea}
                reducedMotion={reducedMotion || isMobile}
                debugFreeCam={debugFreeCam}
                viewerOpen={viewerIndex !== null || contactPanelState !== 'closed'}
                onStopProximityChange={(stopIdx, nf) => {
                  setActiveStopIndex(stopIdx);
                  setNearFactor(nf);
                  if (stopIdx === 0) {
                    setHoveredScreenInfo(null);
                  } else if (stopIdx !== 4) {
                    dismissShelfHintChip();
                  }
                  const scrId = SCREEN_BY_STOP[stopIdx];
                  if (scrId && nf > 0.65) {
                    controllers[scrId].redraw();
                  }
                }}
                onRequestExploreHandoff={handleSkipToExplore}
                onExploreFirstZoom={dismissExploreHintChip}
                onRegisterRigApi={(api) => {
                  rigApiRef.current = api;
                }}
              />

              <Room
                controllers={controllers}
                focusedScreenId={focusedScreenId}
                mode={mode}
                modeRef={modeRef}
                isFlying={isFlyingState}
                isFlyingRef={isFlyingRef}
                reducedMotion={reducedMotion}
                lightDebug={lightDebug}
                canInteractWithCertificates={canInteractWithCertificates}
                activeCertificateIndex={viewerIndex}
                onFocusScreen={handleFocusScreen}
                onExecuteHitAction={handleExecuteHitAction}
                onHoverScreenChange={handleHoverScreenChange}
                onHoverCertificateChange={handleHoverCertificateChange}
                onHoverGuitarChange={handleHoverGuitarChange}
                registerPlayGuitarTrigger={(fn) => {
                  playGuitarTriggerRef.current = fn;
                }}
                onOpenCertificate={handleOpenCertificate}
                registerCertificateRectGetter={registerCertificateRectGetter}
                registerPhoneRectGetter={registerPhoneRectGetter}
                onExposureCalibrated={(newExp) => {
                  setLightDebug((prev) => ({ ...prev, exposure: newExp }));
                }}
                registerCalibrator={(fn) => {
                  exposureCalibratorRef.current = fn;
                }}
              />
            </Suspense>
          </Canvas>
        </CanvasErrorBoundary>
      </div>

      {/* DOM Scroll Area (~850vh) with 6 semantic sections driving scroll progress (stops 0..5) */}
      <main
        ref={scrollContainerRef}
        aria-label="Scrollable Tour Track"
        className="relative z-0 w-full pointer-events-none"
        style={{ height: '850vh' }}
      >
        {STOP_NAMES.map((name, idx) => (
          <section
            key={idx}
            data-stop-index={idx}
            aria-label={`Tour Stop ${idx}: ${name}`}
            style={{ height: `${850 / STOP_NAMES.length}vh` }}
          />
        ))}
      </main>
    </div>
  );
}

export default App;
