import React from 'react';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';

export const Sofa: React.FC = () => {
  return (
    <group name="LivingArea">
      {/* Round Rug centered (-1.3, 0.008, 1.1) radius 1.5 */}
      <group position={[-1.3, 0.008, 1.1]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.5, 48]} />
          <meshStandardMaterial
            color={PALETTE.rugRing}
            roughness={0.86}
            polygonOffset
            polygonOffsetFactor={-1}
          />
        </mesh>
        <mesh position={[0, 0.003, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <circleGeometry args={[1.28, 48]} />
          <meshStandardMaterial
            color={PALETTE.rugCenter}
            roughness={0.85}
            polygonOffset
            polygonOffsetFactor={-2}
          />
        </mesh>
      </group>

      {/* Sofa against left wall under window, z 0.0..2.2 (center z = 1.1), facing +x */}
      <group position={[-2.96, 0, 1.1]}>
        {/* Wooden Feet */}
        {[
          [-0.34, 0.05, -0.96],
          [0.34, 0.05, -0.96],
          [-0.34, 0.05, 0.96],
          [0.34, 0.05, 0.96],
        ].map((pos, idx) => (
          <mesh key={idx} position={pos as [number, number, number]} castShadow>
            <cylinderGeometry args={[0.032, 0.024, 0.1, 12]} />
            <meshStandardMaterial color={PALETTE.sofaFeet} roughness={0.68} />
          </mesh>
        ))}

        {/* Sofa Base Frame */}
        <RoundedBox
          args={[0.86, 0.24, 2.16]}
          radius={0.05}
          smoothness={4}
          position={[0, 0.21, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.sofaBody} roughness={0.78} />
        </RoundedBox>

        {/* Sofa Backrest against Left Wall */}
        <RoundedBox
          args={[0.24, 0.56, 2.16]}
          radius={0.06}
          smoothness={4}
          position={[-0.31, 0.56, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.sofaBody} roughness={0.78} />
        </RoundedBox>

        {/* Armrests at z ends */}
        {[-0.98, 0.98].map((zOff, idx) => (
          <RoundedBox
            key={idx}
            args={[0.84, 0.36, 0.2]}
            radius={0.05}
            smoothness={4}
            position={[0, 0.44, zOff]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={PALETTE.sofaBody} roughness={0.78} />
          </RoundedBox>
        ))}

        {/* Three Seat Cushions */}
        {[-0.58, 0, 0.58].map((zOff, idx) => (
          <RoundedBox
            key={idx}
            args={[0.62, 0.14, 0.56]}
            radius={0.04}
            smoothness={4}
            position={[0.08, 0.38, zOff]}
            castShadow
            receiveShadow
          >
            <meshStandardMaterial color={PALETTE.cushionAmber} roughness={0.76} />
          </RoundedBox>
        ))}

        {/* Accent Throw Pillows */}
        <RoundedBox
          args={[0.14, 0.34, 0.34]}
          radius={0.045}
          smoothness={4}
          position={[-0.1, 0.56, -0.64]}
          rotation={[0.12, 0.18, -0.15]}
          castShadow
        >
          <meshStandardMaterial color={PALETTE.cushionGreen} roughness={0.78} />
        </RoundedBox>
        <RoundedBox
          args={[0.14, 0.32, 0.32]}
          radius={0.045}
          smoothness={4}
          position={[-0.08, 0.55, 0.62]}
          rotation={[-0.1, -0.15, -0.12]}
          castShadow
        >
          <meshStandardMaterial color={PALETTE.cushionCream} roughness={0.78} />
        </RoundedBox>

        {/* Soft Throw Blanket draped over front armrest */}
        <RoundedBox
          args={[0.48, 0.05, 0.26]}
          radius={0.02}
          smoothness={3}
          position={[0.14, 0.63, 0.96]}
          castShadow
        >
          <meshStandardMaterial color={PALETTE.sofaThrow} roughness={0.82} />
        </RoundedBox>
        <RoundedBox
          args={[0.46, 0.28, 0.05]}
          radius={0.02}
          smoothness={3}
          position={[0.14, 0.49, 1.09]}
          castShadow
        >
          <meshStandardMaterial color={PALETTE.sofaThrow} roughness={0.82} />
        </RoundedBox>
      </group>

      {/* Fix 5: Floor Pouf (cushionAmber) near the sofa */}
      <group position={[-1.95, 0, 1.85]}>
        <RoundedBox
          args={[0.48, 0.28, 0.48]}
          radius={0.12}
          smoothness={4}
          position={[0, 0.14, 0]}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial color={PALETTE.cushionAmber} roughness={0.78} />
        </RoundedBox>
      </group>

      {/* Fix 5: Small Side Table with a book and mug at the sofa end (-2.95, 0, -0.32) */}
      <group position={[-2.95, 0, -0.32]}>
        {/* Side table top */}
        <mesh position={[0, 0.5, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.24, 0.24, 0.036, 24]} />
          <meshStandardMaterial color={PALETTE.coffeeTableTop} roughness={0.68} />
        </mesh>
        {/* 3 wooden legs */}
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((ang, idx) => (
          <mesh
            key={idx}
            position={[Math.cos(ang) * 0.14, 0.24, Math.sin(ang) * 0.14]}
            castShadow
          >
            <cylinderGeometry args={[0.018, 0.014, 0.48, 10]} />
            <meshStandardMaterial color={PALETTE.coffeeTableLegs} roughness={0.7} />
          </mesh>
        ))}
        {/* Book on side table */}
        <RoundedBox
          args={[0.16, 0.028, 0.12]}
          radius={0.005}
          smoothness={2}
          position={[-0.04, 0.532, 0.03]}
          rotation={[0, 0.25, 0]}
          castShadow
        >
          <meshStandardMaterial color={PALETTE.bookSky} roughness={0.74} />
        </RoundedBox>
        {/* Mug on side table */}
        <mesh position={[0.07, 0.555, -0.04]} castShadow>
          <cylinderGeometry args={[0.03, 0.026, 0.07, 14]} />
          <meshStandardMaterial color={PALETTE.mugOrange} roughness={0.62} />
        </mesh>
      </group>

      {/* Coffee Table (-1.4, 0, 1.1) */}
      <group position={[-1.4, 0, 1.1]}>
        <mesh position={[0, 0.4, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.46, 0.46, 0.045, 32]} />
          <meshStandardMaterial color={PALETTE.coffeeTableTop} roughness={0.68} />
        </mesh>
        {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map((ang, idx) => (
          <mesh
            key={idx}
            position={[Math.cos(ang) * 0.28, 0.19, Math.sin(ang) * 0.28]}
            rotation={[Math.sin(ang) * 0.1, 0, -Math.cos(ang) * 0.1]}
            castShadow
          >
            <cylinderGeometry args={[0.024, 0.018, 0.38, 12]} />
            <meshStandardMaterial color={PALETTE.coffeeTableLegs} roughness={0.7} />
          </mesh>
        ))}

        {/* Pastel Stacked Books on Coffee Table (moved to back-left so phone is completely clear) */}
        <RoundedBox
          args={[0.20, 0.030, 0.15]}
          radius={0.006}
          smoothness={2}
          position={[-0.18, 0.437, -0.15]}
          rotation={[0, 0.25, 0]}
          castShadow
          userData={{ ignoreVisibilityRay: true }}
        >
          <meshStandardMaterial color={PALETTE.bookLilac} roughness={0.74} />
        </RoundedBox>
        <RoundedBox
          args={[0.17, 0.026, 0.13]}
          radius={0.006}
          smoothness={2}
          position={[-0.18, 0.465, -0.15]}
          rotation={[0, -0.12, 0]}
          castShadow
          userData={{ ignoreVisibilityRay: true }}
        >
          <meshStandardMaterial color={PALETTE.bookSky} roughness={0.74} />
        </RoundedBox>

        {/* Pink Coffee Cup (moved to back-right of coffee table clear of phone) */}
        <mesh
          position={[0.20, 0.455, -0.12]}
          castShadow
          userData={{ ignoreVisibilityRay: true }}
        >
          <cylinderGeometry args={[0.035, 0.028, 0.068, 16]} />
          <meshStandardMaterial color={PALETTE.coffeeCupPink} roughness={0.62} />
        </mesh>
      </group>
    </group>
  );
};
