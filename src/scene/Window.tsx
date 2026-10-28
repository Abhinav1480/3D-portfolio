import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';

export const Window: React.FC<{ showEmissives?: boolean }> = ({ showEmissives = true }) => {
  const starsRef = useRef<THREE.InstancedMesh | null>(null);

  // Exterior night gradient texture
  const nightSkyTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, PALETTE.exteriorNightTop);
      grad.addColorStop(1, PALETTE.exteriorNightBottom);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }, []);

  // ~40 tiny white stars positioned in the window aperture (z = -1.98..-0.92, y = 1.22..2.27)
  const starTransforms = useMemo(() => {
    const count = 40;
    const matrices: THREE.Matrix4[] = [];
    const dummy = new THREE.Object3D();
    let seed = 109;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    for (let i = 0; i < count; i++) {
      const y = 1.22 + rand() * 1.05;
      const z = -1.98 + rand() * 1.06;
      const s = 0.6 + rand() * 0.7;
      dummy.position.set(-3.76, y, z);
      dummy.scale.set(s, s, s);
      dummy.updateMatrix();
      matrices.push(dummy.matrix.clone());
    }
    return { count, matrices };
  }, []);

  useEffect(() => {
    const mesh = starsRef.current;
    if (!mesh) return;
    for (let i = 0; i < starTransforms.count; i++) {
      mesh.setMatrixAt(i, starTransforms.matrices[i]);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [starTransforms]);

  useEffect(() => {
    return () => {
      nightSkyTexture.dispose();
    };
  }, [nightSkyTexture]);

  // Window position on left wall: z -2.05..-0.85 (center z = -1.45, width = 1.20m), y 1.15..2.35 (center y = 1.75, height = 1.20m).
  // Outer casing edge is at z = -0.81m and outer curtain edge is at z = -0.68m, giving >= 0.49m clearance to the 3 certificate frames (z >= -0.19m).
  return (
    <group name="LeftWallWindow">
      {/* Exterior Night Sky Backdrop Plane */}
      <mesh position={[-3.78, 1.75, -1.45]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.28, 1.28]} />
        <meshBasicMaterial map={nightSkyTexture} />
      </mesh>

      {/* ~40 Tiny White Stars */}
      <instancedMesh ref={starsRef} args={[undefined, undefined, starTransforms.count]}>
        <sphereGeometry args={[0.008, 6, 6]} />
        <meshBasicMaterial color={PALETTE.starWhite} />
      </instancedMesh>

      {/* Moon (emissive <= 0.4, no halo) */}
      <mesh position={[-3.75, 2.06, -1.72]} rotation={[0, Math.PI / 2, 0]}>
        <circleGeometry args={[0.11, 24]} />
        <meshStandardMaterial
          color={PALETTE.moonColor}
          emissive={PALETTE.moonColor}
          emissiveIntensity={showEmissives ? 0.38 : 0}
          roughness={0.8}
        />
      </mesh>

      {/* Window Frame & Casing (outer z edges at -2.09 and -0.81) */}
      <RoundedBox
        args={[0.28, 0.06, 1.28]}
        radius={0.015}
        smoothness={3}
        position={[-3.62, 2.35, -1.45]}
      >
        <meshStandardMaterial color={PALETTE.windowFrameLight} roughness={0.7} />
      </RoundedBox>
      <RoundedBox
        args={[0.28, 1.26, 0.06]}
        radius={0.015}
        smoothness={3}
        position={[-3.62, 1.75, -2.05]}
      >
        <meshStandardMaterial color={PALETTE.windowFrameLight} roughness={0.7} />
      </RoundedBox>
      <RoundedBox
        args={[0.28, 1.26, 0.06]}
        radius={0.015}
        smoothness={3}
        position={[-3.62, 1.75, -0.85]}
      >
        <meshStandardMaterial color={PALETTE.windowFrameLight} roughness={0.7} />
      </RoundedBox>
      {/* Center Mullions */}
      <RoundedBox
        args={[0.06, 1.2, 0.04]}
        radius={0.01}
        smoothness={2}
        position={[-3.58, 1.75, -1.45]}
      >
        <meshStandardMaterial color={PALETTE.windowFrameLight} roughness={0.7} />
      </RoundedBox>
      <RoundedBox
        args={[0.06, 0.04, 1.2]}
        radius={0.01}
        smoothness={2}
        position={[-3.58, 1.75, -1.45]}
      >
        <meshStandardMaterial color={PALETTE.windowFrameLight} roughness={0.7} />
      </RoundedBox>

      {/* Wooden Sill (z = -2.13..-0.77) */}
      <RoundedBox
        args={[0.34, 0.06, 1.36]}
        radius={0.02}
        smoothness={3}
        position={[-3.58, 1.14, -1.45]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={PALETTE.windowSillWood} roughness={0.68} />
      </RoundedBox>

      {/* Glass Pane (20% opacity, emissive <= 0.4) */}
      <mesh position={[-3.6, 1.75, -1.45]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[1.16, 1.16]} />
        <meshStandardMaterial
          color={PALETTE.windowGlassTint}
          emissive={PALETTE.windowGlassTint}
          emissiveIntensity={showEmissives ? 0.22 : 0}
          transparent
          opacity={0.2}
          roughness={0.3}
          depthWrite={false}
        />
      </mesh>

      {/* Curtain Rod */}
      <mesh position={[-3.43, 2.46, -1.45]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.018, 0.018, 1.56, 12]} />
        <meshStandardMaterial color={PALETTE.windowSillWood} roughness={0.6} />
      </mesh>

      {/* Static Curtains open at both sides (right curtain outer edge at z = -0.68m) */}
      {[-2.11, -0.79].map((zPos, sideIdx) => (
        <group key={sideIdx} position={[-3.42, 1.72, zPos]}>
          <RoundedBox args={[0.09, 1.46, 0.22]} radius={0.04} smoothness={3} castShadow>
            <meshStandardMaterial color={PALETTE.curtainMain} roughness={0.82} />
          </RoundedBox>
          <RoundedBox
            args={[0.1, 1.44, 0.06]}
            radius={0.03}
            smoothness={3}
            position={[0.01, 0, -0.04]}
          >
            <meshStandardMaterial color={PALETTE.curtainFold} roughness={0.8} />
          </RoundedBox>
          <RoundedBox
            args={[0.1, 1.44, 0.06]}
            radius={0.03}
            smoothness={3}
            position={[0.01, 0, 0.04]}
          >
            <meshStandardMaterial color={PALETTE.curtainFold} roughness={0.8} />
          </RoundedBox>
          <RoundedBox
            args={[0.12, 0.06, 0.24]}
            radius={0.025}
            smoothness={3}
            position={[0.01, -0.22, 0]}
          >
            <meshStandardMaterial color={PALETTE.curtainTieBack} roughness={0.7} />
          </RoundedBox>
        </group>
      ))}
    </group>
  );
};
