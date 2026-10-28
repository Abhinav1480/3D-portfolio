import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useThree } from '@react-three/fiber';
import gsap from 'gsap';
import { RoundedBox } from '@react-three/drei';
import { CERT_BOOK_PALETTE, PALETTE } from '../config/palette';
import {
  CertificateItem,
  SHELF_CERTIFICATES,
  preloadCertificateImage,
} from '../data/certificates';
import { CertificateRect } from './Props';
import { RegisterClickableMeshFn } from './Room';

export interface ShelfProps {
  reducedMotion?: boolean;
  canInteractWithCertificates?: boolean;
  activeCertificateIndex?: number | null;
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

// Retained second shelf row from the top:
// Group origin is at [1.6, 0, -2.8]. Back wall front face is at world z = -3.00 (local z = -0.20).
// Shelf board stays at y = 1.30 m (thickness = 0.036 m -> top surface at y = 1.318 m), width = 1.16 m,
// extending from local z = -0.199 (flush with the back wall at z = -3.00 with zero z-fighting)
// to local z = +0.170 (matching its original front edge).
const SHELF_BOARD_WIDTH = 1.16;
const SHELF_BOARD_THICKNESS = 0.036;
const SHELF_BOARD_Y = 1.30;
const SHELF_TOP_SURFACE_Y = SHELF_BOARD_Y + SHELF_BOARD_THICKNESS / 2; // 1.318 m
const SHELF_BACK_Z = -0.199;
const SHELF_FRONT_Z = 0.170;
const SHELF_BOARD_DEPTH = SHELF_FRONT_Z - SHELF_BACK_Z; // 0.369 m
const SHELF_BOARD_CENTER_Z = (SHELF_BACK_Z + SHELF_FRONT_Z) / 2; // -0.0145 m

// 8 interactive certificate books arranged cleanly side by side on the single retained shelf row
const CERT_BOOK_D = 0.21;
const CERT_BOOK_STEP_X = 0.084; // 8.4 cm center-to-center step -> 8 books span ~0.64 m centered on the 1.16 m shelf
const CERT_BOOK_BASE_Z = 0.055; // Centered comfortably on the shelf board depth
const CERT_BOOK_TILT_RAD = (2 * Math.PI) / 180; // Slight 2 deg forward pitch

// Subtle natural per-book variations in width, height, and slight Z lean (zero overlap, all inside shelf bounds)
const BOOK_VARIATIONS: readonly { width: number; height: number; leanZRad: number }[] = [
  { width: 0.046, height: 0.252, leanZRad: -0.012 },
  { width: 0.048, height: 0.262, leanZRad: 0.008 },
  { width: 0.045, height: 0.248, leanZRad: -0.006 },
  { width: 0.048, height: 0.266, leanZRad: 0.010 },
  { width: 0.046, height: 0.254, leanZRad: -0.008 },
  { width: 0.048, height: 0.264, leanZRad: 0.006 },
  { width: 0.045, height: 0.250, leanZRad: -0.010 },
  { width: 0.047, height: 0.258, leanZRad: 0.012 },
];

const MAX_BOOK_HEIGHT = Math.max(...BOOK_VARIATIONS.map((b) => b.height)); // 0.266 m
const HIGHEST_BOOK_TOP_Y = SHELF_TOP_SURFACE_Y + MAX_BOOK_HEIGHT; // 1.584 m

// "CERTIFICATES" 3D Wall Heading specs:
// - Vertical gap: 0.125 m above highest book top (within 0.10..0.16 m) -> heading bottom at y = 1.709 m
// - Text height: 0.152 m (within 0.14..0.18 m) -> heading center at y = 1.785 m
// - Total width: ~0.98 m (~84.5% of the 1.16 m shelf width, within 75%..90%)
// - Depth offset: back face at local z = -0.188 (1.2 cm in front of back wall face at z = -0.20)
const HEADING_GAP_ABOVE_BOOKS = 0.125;
const HEADING_TEXT_HEIGHT = 0.152;
const HEADING_CENTER_Y =
  HIGHEST_BOOK_TOP_Y + HEADING_GAP_ABOVE_BOOKS + HEADING_TEXT_HEIGHT / 2; // 1.785 m
const HEADING_Z = -0.188;

type LetterChar = 'C' | 'E' | 'R' | 'T' | 'I' | 'F' | 'A' | 'S';

/**
 * Builds crisp, bold geometric sans-serif 2D shapes in normalized coordinates (cap height = 1.0)
 * for each character in "CERTIFICATES". Rendered as true 3D ExtrudeGeometry so it has infinite
 * geometric edge sharpness at every zoom level.
 */
function createNormalizedLetterShapes(char: LetterChar): {
  shapes: THREE.Shape[];
  width: number;
} {
  const s = 0.215; // Bold stroke weight in normalized 0..1 cap-height units

  switch (char) {
    case 'I': {
      const w = 0.215;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, 1);
      shape.lineTo(0, 1);
      shape.closePath();
      return { shapes: [shape], width: w };
    }

    case 'T': {
      const w = 0.56;
      const stemLeft = (w - s) / 2;
      const stemRight = (w + s) / 2;
      const shape = new THREE.Shape();
      shape.moveTo(stemLeft, 0);
      shape.lineTo(stemRight, 0);
      shape.lineTo(stemRight, 1 - s);
      shape.lineTo(w, 1 - s);
      shape.lineTo(w, 1);
      shape.lineTo(0, 1);
      shape.lineTo(0, 1 - s);
      shape.lineTo(stemLeft, 1 - s);
      shape.closePath();
      return { shapes: [shape], width: w };
    }

    case 'F': {
      const w = 0.50;
      const midYBot = 0.42;
      const midYTop = 0.42 + s * 0.92;
      const midW = w * 0.86;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(s, 0);
      shape.lineTo(s, midYBot);
      shape.lineTo(midW, midYBot);
      shape.lineTo(midW, midYTop);
      shape.lineTo(s, midYTop);
      shape.lineTo(s, 1 - s);
      shape.lineTo(w, 1 - s);
      shape.lineTo(w, 1);
      shape.lineTo(0, 1);
      shape.closePath();
      return { shapes: [shape], width: w };
    }

    case 'E': {
      const w = 0.52;
      const midHalf = (s * 0.9) / 2;
      const midW = w * 0.86;
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(w, 0);
      shape.lineTo(w, s);
      shape.lineTo(s, s);
      shape.lineTo(s, 0.5 - midHalf);
      shape.lineTo(midW, 0.5 - midHalf);
      shape.lineTo(midW, 0.5 + midHalf);
      shape.lineTo(s, 0.5 + midHalf);
      shape.lineTo(s, 1 - s);
      shape.lineTo(w, 1 - s);
      shape.lineTo(w, 1);
      shape.lineTo(0, 1);
      shape.closePath();
      return { shapes: [shape], width: w };
    }

    case 'C': {
      const w = 0.58;
      const cx = 0.31;
      const cy = 0.50;
      const rxOut = 0.31;
      const ryOut = 0.50;
      const rxIn = Math.max(0.08, rxOut - s);
      const ryIn = Math.max(0.12, ryOut - s);
      const startAngle = 0.54;
      const endAngle = Math.PI * 2 - 0.54;
      const steps = 36;

      const shape = new THREE.Shape();
      for (let i = 0; i <= steps; i++) {
        const a = startAngle + (i / steps) * (endAngle - startAngle);
        const x = cx + Math.cos(a) * rxOut;
        const y = cy + Math.sin(a) * ryOut;
        if (i === 0) shape.moveTo(x, y);
        else shape.lineTo(x, y);
      }
      for (let i = steps; i >= 0; i--) {
        const a = startAngle + (i / steps) * (endAngle - startAngle);
        const x = cx + Math.cos(a) * rxIn;
        const y = cy + Math.sin(a) * ryIn;
        shape.lineTo(x, y);
      }
      shape.closePath();
      return { shapes: [shape], width: w };
    }

    case 'R': {
      const w = 0.58;
      const bowlCy = 0.70;
      const bowlRy = 0.30;
      const bowlCx = 0.29;
      const bowlRx = 0.27;
      const innerRy = bowlRy - s * 0.86;
      const innerRx = Math.max(0.06, bowlRx - s * 0.86);
      const arcSteps = 20;

      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(s, 0);
      shape.lineTo(s, 0.40);
      shape.lineTo(0.26, 0.40);
      shape.lineTo(w - s * 1.02, 0);
      shape.lineTo(w, 0);
      shape.lineTo(0.42, 0.43);

      for (let i = 0; i <= arcSteps; i++) {
        const a = -Math.PI * 0.42 + (i / arcSteps) * (Math.PI * 0.92);
        const x = bowlCx + Math.cos(a) * bowlRx;
        const y = bowlCy + Math.sin(a) * bowlRy;
        shape.lineTo(x, y);
      }
      shape.lineTo(0, 1);
      shape.closePath();

      // Counter hole inside upper bowl (clockwise)
      const hole = new THREE.Path();
      hole.moveTo(s, bowlCy - innerRy);
      hole.lineTo(s, bowlCy + innerRy);
      hole.lineTo(bowlCx, bowlCy + innerRy);
      for (let i = arcSteps; i >= 0; i--) {
        const a = -Math.PI * 0.5 + (i / arcSteps) * Math.PI;
        const x = bowlCx + Math.cos(a) * innerRx;
        const y = bowlCy + Math.sin(a) * innerRy;
        hole.lineTo(x, y);
      }
      hole.closePath();
      shape.holes.push(hole);

      return { shapes: [shape], width: w };
    }

    case 'A': {
      const w = 0.62;
      const midX = w / 2;
      const topHalfW = s * 0.52;
      const footW = s * 1.04;
      const barBot = 0.22;
      const barTop = 0.22 + s * 0.85;

      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(footW, 0);
      shape.lineTo(0.20, barBot);
      shape.lineTo(w - 0.20, barBot);
      shape.lineTo(w - footW, 0);
      shape.lineTo(w, 0);
      shape.lineTo(midX + topHalfW, 1);
      shape.lineTo(midX - topHalfW, 1);
      shape.closePath();

      // Upper triangle counter hole (clockwise)
      const hole = new THREE.Path();
      hole.moveTo(0.235, barTop);
      hole.lineTo(midX, 0.74);
      hole.lineTo(w - 0.235, barTop);
      hole.closePath();
      shape.holes.push(hole);

      return { shapes: [shape], width: w };
    }

    case 'S': {
      const w = 0.56;
      const halfThick = s * 0.47;

      // Smooth S-curve centerline from top-right to bottom-left via two cubic Bezier segments
      const p0 = new THREE.Vector2(0.50, 0.78);
      const p1 = new THREE.Vector2(0.42, 0.96);
      const p2 = new THREE.Vector2(0.10, 0.95);
      const p3 = new THREE.Vector2(0.11, 0.72);

      const p4 = new THREE.Vector2(0.12, 0.50);
      const p5 = new THREE.Vector2(0.46, 0.49);
      const p6 = new THREE.Vector2(0.47, 0.26);

      const p7 = new THREE.Vector2(0.48, 0.04);
      const p8 = new THREE.Vector2(0.14, 0.03);
      const p9 = new THREE.Vector2(0.05, 0.23);

      const evalCubic = (
        a: THREE.Vector2,
        b: THREE.Vector2,
        c: THREE.Vector2,
        d: THREE.Vector2,
        t: number
      ): THREE.Vector2 => {
        const u = 1 - t;
        return new THREE.Vector2(
          u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
          u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y
        );
      };

      const spine: THREE.Vector2[] = [];
      const segSamples = 16;
      for (let i = 0; i <= segSamples; i++) {
        spine.push(evalCubic(p0, p1, p2, p3, i / segSamples));
      }
      for (let i = 1; i <= segSamples; i++) {
        spine.push(evalCubic(p3, p4, p5, p6, i / segSamples));
      }
      for (let i = 1; i <= segSamples; i++) {
        spine.push(evalCubic(p6, p7, p8, p9, i / segSamples));
      }

      const leftPts: THREE.Vector2[] = [];
      const rightPts: THREE.Vector2[] = [];
      for (let i = 0; i < spine.length; i++) {
        const prev = spine[Math.max(0, i - 1)];
        const next = spine[Math.min(spine.length - 1, i + 1)];
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const len = Math.hypot(tx, ty) || 1;
        const nx = -ty / len;
        const ny = tx / len;
        leftPts.push(
          new THREE.Vector2(spine[i].x + nx * halfThick, spine[i].y + ny * halfThick)
        );
        rightPts.push(
          new THREE.Vector2(spine[i].x - nx * halfThick, spine[i].y - ny * halfThick)
        );
      }

      const shape = new THREE.Shape();
      leftPts.forEach((pt, idx) => {
        if (idx === 0) shape.moveTo(pt.x, pt.y);
        else shape.lineTo(pt.x, pt.y);
      });
      for (let i = rightPts.length - 1; i >= 0; i--) {
        shape.lineTo(rightPts[i].x, rightPts[i].y);
      }
      shape.closePath();
      return { shapes: [shape], width: w };
    }
  }
}

function buildCertificatesHeadingGeometry(): THREE.BufferGeometry {
  const word: LetterChar[] = ['C', 'E', 'R', 'T', 'I', 'F', 'I', 'C', 'A', 'T', 'E', 'S'];
  const tracking = 0.11; // Generous tracking so letters never merge at a distance
  const letterData = word.map((ch) => createNormalizedLetterShapes(ch));

  const totalNormalizedWidth =
    letterData.reduce((acc, item) => acc + item.width, 0) +
    tracking * (word.length - 1);

  const allShapes: THREE.Shape[] = [];
  let cursorX = -totalNormalizedWidth / 2;

  for (let i = 0; i < letterData.length; i++) {
    const { shapes, width } = letterData[i];
    const offsetX = cursorX;
    const offsetY = -0.5; // Center vertically around 0

    for (const srcShape of shapes) {
      const pts = srcShape.getPoints(24).map(
        (p) => new THREE.Vector2(p.x + offsetX, p.y + offsetY)
      );
      const translatedShape = new THREE.Shape(pts);
      for (const h of srcShape.holes) {
        const hPts = h.getPoints(24).map(
          (p) => new THREE.Vector2(p.x + offsetX, p.y + offsetY)
        );
        const translatedHole = new THREE.Path(hPts);
        translatedShape.holes.push(translatedHole);
      }
      allShapes.push(translatedShape);
    }

    cursorX += width + tracking;
  }

  // Scale normalized cap-height (1.0) to HEADING_TEXT_HEIGHT (0.152 m).
  // Total width in world units = totalNormalizedWidth (~6.42) * 0.152 = ~0.976 m (~84% of 1.16 m shelf width).
  const geo = new THREE.ExtrudeGeometry(allShapes, {
    depth: 0.014 / HEADING_TEXT_HEIGHT,
    bevelEnabled: true,
    bevelThickness: 0.002 / HEADING_TEXT_HEIGHT,
    bevelSize: 0.0015 / HEADING_TEXT_HEIGHT,
    bevelSegments: 2,
    curveSegments: 16,
  });

  geo.scale(HEADING_TEXT_HEIGHT, HEADING_TEXT_HEIGHT, HEADING_TEXT_HEIGHT);
  geo.computeBoundingBox();
  if (geo.boundingBox) {
    const centerX = (geo.boundingBox.min.x + geo.boundingBox.max.x) * 0.5;
    const centerY = (geo.boundingBox.min.y + geo.boundingBox.max.y) * 0.5;
    geo.translate(-centerX, -centerY, 0);
  }
  geo.computeVertexNormals();
  return geo;
}

function projectBookToScreenRect(
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
    width: Math.max(20, maxX - minX),
    height: Math.max(28, maxY - minY),
  };
}

interface CertificateBookMeshProps {
  cert: CertificateItem;
  bookIndex: number; // 0..7
  viewerIndex: number; // 3..10
  color: string;
  isPulledOut: boolean;
  reducedMotion: boolean;
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

const CertificateBookMesh: React.FC<CertificateBookMeshProps> = ({
  cert,
  bookIndex,
  viewerIndex,
  color,
  isPulledOut,
  reducedMotion,
  canInteract,
  onHoverChange,
  registerClickableMesh,
  onOpenCertificate,
  registerCertificateRectGetter,
}) => {
  const { camera, size, invalidate } = useThree();
  const groupRef = useRef<THREE.Group | null>(null);
  const hoveredRef = useRef(false);
  const openingRef = useRef(false);
  const preloadTimerRef = useRef<number | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; time: number } | null>(null);

  const canInteractRef = useRef(canInteract);
  canInteractRef.current = canInteract;
  const isPulledOutRef = useRef(isPulledOut);
  isPulledOutRef.current = isPulledOut;
  const reducedMotionRef = useRef(reducedMotion);
  reducedMotionRef.current = reducedMotion;
  const onHoverChangeRef = useRef(onHoverChange);
  onHoverChangeRef.current = onHoverChange;

  const variation = BOOK_VARIATIONS[bookIndex % BOOK_VARIATIONS.length];
  const bookW = variation.width;
  const bookH = variation.height;
  const bookLeanZ = variation.leanZRad;

  // Horizontally centered across the retained shelf
  const baseX = (bookIndex - 3.5) * CERT_BOOK_STEP_X;
  const baseY = SHELF_TOP_SURFACE_Y + bookH / 2;

  // Register 3D-to-2D screen rect getter for FLIP open/close animation
  useEffect(() => {
    if (!registerCertificateRectGetter) return;
    registerCertificateRectGetter(viewerIndex, () => {
      if (!groupRef.current) return null;
      return projectBookToScreenRect(groupRef.current, camera, size);
    });
  }, [registerCertificateRectGetter, viewerIndex, camera, size]);

  // Register this certificate book with the throttled hover raycaster in Room.tsx
  useEffect(() => {
    if (!registerClickableMesh || !groupRef.current) return;
    return registerClickableMesh(groupRef.current, {
      id: `shelf-book-${cert.id}`,
      onHoverMove: () => {
        if (!canInteractRef.current || openingRef.current) return false;
        if (!hoveredRef.current) {
          hoveredRef.current = true;
          onHoverChangeRef.current({ index: viewerIndex, title: cert.title });

          // Preload certificate image after 150 ms of hover (never on scene load)
          if (preloadTimerRef.current !== null) {
            window.clearTimeout(preloadTimerRef.current);
          }
          preloadTimerRef.current = window.setTimeout(() => {
            preloadCertificateImage(cert.imageUrl);
            preloadTimerRef.current = null;
          }, 150);

          if (groupRef.current && !isPulledOutRef.current) {
            gsap.to(groupRef.current.position, {
              y: baseY + 0.04, // Lifts 4 cm on hover
              duration: reducedMotionRef.current ? 0.05 : 0.2,
              ease: 'power2.out',
              onUpdate: () => invalidate(),
            });
          }
        }
        return true;
      },
      onHoverLeave: () => {
        if (preloadTimerRef.current !== null) {
          window.clearTimeout(preloadTimerRef.current);
          preloadTimerRef.current = null;
        }
        if (!hoveredRef.current) return;
        hoveredRef.current = false;
        onHoverChangeRef.current(null);

        if (groupRef.current && !isPulledOutRef.current && !openingRef.current) {
          gsap.to(groupRef.current.position, {
            y: baseY,
            duration: reducedMotionRef.current ? 0.05 : 0.2,
            ease: 'power2.out',
            onUpdate: () => invalidate(),
          });
        }
      },
    });
  }, [registerClickableMesh, cert.id, cert.title, cert.imageUrl, viewerIndex, baseY, invalidate]);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (preloadTimerRef.current !== null) {
        window.clearTimeout(preloadTimerRef.current);
      }
    };
  }, []);

  // Slide the book back into place when the viewer closes or switches to a different certificate
  useEffect(() => {
    if (!groupRef.current) return;
    if (!isPulledOut && !openingRef.current) {
      const targetY = hoveredRef.current && canInteract ? baseY + 0.04 : baseY;
      gsap.to(groupRef.current.position, {
        x: baseX,
        y: targetY,
        z: CERT_BOOK_BASE_Z,
        duration: reducedMotion ? 0.05 : 0.25,
        ease: 'power2.out',
        onUpdate: () => invalidate(),
      });
      gsap.to(groupRef.current.rotation, {
        x: CERT_BOOK_TILT_RAD,
        y: 0,
        z: bookLeanZ,
        duration: reducedMotion ? 0.05 : 0.25,
        ease: 'power2.out',
        onUpdate: () => invalidate(),
      });
    }
  }, [isPulledOut, canInteract, baseX, baseY, bookLeanZ, reducedMotion, invalidate]);

  // Reset hover if interaction becomes disabled
  useEffect(() => {
    if (!canInteract && hoveredRef.current) {
      hoveredRef.current = false;
      if (preloadTimerRef.current !== null) {
        window.clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
      if (groupRef.current && !isPulledOut && !openingRef.current) {
        gsap.to(groupRef.current.position, {
          y: baseY,
          duration: 0.2,
          ease: 'power2.out',
          onUpdate: () => invalidate(),
        });
      }
    }
  }, [canInteract, isPulledOut, baseY, invalidate]);

  const handlePointerDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!canInteract || openingRef.current) return;
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
    if (!down || !canInteract || openingRef.current) return;

    const dx = e.nativeEvent.clientX - down.x;
    const dy = e.nativeEvent.clientY - down.y;
    const dist = Math.hypot(dx, dy);
    const dt = performance.now() - down.time;

    // Click guard: pointer moved < 6 px and press lasted < 400 ms
    if (dist < 6 && dt < 400) {
      if (preloadTimerRef.current !== null) {
        window.clearTimeout(preloadTimerRef.current);
        preloadTimerRef.current = null;
      }
      preloadCertificateImage(cert.imageUrl);
      hoveredRef.current = false;
      openingRef.current = true;
      onHoverChange(null);

      const grp = groupRef.current;
      if (!grp) {
        openingRef.current = false;
        onOpenCertificate?.(viewerIndex, null, null);
        return;
      }

      // Slide out 8 cm and tilt slightly over 0.3 s, then open the viewer
      const slideDur = reducedMotion ? 0.05 : 0.3;
      gsap.to(grp.position, {
        y: baseY + 0.02,
        z: CERT_BOOK_BASE_Z + 0.08,
        duration: slideDur,
        ease: 'power2.out',
        onUpdate: () => invalidate(),
      });
      gsap.to(grp.rotation, {
        x: CERT_BOOK_TILT_RAD + 0.09,
        z: bookLeanZ - 0.035,
        duration: slideDur,
        ease: 'power2.out',
        onUpdate: () => invalidate(),
        onComplete: () => {
          openingRef.current = false;
          const rect = projectBookToScreenRect(grp, camera, size);
          onOpenCertificate?.(viewerIndex, rect, null);
        },
      });
    }
  };

  return (
    <group
      ref={groupRef}
      name={`CertBook-${cert.id}`}
      position={[baseX, baseY, CERT_BOOK_BASE_Z]}
      rotation={[CERT_BOOK_TILT_RAD, 0, bookLeanZ]}
      userData={{
        ignoreForCamera: true,
        certificateId: cert.id,
        certificateIndex: viewerIndex,
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {/* Book Cover / Spine Body */}
      <RoundedBox
        args={[bookW, bookH, CERT_BOOK_D]}
        radius={0.005}
        smoothness={2}
        castShadow
        receiveShadow
        userData={{ ignoreForCamera: true }}
      >
        <meshStandardMaterial color={color} roughness={0.68} metalness={0} />
      </RoundedBox>

      {/* Thin Gold Band (#F2B84B) across the upper spine */}
      <mesh
        position={[0, bookH * 0.28, CERT_BOOK_D / 2 + 0.0012]}
        userData={{ ignoreForCamera: true }}
      >
        <boxGeometry args={[bookW + 0.001, 0.008, 0.0025]} />
        <meshStandardMaterial
          color={PALETTE.certGold}
          roughness={0.45}
          metalness={0.2}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>

      {/* Small Gold Ribbon (#F2B84B) hanging 3 cm down from the top of the spine */}
      <mesh
        position={[0, bookH / 2 - 0.015, CERT_BOOK_D / 2 + 0.0018]}
        userData={{ ignoreForCamera: true }}
      >
        <boxGeometry args={[0.009, 0.03, 0.003]} />
        <meshStandardMaterial
          color={PALETTE.certGold}
          roughness={0.45}
          metalness={0.2}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
      <mesh
        position={[0, bookH / 2 + 0.001, CERT_BOOK_D / 2 - 0.012]}
        userData={{ ignoreForCamera: true }}
      >
        <boxGeometry args={[0.009, 0.0025, 0.028]} />
        <meshStandardMaterial
          color={PALETTE.certGold}
          roughness={0.45}
          metalness={0.2}
          polygonOffset
          polygonOffsetFactor={-1}
          polygonOffsetUnits={-1}
        />
      </mesh>
    </group>
  );
};

export const Shelf: React.FC<ShelfProps> = ({
  reducedMotion = false,
  canInteractWithCertificates = true,
  activeCertificateIndex = null,
  onHoverCertificateChange,
  registerClickableMesh,
  onOpenCertificate,
  registerCertificateRectGetter,
}) => {
  const headingGeo = useMemo(() => buildCertificatesHeadingGeometry(), []);

  useEffect(() => {
    return () => {
      headingGeo.dispose();
    };
  }, [headingGeo]);

  // Single wall-mounted floating shelf retained from the second row from the top (y = 1.30 m)
  // at the exact existing bookshelf X/Z anchor [1.6, 0, -2.8]
  return (
    <group name="Bookshelf" position={[1.6, 0, -2.8]}>
      {/* 3D Extruded Wall Heading "CERTIFICATES" centered directly above the retained shelf */}
      <mesh
        name="ShelfCertificatesWallHeading"
        geometry={headingGeo}
        position={[0, HEADING_CENTER_Y, HEADING_Z]}
        castShadow
        receiveShadow
        userData={{ ignoreForCamera: true }}
      >
        <meshStandardMaterial
          color={PALETTE.deviceBezelWarm}
          roughness={0.68}
          metalness={0}
        />
      </mesh>

      {/* Retained Second Shelf Row from the Top (y = 1.30 m, width = 1.16 m, thickness = 0.036 m),
          mounted flush against the back wall (local z = -0.199) */}
      <RoundedBox
        name="FloatingCertificateShelfBoard"
        args={[SHELF_BOARD_WIDTH, SHELF_BOARD_THICKNESS, SHELF_BOARD_DEPTH]}
        radius={0.01}
        smoothness={3}
        position={[0, SHELF_BOARD_Y, SHELF_BOARD_CENTER_Z]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={PALETTE.bookshelfWood} roughness={0.68} />
      </RoundedBox>

      {/* Two compact, discreet under-shelf wall brackets mounted flush against the back wall */}
      {[-0.42, 0.42].map((xBracket, idx) => (
        <group key={idx} position={[xBracket, SHELF_BOARD_Y - SHELF_BOARD_THICKNESS / 2, 0]}>
          {/* Vertical wall plate flush against the back wall */}
          <RoundedBox
            args={[0.034, 0.11, 0.016]}
            radius={0.004}
            smoothness={2}
            position={[0, -0.055, SHELF_BACK_Z + 0.008]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={PALETTE.bookshelfBack} roughness={0.72} />
          </RoundedBox>
          {/* Horizontal under-shelf support arm */}
          <RoundedBox
            args={[0.030, 0.016, 0.24]}
            radius={0.004}
            smoothness={2}
            position={[0, -0.008, SHELF_BACK_Z + 0.12]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={PALETTE.bookshelfBack} roughness={0.72} />
          </RoundedBox>
        </group>
      ))}

      {/* All 8 Individually Raycast-Pickable Certificate Books consolidated side by side on the retained shelf */}
      {SHELF_CERTIFICATES.map((cert, idx) => {
        const viewerIdx = idx + 3; // Viewer indices 3..10 (1-based 4..11)
        return (
          <CertificateBookMesh
            key={cert.id}
            cert={cert}
            bookIndex={idx}
            viewerIndex={viewerIdx}
            color={CERT_BOOK_PALETTE[idx % CERT_BOOK_PALETTE.length]}
            isPulledOut={activeCertificateIndex === viewerIdx}
            reducedMotion={reducedMotion}
            canInteract={canInteractWithCertificates}
            onHoverChange={(info) => onHoverCertificateChange?.(info)}
            registerClickableMesh={registerClickableMesh}
            onOpenCertificate={onOpenCertificate}
            registerCertificateRectGetter={registerCertificateRectGetter}
          />
        );
      })}
    </group>
  );
};
