import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useFrame, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';
import { PORTFOLIO_CONTENT } from '../data/content';
import {
  CertificateItem,
  WALL_CERTIFICATES,
  hasOpenedAnyCertificate,
  subscribeCertificateOpened,
} from '../data/certificates';
import { RegisterClickableMeshFn } from './Room';

export interface CertificateRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface PropsComponentProps {
  showEmissives?: boolean;
  reducedMotion?: boolean;
  canInteractWithCertificates?: boolean;
  onHoverCertificateChange?: (info: { index: number; title: string } | null) => void;
  registerClickableMesh?: RegisterClickableMeshFn;
  onOpenCertificate?: (
    index: number,
    originRect: CertificateRect | null,
    triggerEl?: HTMLElement | null
  ) => void;
  registerCertificateRectGetter?: (
    index: number,
    getter: () => CertificateRect | null
  ) => void;
}

// Fix 1 (Polish): 3 Wall Certificate Frames centered on the left wall directly above the sofa (sofa center z = 1.10 m),
// at y = 1.70 m (spanning ~1.41 to 1.99 m, centered in 1.55..1.85 m), with 0.78 m long side and 0.12 m gaps (step = 0.90 m).
// Frame 1 spans z = -0.19..+0.59 m (>= 0.62 m clear of window casing at z = -0.81 m and >= 0.49 m clear of curtain at z = -0.68 m).
const WALL_FRAME_POSITIONS: readonly [number, number, number][] = [
  [-3.455, 1.70, 0.20],
  [-3.455, 1.70, 1.10],
  [-3.455, 1.70, 2.00],
];

const FRAME_LONG_SIDE = 0.78; // 78 cm outer width (up from 60 cm)
const MAT_BORDER = 0.05; // 5 cm #FFFFFF mat border on each side
const FRAME_THICKNESS = 0.03; // 3 cm thick RoundedBox
const OUTLINE_MARGIN = 0.04; // 4 cm larger than the frame on each side

export interface WallCertTextureDiagnostic {
  id: string;
  title: string;
  width: number;
  height: number;
  anisotropy: number;
  memoryBytesEstimate: number;
}

export const WALL_CERT_TEXTURE_DIAGNOSTICS: Record<number, WallCertTextureDiagnostic> = {};

function createPlaceholderTexture(
  aspectRatio: number,
  maxAnisotropy: number,
  certId: string
): THREE.CanvasTexture {
  const longSide = 1536;
  const isLandscape = aspectRatio >= 1;
  const w = isLandscape ? longSide : Math.max(1, Math.round(longSide * aspectRatio));
  const h = isLandscape ? Math.max(1, Math.round(longSide / Math.max(0.2, aspectRatio))) : longSide;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = PALETTE.certMatWhite;
    ctx.fillRect(0, 0, w, h);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.name = `wall-cert-${certId}`;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData = { category: 'frame', certId };
  tex.needsUpdate = true;
  return tex;
}

/**
 * Fix 2 (Polish): Fill every decorative wall frame with simple colorful geometric art drawn on a CanvasTexture
 * in the room palette (#F2A33A, #4C8DFF, #73AF52, #F06A8D, #A77BFF on #FFF6E0), different per frame.
 */
function createAbstractArtTexture(variant: number, maxAnisotropy: number): THREE.CanvasTexture {
  const size = 512;
  const s = size / 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.save();
    ctx.scale(s, s);
    // Background #FFF6E0
    ctx.fillStyle = PALETTE.screenBg;
    ctx.fillRect(0, 0, 256, 256);

    const cAmber = PALETTE.accentAbout; // #F2A33A
    const cBlue = PALETTE.accentSkills; // #4C8DFF
    const cGreen = PALETTE.accentProjects; // #73AF52
    const cPink = PALETTE.accentExperience; // #F06A8D
    const cPurple = PALETTE.accentContact; // #A77BFF

    if (variant === 0) {
      // Back wall frame 1: Sunset arch, floating Cobalt circle & Sage hills
      ctx.fillStyle = cAmber;
      ctx.beginPath();
      ctx.arc(128, 152, 68, Math.PI, 0, false);
      ctx.lineTo(196, 224);
      ctx.lineTo(60, 224);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cBlue;
      ctx.beginPath();
      ctx.arc(96, 86, 26, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cGreen;
      ctx.beginPath();
      ctx.arc(164, 212, 54, Math.PI, 0, false);
      ctx.fill();

      ctx.fillStyle = cPink;
      ctx.fillRect(150, 58, 36, 14);
    } else if (variant === 1) {
      // Back wall frame 2: Overlapping Bauhaus blocks & rings
      ctx.fillStyle = cBlue;
      ctx.fillRect(36, 44, 92, 110);

      ctx.fillStyle = cPink;
      ctx.beginPath();
      ctx.arc(162, 134, 52, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cAmber;
      ctx.beginPath();
      ctx.moveTo(64, 210);
      ctx.lineTo(132, 118);
      ctx.lineTo(200, 210);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cPurple;
      ctx.fillRect(148, 42, 56, 36);
    } else if (variant === 2) {
      // Back wall frame 3: Botanical geometric totem & stepped curves
      ctx.fillStyle = cGreen;
      ctx.fillRect(54, 136, 148, 78);

      ctx.fillStyle = cPurple;
      ctx.beginPath();
      ctx.arc(128, 102, 48, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cAmber;
      ctx.beginPath();
      ctx.arc(128, 102, 22, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cPink;
      ctx.beginPath();
      ctx.moveTo(54, 136);
      ctx.lineTo(128, 196);
      ctx.lineTo(202, 136);
      ctx.closePath();
      ctx.fill();
    } else if (variant === 3) {
      // Left wall frame 1: Diagonal color blocks & cobalt moon
      ctx.fillStyle = cPink;
      ctx.fillRect(38, 38, 84, 180);

      ctx.fillStyle = cAmber;
      ctx.fillRect(122, 118, 96, 100);

      ctx.fillStyle = cBlue;
      ctx.beginPath();
      ctx.arc(166, 78, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cGreen;
      ctx.beginPath();
      ctx.arc(92, 156, 32, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Left wall frame 2: Concentric geometric diamonds & stripes
      ctx.fillStyle = cPurple;
      ctx.fillRect(42, 46, 172, 74);

      ctx.fillStyle = cGreen;
      ctx.fillRect(42, 136, 82, 74);

      ctx.fillStyle = cAmber;
      ctx.beginPath();
      ctx.arc(172, 172, 38, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = cBlue;
      ctx.beginPath();
      ctx.moveTo(128, 56);
      ctx.lineTo(176, 120);
      ctx.lineTo(80, 120);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.name = `wall-art-frame-${variant + 1}`;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData = { category: 'frame' };
  tex.needsUpdate = true;
  return tex;
}

/**
 * Wall Pointer Sign under the three framed certificates on the left wall:
 * #F4EBDD plate, #3A2412 text: "More certificates on the bookshelf →"
 */
function createWallPointerSignTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 184;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = PALETTE.frameBorder; // #F4EBDD
    ctx.fillRect(0, 0, 1024, 184);

    // Subtle warm inner border
    ctx.strokeStyle = PALETTE.wallCapTop;
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 1004, 164);

    ctx.fillStyle = PALETTE.screenText; // #3A2412
    ctx.font = '700 44px "Plus Jakarta Sans", Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('More certificates on the bookshelf \u2192', 512, 94);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.name = 'wall-pointer-sign-1024x184';
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.userData = { category: 'frame' };
  tex.needsUpdate = true;
  return tex;
}

function projectObjectToScreenRect(
  obj: THREE.Object3D,
  camera: THREE.Camera,
  size: { width: number; height: number }
): CertificateRect | null {
  obj.updateWorldMatrix(true, true);
  const box = new THREE.Box3().setFromObject(obj);
  if (box.isEmpty()) return null;

  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of corners) {
    pt.project(camera);
    const sx = (pt.x * 0.5 + 0.5) * size.width;
    const sy = (-pt.y * 0.5 + 0.5) * size.height;
    if (sx < minX) minX = sx;
    if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy;
    if (sy > maxY) maxY = sy;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
  return {
    left: Math.max(0, minX),
    top: Math.max(0, minY),
    width: Math.max(24, maxX - minX),
    height: Math.max(24, maxY - minY),
  };
}

interface WallCertificateFrameProps {
  cert: CertificateItem;
  viewerIndex: number;
  position: [number, number, number];
  frameColor: string;
  showEmissives: boolean;
  reducedMotion: boolean;
  sessionOpenedOnce: boolean;
  canInteract: boolean;
  onHoverChange: (info: { index: number; title: string } | null) => void;
  registerClickableMesh?: RegisterClickableMeshFn;
  onOpenCertificate?: (
    index: number,
    originRect: CertificateRect | null,
    triggerEl?: HTMLElement | null
  ) => void;
  registerCertificateRectGetter?: (
    index: number,
    getter: () => CertificateRect | null
  ) => void;
}

const WallCertificateFrame: React.FC<WallCertificateFrameProps> = ({
  cert,
  viewerIndex,
  position,
  frameColor,
  showEmissives,
  reducedMotion,
  sessionOpenedOnce,
  canInteract,
  onHoverChange,
  registerClickableMesh,
  onOpenCertificate,
  registerCertificateRectGetter,
}) => {
  const { camera, size, gl } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const imageMeshRef = useRef<THREE.Mesh | null>(null);
  const outlineMatRef = useRef<THREE.MeshBasicMaterial | null>(null);
  const hoveredRef = useRef(false);
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const maxAnisotropy = useMemo(
    () => Math.min(16, gl.capabilities.getMaxAnisotropy() || 16),
    [gl]
  );

  const canInteractRef = useRef(canInteract);
  canInteractRef.current = canInteract;
  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;

  const [aspect, setAspect] = useState<number>(cert.aspectRatio);
  const placeholderTexture = useMemo(() => {
    const tex = createPlaceholderTexture(cert.aspectRatio, maxAnisotropy, cert.id);
    const canvas = tex.image as HTMLCanvasElement;
    WALL_CERT_TEXTURE_DIAGNOSTICS[viewerIndex] = {
      id: cert.id,
      title: cert.title,
      width: canvas.width,
      height: canvas.height,
      anisotropy: tex.anisotropy,
      memoryBytesEstimate: Math.round(canvas.width * canvas.height * 4 * 1.33),
    };
    if (typeof window !== 'undefined') {
      (window as unknown as Record<string, unknown>).__PORTFOLIO_WALL_CERT_TEXTURES__ =
        WALL_CERT_TEXTURE_DIAGNOSTICS;
    }
    return tex;
  }, [cert.aspectRatio, cert.id, cert.title, maxAnisotropy, viewerIndex]);
  const [certTexture, setCertTexture] = useState<THREE.Texture>(placeholderTexture);

  // Step 2.3: Load wall certificate texture at 1536 px on the long side (up from 1024)
  // with anisotropy = min(16, maxAnisotropy), generateMipmaps = true, LinearMipmapLinearFilter, LinearFilter, SRGBColorSpace.
  useEffect(() => {
    let cancelled = false;
    let settled = false;
    let createdTex: THREE.CanvasTexture | null = null;

    const finishLoadingItem = () => {
      if (!settled) {
        settled = true;
        THREE.DefaultLoadingManager.itemEnd(cert.imageUrl);
      }
    };

    THREE.DefaultLoadingManager.itemStart(cert.imageUrl);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      finishLoadingItem();
      if (cancelled) return;
      const nw = img.naturalWidth || 1536;
      const nh = img.naturalHeight || 1086;
      if (nw > 0 && nh > 0) {
        setAspect(nw / nh);
      }

      const targetLongSide = 1536;
      const longSide = Math.max(nw, nh);
      const scale = targetLongSide / Math.max(1, longSide);
      const targetW = Math.max(1, Math.round(nw * scale));
      const targetH = Math.max(1, Math.round(nh * scale));

      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, targetW, targetH);
      }

      const tex = new THREE.CanvasTexture(canvas);
      tex.name = `wall-cert-${cert.id}-${targetW}x${targetH}`;
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = maxAnisotropy;
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.userData = { category: 'frame', certId: cert.id, width: targetW, height: targetH };
      tex.needsUpdate = true;

      WALL_CERT_TEXTURE_DIAGNOSTICS[viewerIndex] = {
        id: cert.id,
        title: cert.title,
        width: targetW,
        height: targetH,
        anisotropy: tex.anisotropy,
        memoryBytesEstimate: Math.round(targetW * targetH * 4 * 1.33),
      };
      if (typeof window !== 'undefined') {
        (window as unknown as Record<string, unknown>).__PORTFOLIO_WALL_CERT_TEXTURES__ =
          WALL_CERT_TEXTURE_DIAGNOSTICS;
      }

      createdTex = tex;
      setCertTexture(tex);
    };
    img.onerror = () => {
      finishLoadingItem();
    };
    img.src = cert.imageUrl;

    return () => {
      cancelled = true;
      finishLoadingItem();
      if (createdTex) {
        createdTex.dispose();
      }
    };
  }, [cert.id, cert.imageUrl, cert.title, maxAnisotropy, viewerIndex]);

  useEffect(() => {
    return () => {
      placeholderTexture.dispose();
    };
  }, [placeholderTexture]);

  // Register 3D-to-2D screen rect getter for FLIP open/close animation
  useEffect(() => {
    if (!registerCertificateRectGetter) return;
    registerCertificateRectGetter(viewerIndex, () => {
      const target = imageMeshRef.current ?? groupRef.current;
      if (!target) return null;
      return projectObjectToScreenRect(target, camera, size);
    });
  }, [registerCertificateRectGetter, viewerIndex, camera, size]);

  // Register this wall certificate frame with the throttled hover raycaster in Room.tsx
  useEffect(() => {
    if (!registerClickableMesh || !groupRef.current) return;
    return registerClickableMesh(groupRef.current, {
      id: `wall-cert-${cert.id}`,
      onHoverMove: () => {
        if (!canInteractRef.current) return false;
        if (!hoveredRef.current) {
          hoveredRef.current = true;
          onHoverChangeRef.current({ index: viewerIndex, title: cert.title });
          if (groupRef.current) {
            gsap.to(groupRef.current.scale, {
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
        onHoverChangeRef.current(null);
        if (groupRef.current) {
          gsap.to(groupRef.current.scale, {
            x: 1,
            y: 1,
            z: 1,
            duration: 0.2,
            ease: 'power2.out',
          });
        }
      },
    });
  }, [registerClickableMesh, cert.id, cert.title, viewerIndex]);

  // Clear hover state if interaction becomes disabled (e.g. flight starts or viewer opens)
  useEffect(() => {
    if (!canInteract && hoveredRef.current) {
      hoveredRef.current = false;
      if (groupRef.current) {
        gsap.to(groupRef.current.scale, {
          x: 1,
          y: 1,
          z: 1,
          duration: 0.2,
          ease: 'power2.out',
        });
      }
    }
  }, [canInteract]);

  // Fix 1 (Polish): Invitation outline opacity fading slowly between 0.20 and 0.65 over 3.6 s
  // (frames offset by 1.2 s). Stops fading (static 0.20) after visitor opens any certificate.
  // Under reduced motion: static 0.40.
  useFrame(({ clock }) => {
    const mat = outlineMatRef.current;
    if (!mat) return;

    if (hoveredRef.current && canInteract) {
      mat.opacity = 0.75;
      return;
    }

    if (reducedMotion) {
      mat.opacity = 0.4;
      return;
    }

    if (sessionOpenedOnce) {
      mat.opacity = 0.2;
      return;
    }

    // Sine wave between 0.20 and 0.65 over 3.6 s, offset by 1.2 s per frame
    const t = clock.getElapsedTime() - viewerIndex * 1.2;
    const wave = Math.sin((t / 3.6) * Math.PI * 2);
    mat.opacity = 0.425 + 0.225 * wave;
  });

  // Compute exact dimensions preserving real certificate aspect ratio (long side = 0.78 m)
  const isLandscape = aspect >= 1;
  const frameW = isLandscape
    ? FRAME_LONG_SIDE
    : (FRAME_LONG_SIDE - 2 * MAT_BORDER) * aspect + 2 * MAT_BORDER;
  const imgW = frameW - 2 * MAT_BORDER;
  const imgH = imgW / Math.max(0.2, aspect);
  const frameH = imgH + 2 * MAT_BORDER;

  const outlineW = frameW + OUTLINE_MARGIN * 2;
  const outlineH = frameH + OUTLINE_MARGIN * 2;

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!canInteract) return;
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
    if (!down || !canInteract) return;

    const dx = e.nativeEvent.clientX - down.x;
    const dy = e.nativeEvent.clientY - down.y;
    const dist = Math.hypot(dx, dy);
    const dt = performance.now() - down.time;

    // Click guard: pointer moved < 6 px and press lasted < 400 ms
    if (dist < 6 && dt < 400) {
      hoveredRef.current = false;
      onHoverChange(null);
      if (groupRef.current) {
        gsap.to(groupRef.current.scale, { x: 1, y: 1, z: 1, duration: 0.15 });
      }
      const target = imageMeshRef.current ?? groupRef.current;
      const rect = target ? projectObjectToScreenRect(target, camera, size) : null;
      onOpenCertificate?.(viewerIndex, rect, null);
    }
  };

  return (
    <group
      ref={groupRef}
      name={`WallCertificate-${cert.id}`}
      position={position}
      rotation={[0, Math.PI / 2, 0]}
      userData={{
        ignoreForCamera: true,
        certificateId: cert.id,
        certificateIndex: viewerIndex,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Click-invitation highlight plane: 4 cm larger than frame on each side, #FFD27A, NormalBlending, depthWrite: false */}
      <mesh
        position={[0, 0, -0.016]}
        userData={{ ignoreForCamera: true, isOutlinePlane: true }}
      >
        <planeGeometry args={[outlineW, outlineH]} />
        <meshBasicMaterial
          ref={outlineMatRef}
          color={PALETTE.certOutlineGold}
          transparent
          opacity={0.4}
          blending={THREE.NormalBlending}
          depthWrite={false}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {/* 3 cm thick RoundedBox Frame in wood #B87846 */}
      <RoundedBox
        args={[frameW, frameH, FRAME_THICKNESS]}
        radius={0.008}
        smoothness={3}
        castShadow
        receiveShadow
        userData={{ ignoreForCamera: true }}
      >
        <meshStandardMaterial color={frameColor} roughness={0.68} metalness={0} />
      </RoundedBox>

      {/* 5 cm #FFFFFF Mat Plane with polygonOffset to avoid shimmer */}
      <mesh position={[0, 0, FRAME_THICKNESS / 2 + 0.001]} userData={{ ignoreForCamera: true }}>
        <planeGeometry args={[frameW - 0.016, frameH - 0.016]} />
        <meshStandardMaterial
          color={PALETTE.certMatWhite}
          roughness={0.85}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {/* Certificate Image Plane inset 1 cm in front of frame/wall with polygonOffset so it never z-fights */}
      <mesh
        ref={imageMeshRef}
        position={[0, 0, FRAME_THICKNESS / 2 + 0.01]}
        userData={{ ignoreForCamera: true }}
      >
        <planeGeometry args={[imgW, imgH]} />
        <meshStandardMaterial
          color={PALETTE.certPaperEmissive}
          map={certTexture}
          emissive={PALETTE.certPaperEmissive}
          emissiveMap={certTexture}
          emissiveIntensity={showEmissives ? 0.2 : 0}
          roughness={0.9}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={-2}
          polygonOffsetUnits={-2}
        />
      </mesh>
    </group>
  );
};

export const Props: React.FC<PropsComponentProps> = ({
  showEmissives = true,
  reducedMotion = false,
  canInteractWithCertificates = true,
  onHoverCertificateChange,
  registerClickableMesh,
  onOpenCertificate,
  registerCertificateRectGetter,
}) => {
  const { gl } = useThree();
  const hourHandRef = useRef<THREE.Mesh | null>(null);
  const minuteHandRef = useRef<THREE.Mesh | null>(null);
  const secondHandRef = useRef<THREE.Mesh | null>(null);

  const maxAnisotropy = useMemo(
    () => Math.min(16, gl.capabilities.getMaxAnisotropy() || 16),
    [gl]
  );

  const [sessionOpenedOnce, setSessionOpenedOnce] = useState<boolean>(() =>
    hasOpenedAnyCertificate()
  );

  useEffect(() => {
    return subscribeCertificateOpened(() => {
      setSessionOpenedOnce(true);
    });
  }, []);

  const nameSignTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = PALETTE.wallFace;
      ctx.fillRect(0, 0, 1024, 256);
      ctx.fillStyle = PALETTE.nameSignWarmWhite;
      ctx.font = '800 152px Outfit, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PORTFOLIO_CONTENT.profile.uppercaseName, 512, 132);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.name = 'wall-name-sign-1024x256';
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.userData = { category: 'frame' };
    tex.needsUpdate = true;
    return tex;
  }, [maxAnisotropy]);

  // 5 distinct procedural geometric art CanvasTextures (3 for back wall, 2 for left wall)
  const artTextures = useMemo(
    () => [0, 1, 2, 3, 4].map((v) => createAbstractArtTexture(v, maxAnisotropy)),
    [maxAnisotropy]
  );

  const wallPointerSignTexture = useMemo(
    () => createWallPointerSignTexture(maxAnisotropy),
    [maxAnisotropy]
  );

  useEffect(() => {
    return () => {
      nameSignTexture.dispose();
      artTextures.forEach((t) => t.dispose());
      wallPointerSignTexture.dispose();
    };
  }, [nameSignTexture, artTextures, wallPointerSignTexture]);

  useFrame(() => {
    const now = new Date();
    const seconds = now.getSeconds() + now.getMilliseconds() / 1000;
    const minutes = now.getMinutes() + seconds / 60;
    const hours = (now.getHours() % 12) + minutes / 60;

    if (secondHandRef.current) {
      secondHandRef.current.rotation.z = -(seconds / 60) * Math.PI * 2;
    }
    if (minuteHandRef.current) {
      minuteHandRef.current.rotation.z = -(minutes / 60) * Math.PI * 2;
    }
    if (hourHandRef.current) {
      hourHandRef.current.rotation.z = -(hours / 12) * Math.PI * 2;
    }
  });

  return (
    <group name="WallDecorAndProps">
      {/* Name Sign "ABHINAV" in warm white (static, emissive 0.5) on Back Wall above monitors */}
      <group position={[-1.35, 2.28, -2.97]}>
        <RoundedBox args={[0.96, 0.24, 0.03]} radius={0.012} smoothness={3} castShadow>
          <meshStandardMaterial color={PALETTE.wallCapFront} roughness={0.68} />
        </RoundedBox>
        <mesh position={[0, 0, 0.017]}>
          <planeGeometry args={[0.9, 0.2]} />
          <meshStandardMaterial
            color={PALETTE.nameSignWarmWhite}
            map={nameSignTexture}
            emissive={PALETTE.nameSignWarmWhite}
            emissiveMap={nameSignTexture}
            emissiveIntensity={showEmissives ? 0.5 : 0}
            roughness={0.5}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      </group>

      {/* Fix 2: 3 Decorative Art Frames on Back Wall (<= 4) filled with colorful geometric CanvasTextures */}
      {[
        { pos: [-2.55, 1.85, -2.98], size: [0.36, 0.44], texIdx: 0 },
        { pos: [-1.85, 1.82, -2.98], size: [0.42, 0.34], texIdx: 1 },
        { pos: [-0.85, 1.85, -2.98], size: [0.36, 0.44], texIdx: 2 },
      ].map((frame, idx) => (
        <group key={`back-art-${idx}`} position={frame.pos as [number, number, number]}>
          <RoundedBox
            args={[frame.size[0], frame.size[1], 0.025]}
            radius={0.008}
            smoothness={3}
            castShadow
          >
            <meshStandardMaterial color={PALETTE.frameBorder} roughness={0.7} />
          </RoundedBox>
          <mesh position={[0, 0, 0.014]}>
            <planeGeometry args={[frame.size[0] - 0.055, frame.size[1] - 0.055]} />
            <meshStandardMaterial
              color={PALETTE.certMatWhite}
              map={artTextures[frame.texIdx]}
              roughness={0.82}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        </group>
      ))}

      {/* Fix 1: Soft darker backing panel (#E2D2B4, 0.032 m thick at x = -3.492 -> front face at -3.476, 6 mm clear of frames) */}
      <RoundedBox
        args={[2.74, 0.74, 0.032]}
        radius={0.012}
        smoothness={3}
        position={[-3.492, 1.70, 1.10]}
        rotation={[0, Math.PI / 2, 0]}
        receiveShadow
        userData={{ ignoreForCamera: true }}
      >
        <meshStandardMaterial color={PALETTE.certWallBacking} roughness={0.78} metalness={0} />
      </RoundedBox>

      {/* Fix 1: 3 Wall Certificate Frames on Left Wall centered above the Sofa (z = 0.20, 1.10, 2.00, y = 1.70 m, wood #B87846) */}
      {WALL_CERTIFICATES.map((cert, idx) => (
        <WallCertificateFrame
          key={cert.id}
          cert={cert}
          viewerIndex={idx}
          position={WALL_FRAME_POSITIONS[idx]}
          frameColor={PALETTE.wallCapTop}
          showEmissives={showEmissives}
          reducedMotion={reducedMotion}
          sessionOpenedOnce={sessionOpenedOnce}
          canInteract={canInteractWithCertificates}
          onHoverChange={(info) => onHoverCertificateChange?.(info)}
          registerClickableMesh={registerClickableMesh}
          onOpenCertificate={onOpenCertificate}
          registerCertificateRectGetter={registerCertificateRectGetter}
        />
      ))}

      {/* Wall Pointer Sign under the three framed certificates on the left wall:
          rounded plate (#F4EBDD, text #3A2412, 0.50 m wide, 0.09 m tall): "More certificates on the bookshelf →" */}
      <group
        name="WallCertificateShelfPointerSign"
        position={[-3.465, 1.22, 1.10]}
        rotation={[0, Math.PI / 2, 0]}
        userData={{ ignoreForCamera: true }}
      >
        <RoundedBox
          args={[0.50, 0.09, 0.016]}
          radius={0.012}
          smoothness={3}
          castShadow
          receiveShadow
          userData={{ ignoreForCamera: true }}
        >
          <meshStandardMaterial color={PALETTE.frameBorder} roughness={0.72} metalness={0} />
        </RoundedBox>
        <mesh position={[0, 0, 0.009]} userData={{ ignoreForCamera: true }}>
          <planeGeometry args={[0.484, 0.078]} />
          <meshStandardMaterial
            color={PALETTE.certMatWhite}
            map={wallPointerSignTexture}
            roughness={0.8}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      </group>

      {/* Fix 2: 2 Decorative Art Frames on Left Wall past the Sofa (<= 2) filled with colorful geometric CanvasTextures */}
      {[
        { pos: [-3.48, 1.98, 2.75], size: [0.26, 0.28], texIdx: 3 },
        { pos: [-3.48, 1.54, 2.75], size: [0.26, 0.26], texIdx: 4 },
      ].map((art, idx) => (
        <group
          key={`left-art-${idx}`}
          position={art.pos as [number, number, number]}
          rotation={[0, Math.PI / 2, 0]}
        >
          <RoundedBox
            args={[art.size[0], art.size[1], 0.025]}
            radius={0.008}
            smoothness={3}
            castShadow
          >
            <meshStandardMaterial color={PALETTE.frameBorder} roughness={0.7} />
          </RoundedBox>
          <mesh position={[0, 0, 0.014]}>
            <planeGeometry args={[art.size[0] - 0.05, art.size[1] - 0.05]} />
            <meshStandardMaterial
              color={PALETTE.certMatWhite}
              map={artTextures[art.texIdx]}
              roughness={0.82}
              polygonOffset
              polygonOffsetFactor={-1}
              polygonOffsetUnits={-1}
            />
          </mesh>
        </group>
      ))}

      {/* Round Wall Clock on Back Wall (shifted to x = -0.18 so it has >= 0.28 m gap from Frame 2 and >= 0.49 m gap from the wall guitar) */}
      <group position={[-0.18, 2.05, -2.97]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.21, 0.21, 0.035, 32]} />
          <meshStandardMaterial color={PALETTE.clockRing} roughness={0.65} />
        </mesh>
        <mesh position={[0, 0, 0.019]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.175, 0.175, 0.006, 32]} />
          <meshStandardMaterial color={PALETTE.clockFace} roughness={0.7} />
        </mesh>
        <mesh ref={hourHandRef} position={[0, 0, 0.025]}>
          <boxGeometry args={[0.014, 0.09, 0.006]} />
          <meshStandardMaterial color={PALETTE.monitorBezel} roughness={0.6} />
        </mesh>
        <mesh ref={minuteHandRef} position={[0, 0, 0.028]}>
          <boxGeometry args={[0.01, 0.13, 0.006]} />
          <meshStandardMaterial color={PALETTE.monitorBezel} roughness={0.6} />
        </mesh>
        <mesh ref={secondHandRef} position={[0, 0, 0.031]}>
          <boxGeometry args={[0.005, 0.14, 0.004]} />
          <meshStandardMaterial color={PALETTE.accentAbout} roughness={0.6} />
        </mesh>
      </group>

      {/* Warm Floor Lamp at (0.32, 0, -2.38), clear of desk, Monitor 3 view corridor, and wall guitar */}
      <group position={[0.32, 0, -2.38]}>
        <mesh position={[0, 0.02, 0]} receiveShadow>
          <cylinderGeometry args={[0.16, 0.18, 0.04, 20]} />
          <meshStandardMaterial color={PALETTE.lampBase} roughness={0.68} />
        </mesh>
        <mesh position={[0, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.018, 0.022, 1.46, 12]} />
          <meshStandardMaterial color={PALETTE.lampBase} roughness={0.68} />
        </mesh>
        <mesh position={[0, 1.52, 0]} castShadow>
          <cylinderGeometry args={[0.14, 0.2, 0.28, 24]} />
          <meshStandardMaterial
            color={PALETTE.lampShade}
            emissive={PALETTE.lampShade}
            emissiveIntensity={showEmissives ? 0.38 : 0}
            roughness={0.65}
          />
        </mesh>
      </group>
    </group>
  );
};
