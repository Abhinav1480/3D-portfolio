import React from 'react';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';

export const Chair: React.FC = () => {
  // Chair at (-1.2, 0, -1.25) facing -z (toward the desk)
  const spokes = [0, 1, 2, 3, 4].map((i) => (i * Math.PI * 2) / 5);

  return (
    <group name="DeskChairArea">
      {/* Fix 5: Second rug layer under the desk chair (rugPatternGold) */}
      <group position={[-1.2, 0.008, -1.35]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.78, 40]} />
          <meshStandardMaterial
            color={PALETTE.rugRing}
            roughness={0.86}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
        <mesh position={[0, 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[0.68, 40]} />
          <meshStandardMaterial
            color={PALETTE.rugCenter}
            roughness={0.85}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      </group>

      <group name="DeskChair" position={[-1.2, 0, -1.25]}>
        {/* Central gas lift column */}
        <mesh position={[0, 0.24, 0]} castShadow>
          <cylinderGeometry args={[0.028, 0.032, 0.36, 14]} />
          <meshStandardMaterial color={PALETTE.chairBase} roughness={0.65} />
        </mesh>

        {/* Five-star wheeled base */}
        {spokes.map((angle, idx) => (
          <group key={idx} rotation={[0, angle, 0]}>
            <RoundedBox
              args={[0.036, 0.028, 0.26]}
              radius={0.01}
              smoothness={2}
              position={[0, 0.065, 0.12]}
              rotation={[0.08, 0, 0]}
              castShadow
            >
              <meshStandardMaterial color={PALETTE.chairBase} roughness={0.68} />
            </RoundedBox>
            {/* Caster Wheel */}
            <mesh position={[0, 0.028, 0.24]} rotation={[0, 0, Math.PI / 2]}>
              <cylinderGeometry args={[0.026, 0.026, 0.024, 12]} />
              <meshStandardMaterial color={PALETTE.chairWheel} roughness={0.75} />
            </mesh>
          </group>
        ))}

        {/* Seat cushion */}
        <RoundedBox
          args={[0.48, 0.085, 0.46]}
          radius={0.035}
          smoothness={4}
          position={[0, 0.45, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.chairSeat} roughness={0.74} />
        </RoundedBox>

        {/* Backrest on the +z side so chair faces -z toward desk */}
        <RoundedBox
          args={[0.45, 0.42, 0.075]}
          radius={0.032}
          smoothness={4}
          position={[0, 0.72, 0.21]}
          rotation={[0.08, 0, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.chairSeat} roughness={0.74} />
        </RoundedBox>

        {/* Back Spine Support */}
        <RoundedBox
          args={[0.06, 0.26, 0.04]}
          radius={0.015}
          smoothness={2}
          position={[0, 0.56, 0.23]}
        >
          <meshStandardMaterial color={PALETTE.chairBase} roughness={0.68} />
        </RoundedBox>

        {/* Armrests */}
        {[-0.25, 0.25].map((xArm, idx) => (
          <group key={idx} position={[xArm, 0.54, 0.02]}>
            <RoundedBox args={[0.032, 0.16, 0.032]} radius={0.01} smoothness={2} position={[0, -0.02, 0]}>
              <meshStandardMaterial color={PALETTE.chairBase} roughness={0.68} />
            </RoundedBox>
            <RoundedBox args={[0.055, 0.028, 0.24]} radius={0.01} smoothness={3} position={[0, 0.065, 0]}>
              <meshStandardMaterial color={PALETTE.chairBase} roughness={0.68} />
            </RoundedBox>
          </group>
        ))}
      </group>
    </group>
  );
};
