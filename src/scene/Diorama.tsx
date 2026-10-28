import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { ContactShadows, RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';

function createFloorPlankGrainTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 2048; // >= 2048 px per 4 m
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // Near-white warm base so multiplying by per-plank instanceColor preserves exact palette colors
    ctx.fillStyle = '#FDFBF7';
    ctx.fillRect(0, 0, size, size);

    // Subtle horizontal wood grain fibers along X (no texel stretch)
    let seed = 4242;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < 420; i++) {
      const y = Math.floor(rand() * size);
      const h = 1 + Math.floor(rand() * 3);
      const alpha = 0.018 + rand() * 0.028;
      ctx.fillStyle =
        rand() > 0.45
          ? `rgba(184, 120, 70, ${alpha.toFixed(3)})`
          : `rgba(255, 252, 245, ${(alpha * 0.9).toFixed(3)})`;
      ctx.fillRect(0, y, size, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = 'floor-wood-grain-2048';
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 1);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  tex.userData = { category: 'floor', texelsPer4m: 2048 };
  tex.needsUpdate = true;
  return tex;
}

function createWallMatteTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, size, size);

    let seed = 9001;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    // Very subtle matte plaster micro-variation (<= 1.5% opacity) so wall palette color stays unchanged
    for (let i = 0; i < 600; i++) {
      const x = Math.floor(rand() * size);
      const y = Math.floor(rand() * size);
      const w = 8 + Math.floor(rand() * 24);
      const h = 8 + Math.floor(rand() * 24);
      ctx.fillStyle = 'rgba(226, 210, 180, 0.015)';
      ctx.fillRect(x, y, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = 'wall-matte-plaster-1024';
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = Math.min(16, Math.max(1, maxAnisotropy));
  tex.userData = { category: 'wall' };
  tex.needsUpdate = true;
  return tex;
}

export const Diorama: React.FC = () => {
  const { gl } = useThree();
  const planksRef = useRef<THREE.InstancedMesh | null>(null);

  const maxAnisotropy = useMemo(
    () => Math.min(16, gl.capabilities.getMaxAnisotropy() || 16),
    [gl]
  );

  const floorTexture = useMemo(
    () => createFloorPlankGrainTexture(maxAnisotropy),
    [maxAnisotropy]
  );
  const wallTexture = useMemo(() => createWallMatteTexture(maxAnisotropy), [maxAnisotropy]);

  useEffect(() => {
    return () => {
      floorTexture.dispose();
      wallTexture.dispose();
    };
  }, [floorTexture, wallTexture]);

  // Fix 4: Single-direction planks running along x (parallel to back wall), 1.2 m long, 0.18 m wide,
  // staggered like real flooring (offset each row by a random 0 to 0.6 m).
  // Low contrast: floorPlankA and floorPlankB (+/-4% lightness variation per plank), thin grooves floorGroove.
  const plankData = useMemo(() => {
    const floorMinX = -3.5;
    const floorMaxX = 4.5;
    const floorMinZ = -3.0;
    const floorMaxZ = 3.0;
    const nominalLen = 1.2;
    const nominalWidth = 0.18;
    const gapX = 0.006;
    const gapZ = 0.005;

    const rows = Math.round((floorMaxZ - floorMinZ) / nominalWidth); // 33 rows
    const actualRowWidth = (floorMaxZ - floorMinZ) / rows;

    const matrices: THREE.Matrix4[] = [];
    const colors: THREE.Color[] = [];
    const dummy = new THREE.Object3D();
    const baseA = new THREE.Color(PALETTE.floorPlankA);
    const baseB = new THREE.Color(PALETTE.floorPlankB);

    let seed = 1337;
    const nextRand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let r = 0; r < rows; r++) {
      const zCenter = floorMinZ + (r + 0.5) * actualRowWidth;
      // Offset each row by a random 0 to 0.6 m
      const rowOffset = nextRand() * 0.6;
      let xCursor = floorMinX - rowOffset;

      while (xCursor < floorMaxX - 0.02) {
        const segStart = Math.max(floorMinX, xCursor);
        const segEnd = Math.min(floorMaxX, xCursor + nominalLen);
        const segLen = segEnd - segStart - gapX;

        if (segLen > 0.05) {
          const xCenter = (segStart + segEnd) * 0.5;
          dummy.position.set(xCenter, 0.006, zCenter);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.set(segLen / nominalLen, 1, (actualRowWidth - gapZ) / nominalWidth);
          dummy.updateMatrix();
          matrices.push(dummy.matrix.clone());

          const col = (nextRand() > 0.48 ? baseA : baseB).clone();
          // +/- 4% lightness variation per plank
          const deltaL = (nextRand() - 0.5) * 0.08;
          col.offsetHSL(0, 0, deltaL);
          colors.push(col);
        }

        xCursor += nominalLen;
      }
    }

    return { count: matrices.length, matrices, colors, nominalLen, nominalWidth };
  }, []);

  useEffect(() => {
    const mesh = planksRef.current;
    if (!mesh) return;
    for (let i = 0; i < plankData.count; i++) {
      mesh.setMatrixAt(i, plankData.matrices[i]);
      mesh.setColorAt(i, plankData.colors[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [plankData]);

  return (
    <group name="DioramaShell">
      {/* Chunky rounded off-white plinth slab, 0.35m thick, extending 0.35m past floor on all sides */}
      <RoundedBox
        args={[8.7, 0.35, 6.7]}
        radius={0.08}
        smoothness={4}
        position={[0.5, -0.18, 0]}
        receiveShadow
      >
        <meshStandardMaterial color={PALETTE.plinth} roughness={0.78} metalness={0} />
      </RoundedBox>

      {/* Thin Floor Groove Underlay (polygonOffset to prevent any coplanar shimmer) */}
      <mesh position={[0.5, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8.02, 6.02]} />
        <meshStandardMaterial
          color={PALETTE.floorGroove}
          roughness={0.85}
          metalness={0}
          polygonOffset
          polygonOffsetFactor={1}
          polygonOffsetUnits={1}
        />
      </mesh>

      {/* Instanced Single-Direction Staggered Wood Floor Planks with 2048px anisotropic wood-grain texture */}
      <instancedMesh
        ref={planksRef}
        name="FloorPlanksInstanced"
        args={[undefined, undefined, plankData.count]}
        receiveShadow
      >
        <boxGeometry args={[plankData.nominalLen, 0.012, plankData.nominalWidth]} />
        <meshStandardMaterial map={floorTexture} roughness={0.74} metalness={0} />
      </instancedMesh>

      {/* Back Wall (z = -3.0, thickness 0.25m, x = -3.5..4.5, height 3.0m) */}
      <RoundedBox
        name="BackWallMain"
        args={[8.25, 3.0, 0.25]}
        radius={0.04}
        smoothness={4}
        position={[0.375, 1.5, -3.125]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={PALETTE.wallFace}
          map={wallTexture}
          roughness={0.76}
          metalness={0}
        />
      </RoundedBox>

      {/* Back Wall Wood Cap Top & Front Trim */}
      <RoundedBox
        args={[8.28, 0.07, 0.28]}
        radius={0.02}
        smoothness={3}
        position={[0.375, 3.035, -3.125]}
      >
        <meshStandardMaterial color={PALETTE.wallCapTop} roughness={0.65} metalness={0} />
      </RoundedBox>
      <RoundedBox
        args={[8.28, 0.045, 0.04]}
        radius={0.01}
        smoothness={2}
        position={[0.375, 2.99, -2.99]}
      >
        <meshStandardMaterial color={PALETTE.wallCapFront} roughness={0.65} metalness={0} />
      </RoundedBox>

      {/* Left Wall (x = -3.5, thickness 0.25m, z = -3.0..3.0, height 3.0m) with window cutout at z = -2.05..-0.85 */}
      <RoundedBox
        args={[0.25, 1.15, 6.0]}
        radius={0.03}
        smoothness={3}
        position={[-3.625, 0.575, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={PALETTE.wallFace}
          map={wallTexture}
          roughness={0.76}
          metalness={0}
        />
      </RoundedBox>

      <RoundedBox
        args={[0.25, 0.65, 6.0]}
        radius={0.03}
        smoothness={3}
        position={[-3.625, 2.675, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={PALETTE.wallFace}
          map={wallTexture}
          roughness={0.76}
          metalness={0}
        />
      </RoundedBox>

      {/* Left Wall solid segment behind window (z = -3.00..-2.05) */}
      <RoundedBox
        args={[0.25, 1.2, 0.95]}
        radius={0.03}
        smoothness={3}
        position={[-3.625, 1.75, -2.525]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={PALETTE.wallFace}
          map={wallTexture}
          roughness={0.76}
          metalness={0}
        />
      </RoundedBox>

      {/* Left Wall solid segment above sofa (z = -0.85..3.00) where the 3 certificate frames hang */}
      <RoundedBox
        args={[0.25, 1.2, 3.85]}
        radius={0.03}
        smoothness={3}
        position={[-3.625, 1.75, 1.075]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial
          color={PALETTE.wallEdge}
          map={wallTexture}
          roughness={0.76}
          metalness={0}
        />
      </RoundedBox>

      {/* Left Wall Wood Cap Top & Inner Edge */}
      <RoundedBox
        args={[0.28, 0.07, 6.26]}
        radius={0.02}
        smoothness={3}
        position={[-3.625, 3.035, -0.12]}
      >
        <meshStandardMaterial color={PALETTE.wallCapTop} roughness={0.65} metalness={0} />
      </RoundedBox>
      <RoundedBox
        args={[0.04, 0.045, 6.02]}
        radius={0.01}
        smoothness={2}
        position={[-3.49, 2.99, 0]}
      >
        <meshStandardMaterial color={PALETTE.wallCapFront} roughness={0.65} metalness={0} />
      </RoundedBox>

      {/* Baseboards and Trim */}
      <RoundedBox
        args={[8.0, 0.11, 0.03]}
        radius={0.01}
        smoothness={2}
        position={[0.5, 0.055, -2.985]}
      >
        <meshStandardMaterial color={PALETTE.baseboardTrim} roughness={0.7} metalness={0} />
      </RoundedBox>
      <RoundedBox
        args={[0.03, 0.11, 6.0]}
        radius={0.01}
        smoothness={2}
        position={[-3.485, 0.055, 0]}
      >
        <meshStandardMaterial color={PALETTE.baseboardTrim} roughness={0.7} metalness={0} />
      </RoundedBox>

      {/* Baked Contact Shadows (frames = 1, frozen on load per Section 4) */}
      <ContactShadows
        position={[0.5, 0.015, 0]}
        scale={10}
        blur={2.2}
        opacity={0.38}
        far={3.5}
        frames={1}
        color={PALETTE.floorGroove}
      />
    </group>
  );
};
