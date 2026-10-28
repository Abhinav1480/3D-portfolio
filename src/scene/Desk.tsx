import React, { useRef } from 'react';
import * as THREE from 'three';
import gsap from 'gsap';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';

export const Desk: React.FC<{ showEmissives?: boolean }> = ({ showEmissives = true }) => {
  const lampGroupRef = useRef<THREE.Group | null>(null);

  const handleLampClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!lampGroupRef.current) return;
    gsap.fromTo(
      lampGroupRef.current.rotation,
      { z: -0.09 },
      { z: 0, duration: 0.55, ease: 'elastic.out(1, 0.3)' }
    );
  };

  return (
    <group name="DeskArea">
      {/* Desk Top: x -3.2..0.2 (width 3.4m), z -2.9..-2.1 (depth 0.8m), top y = 0.75 */}
      <RoundedBox
        args={[3.4, 0.06, 0.8]}
        radius={0.025}
        smoothness={4}
        position={[-1.5, 0.72, -2.5]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={PALETTE.deskTop} roughness={0.68} metalness={0} />
      </RoundedBox>

      {/* Left Desk Legs & Frame */}
      <RoundedBox
        args={[0.06, 0.69, 0.06]}
        radius={0.015}
        smoothness={3}
        position={[-3.12, 0.345, -2.82]}
        castShadow
      >
        <meshStandardMaterial color={PALETTE.deskFrame} roughness={0.7} />
      </RoundedBox>
      <RoundedBox
        args={[0.06, 0.69, 0.06]}
        radius={0.015}
        smoothness={3}
        position={[-3.12, 0.345, -2.18]}
        castShadow
      >
        <meshStandardMaterial color={PALETTE.deskFrame} roughness={0.7} />
      </RoundedBox>
      <RoundedBox
        args={[0.06, 0.05, 0.68]}
        radius={0.012}
        smoothness={2}
        position={[-3.12, 0.12, -2.5]}
      >
        <meshStandardMaterial color={PALETTE.deskFrame} roughness={0.7} />
      </RoundedBox>

      {/* Mid Support Leg */}
      <RoundedBox
        args={[0.06, 0.69, 0.06]}
        radius={0.015}
        smoothness={3}
        position={[-1.65, 0.345, -2.82]}
        castShadow
      >
        <meshStandardMaterial color={PALETTE.deskFrame} roughness={0.7} />
      </RoundedBox>

      {/* Right Drawer Unit */}
      <group position={[-0.08, 0.345, -2.5]}>
        <RoundedBox args={[0.52, 0.69, 0.76]} radius={0.03} smoothness={4} castShadow receiveShadow>
          <meshStandardMaterial color={PALETTE.drawerUnit} roughness={0.74} />
        </RoundedBox>
        {[-0.18, 0.02, 0.22].map((yOff, idx) => (
          <group key={idx} position={[0, yOff, 0.385]}>
            <RoundedBox args={[0.46, 0.17, 0.02]} radius={0.01} smoothness={2}>
              <meshStandardMaterial color={PALETTE.deskFrame} roughness={0.7} />
            </RoundedBox>
            <RoundedBox args={[0.14, 0.022, 0.03]} radius={0.008} smoothness={2} position={[0, 0, 0.02]}>
              <meshStandardMaterial color={PALETTE.drawerHandle} roughness={0.5} />
            </RoundedBox>
          </group>
        ))}
      </group>

      {/* Desk Mat (1.1 x 0.45) */}
      <RoundedBox
        args={[1.1, 0.008, 0.45]}
        radius={0.004}
        smoothness={2}
        position={[-1.05, 0.754, -2.32]}
        receiveShadow
      >
        <meshStandardMaterial color={PALETTE.deskMat} roughness={0.82} />
      </RoundedBox>

      {/* Mechanical Keyboard (-1.05, 0.78, -2.25) */}
      <group position={[-1.05, 0.768, -2.25]}>
        <RoundedBox args={[0.36, 0.022, 0.13]} radius={0.008} smoothness={3} castShadow>
          <meshStandardMaterial color={PALETTE.keyboardCase} roughness={0.68} />
        </RoundedBox>
        <RoundedBox
          args={[0.28, 0.014, 0.095]}
          radius={0.004}
          smoothness={2}
          position={[-0.02, 0.014, 0]}
        >
          <meshStandardMaterial color={PALETTE.keyboardKeys} roughness={0.72} />
        </RoundedBox>
        <RoundedBox
          args={[0.025, 0.016, 0.022]}
          radius={0.003}
          smoothness={2}
          position={[-0.15, 0.015, -0.032]}
        >
          <meshStandardMaterial color={PALETTE.keyboardAccentOrange} roughness={0.65} />
        </RoundedBox>
        <RoundedBox
          args={[0.042, 0.016, 0.024]}
          radius={0.003}
          smoothness={2}
          position={[0.14, 0.015, 0.01]}
        >
          <meshStandardMaterial color={PALETTE.keyboardAccentGreen} roughness={0.65} />
        </RoundedBox>
        <RoundedBox
          args={[0.035, 0.016, 0.022]}
          radius={0.003}
          smoothness={2}
          position={[0.14, 0.015, -0.032]}
        >
          <meshStandardMaterial color={PALETTE.keyboardAccentBlue} roughness={0.65} />
        </RoundedBox>
      </group>

      {/* Mouse (-0.45, 0.78, -2.25) */}
      <RoundedBox
        args={[0.064, 0.028, 0.105]}
        radius={0.014}
        smoothness={4}
        position={[-0.45, 0.77, -2.25]}
        castShadow
      >
        <meshStandardMaterial color={PALETTE.mousePink} roughness={0.65} />
      </RoundedBox>

      {/* Fix 2: Speakers tucked at far back corners (-3.14 and +0.14, z = -2.82), completely behind all screen corridors */}
      {[-3.14, 0.14].map((xPos, idx) => (
        <group
          key={idx}
          position={[xPos, 0.825, -2.82]}
          rotation={[0, idx === 0 ? 0.2 : -0.2, 0]}
        >
          <RoundedBox args={[0.095, 0.15, 0.095]} radius={0.018} smoothness={3} castShadow>
            <meshStandardMaterial color={PALETTE.speakerBody} roughness={0.7} />
          </RoundedBox>
          <mesh position={[0, 0.026, 0.049]}>
            <circleGeometry args={[0.02, 16]} />
            <meshStandardMaterial color={PALETTE.speakerCone} roughness={0.75} />
          </mesh>
          <mesh position={[0, -0.028, 0.049]}>
            <circleGeometry args={[0.03, 16]} />
            <meshStandardMaterial color={PALETTE.speakerCone} roughness={0.75} />
          </mesh>
        </group>
      ))}

      {/* Mug + subtle steam sprite (opacity <= 0.3) */}
      <group position={[-1.62, 0.75, -2.25]}>
        <mesh position={[0, 0.045, 0]} castShadow>
          <cylinderGeometry args={[0.038, 0.034, 0.09, 18]} />
          <meshStandardMaterial color={PALETTE.mugOrange} roughness={0.62} />
        </mesh>
        <RoundedBox
          args={[0.022, 0.055, 0.014]}
          radius={0.006}
          smoothness={2}
          position={[-0.042, 0.045, 0]}
        >
          <meshStandardMaterial color={PALETTE.mugOrange} roughness={0.62} />
        </RoundedBox>
        <sprite position={[0, 0.13, 0]} scale={[0.06, 0.08, 1]}>
          <spriteMaterial color={PALETTE.drawerHandle} transparent opacity={0.22} depthWrite={false} />
        </sprite>
      </group>

      {/* Sticky Notes on Back Wall near Desk */}
      {[
        { pos: [-2.45, 1.38, -2.99], col: PALETTE.stickyYellow, rot: 0.06 },
        { pos: [-2.32, 1.42, -2.99], col: PALETTE.stickyPink, rot: -0.05 },
        { pos: [-2.38, 1.28, -2.99], col: PALETTE.stickyBlue, rot: 0.03 },
      ].map((note, idx) => (
        <RoundedBox
          key={idx}
          args={[0.085, 0.085, 0.006]}
          radius={0.002}
          smoothness={2}
          position={note.pos as [number, number, number]}
          rotation={[0, 0, note.rot]}
        >
          <meshStandardMaterial color={note.col} roughness={0.82} />
        </RoundedBox>
      ))}

      {/* Fix 2: Desk Lamp placed at far left end of the desk behind the laptop (x: -3.1, z: -2.7) */}
      <group
        ref={lampGroupRef}
        position={[-3.1, 0.75, -2.7]}
        onClick={handleLampClick}
      >
        <RoundedBox args={[0.13, 0.026, 0.13]} radius={0.012} smoothness={3} position={[0, 0.013, 0]}>
          <meshStandardMaterial color={PALETTE.lampBase} roughness={0.65} />
        </RoundedBox>
        <RoundedBox
          args={[0.022, 0.30, 0.022]}
          radius={0.008}
          smoothness={2}
          position={[-0.02, 0.16, 0]}
          rotation={[0, 0, 0.16]}
        >
          <meshStandardMaterial color={PALETTE.lampBase} roughness={0.65} />
        </RoundedBox>
        <mesh position={[0.03, 0.32, 0.02]} rotation={[0.18, 0, -0.3]} castShadow>
          <coneGeometry args={[0.08, 0.12, 20]} />
          <meshStandardMaterial
            color={PALETTE.lampShade}
            emissive={PALETTE.lampShade}
            emissiveIntensity={showEmissives ? 0.4 : 0}
            roughness={0.65}
          />
        </mesh>
      </group>
    </group>
  );
};
