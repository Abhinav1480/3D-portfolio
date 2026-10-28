import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PALETTE } from '../config/palette';

export const Dust: React.FC<{ reducedMotion: boolean }> = ({ reducedMotion }) => {
  const pointsRef = useRef<THREE.Points | null>(null);
  const { size } = useThree();
  const isMobile = size.width <= 768;
  const count = isMobile ? 75 : 150;

  const { geometry, speeds } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const spd = new Float32Array(count);

    let seed = 31337;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      positions[i * 3] = -3.1 + rand() * 7.2;
      positions[i * 3 + 1] = 0.25 + rand() * 2.5;
      positions[i * 3 + 2] = -2.6 + rand() * 5.2;
      spd[i] = 0.02 + rand() * 0.03;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { geometry: geo, speeds: spd };
  }, [count]);

  useFrame((_, delta) => {
    if (reducedMotion || !pointsRef.current) return;
    const dt = Math.min(delta, 0.05);
    const posAttr = pointsRef.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = posAttr.array as Float32Array;

    for (let i = 0; i < count; i++) {
      let y = arr[i * 3 + 1] + speeds[i] * dt;
      if (y > 2.75) y = 0.25;
      arr[i * 3 + 1] = y;
    }
    posAttr.needsUpdate = true;
  });

  return (
    <points
      ref={pointsRef}
      geometry={geometry}
      userData={{ ignoreVisibilityRay: true }}
    >
      <pointsMaterial
        color={PALETTE.nameSignWarmWhite}
        size={0.022}
        transparent
        opacity={0.26}
        depthWrite={false}
      />
    </points>
  );
};
