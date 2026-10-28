import React, { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';
import { TV_SPEC } from '../config/layout';
import { createStaticTvTexture } from '../screens/ScreenTexture';

export const TV: React.FC<{ showEmissives?: boolean }> = ({ showEmissives = true }) => {
  const tvTexture = useMemo(() => createStaticTvTexture(), []);

  useEffect(() => {
    return () => {
      tvTexture.dispose();
    };
  }, [tvTexture]);

  // Part 2:
  // - TV Console widened to 1.9 m (x: 2.55..4.45, inside floor x <= 4.5, z: -2.935..-2.515, inside z >= -3.0)
  // - TV Screen: 1.6 m wide x 0.9 m tall, thin bezel #3A2F2A, visible stand on console (base 0.45 m, neck 0.14 m),
  //   touching the console (y = 0.48 m), 0 degrees tilt, rotated 10 degrees (-10 deg around Y) toward the sofa.
  // - TV screen material: emissiveIntensity 0.55, toneMapped = true, roughness 0.35, metalness 0.
  return (
    <group name="TVEntertainmentUnit" position={[3.5, 0, -2.725]}>
      {/* Widened 1.9 m Console Cabinet (top surface at y = 0.27 + 0.21 = 0.48 m) */}
      <RoundedBox
        args={[1.9, 0.42, 0.42]}
        radius={0.03}
        smoothness={4}
        position={[0, 0.27, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color={PALETTE.consoleCabinet} roughness={0.72} />
      </RoundedBox>

      {/* Cabinet Doors */}
      {[-0.6, 0, 0.6].map((xDoor, idx) => (
        <RoundedBox
          key={idx}
          args={[0.54, 0.34, 0.025]}
          radius={0.012}
          smoothness={3}
          position={[xDoor, 0.27, 0.21]}
        >
          <meshStandardMaterial color={PALETTE.consoleDoors} roughness={0.7} />
        </RoundedBox>
      ))}

      {/* Short Wood Feet (y = 0..0.06) */}
      {[-0.82, 0.82].map((xFoot, idx) => (
        <mesh key={idx} position={[xFoot, 0.03, 0]}>
          <cylinderGeometry args={[0.026, 0.02, 0.06, 12]} />
          <meshStandardMaterial color={PALETTE.bookshelfWood} roughness={0.7} />
        </mesh>
      ))}

      {/* Game Console on right end of cabinet top (contact surface y = 0.48) */}
      <group position={[0.72, 0.518, 0.06]}>
        <RoundedBox args={[0.24, 0.075, 0.18]} radius={0.015} smoothness={3} castShadow>
          <meshStandardMaterial color={PALETTE.gameConsoleBody} roughness={0.65} />
        </RoundedBox>
        <mesh position={[0.08, 0.01, 0.092]}>
          <sphereGeometry args={[0.006, 8, 8]} />
          <meshStandardMaterial
            color={PALETTE.gameConsoleLed}
            emissive={PALETTE.gameConsoleLed}
            emissiveIntensity={showEmissives ? 0.45 : 0}
          />
        </mesh>
      </group>

      {/* Enlarged 1.6 x 0.9 m TV + Visible Stand resting flush on Console Top (y = 0.48), rotated -10 deg toward sofa, 0 deg tilt */}
      <group position={[0, 0.48, 0.105]} rotation={[0, TV_SPEC.rotationY, 0]}>
        {/* Stand Base Plate: 0.45 m wide, flush on console top (y = 0..0.022) */}
        <RoundedBox
          args={[0.45, 0.022, 0.24]}
          radius={0.008}
          smoothness={3}
          position={[0, 0.011, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.tvStand} roughness={0.65} />
        </RoundedBox>

        {/* Visible Stand Neck: 0.14 m tall (y = 0.01..0.15), connecting base to TV bottom bezel */}
        <RoundedBox
          args={[0.12, 0.14, 0.048]}
          radius={0.01}
          smoothness={2}
          position={[0, 0.08, -0.01]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.tvStand} roughness={0.65} />
        </RoundedBox>

        {/* Upright TV Panel (screen 1.6 x 0.9 m, thin bezel #3A2F2A 1.64 x 0.94 m, center at y = 0.60 -> world y = 1.08 m, 0 deg tilt) */}
        <group position={[0, 0.60, 0]}>
          {/* Solid Rear Housing flush against Front Bezel */}
          <RoundedBox
            args={[1.60, 0.90, 0.036]}
            radius={0.014}
            smoothness={4}
            position={[0, 0, -0.024]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={PALETTE.monitorRear} roughness={0.72} />
          </RoundedBox>

          {/* Thin Front Bezel (#3A2F2A, 1.64 x 0.94 m, bottom at y = 0.60 - 0.47 = 0.13 m meeting the 0.14 m neck) */}
          <RoundedBox
            args={[1.64, 0.94, 0.024]}
            radius={0.014}
            smoothness={4}
            position={[0, 0, 0.004]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={PALETTE.deviceBezelWarm} roughness={0.68} />
          </RoundedBox>

          {/* Active Display Surface (1.6 m wide x 0.9 m tall, emissiveIntensity 0.55, toneMapped true, roughness 0.35, metalness 0) */}
          <mesh name="tv-display-mesh" position={[0, 0, 0.017]}>
            <planeGeometry args={[TV_SPEC.width, TV_SPEC.height]} />
            <meshStandardMaterial
              color={PALETTE.screenDarkBg}
              map={tvTexture}
              emissive={PALETTE.starWhite}
              emissiveMap={tvTexture}
              emissiveIntensity={showEmissives ? 0.55 : 0.05}
              roughness={0.35}
              metalness={0}
              toneMapped={true}
            />
          </mesh>
        </group>
      </group>
    </group>
  );
};
