import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';
import { SCREEN_SPECS, ScreenId } from '../config/layout';
import { ScreenTextureController } from '../screens/ScreenTexture';
import { findHitRegionAtUV, HitActionType } from '../screens/hitRegions';
import { RegisterClickableMeshFn } from './Room';

export interface InteractiveScreenProps {
  controller: ScreenTextureController;
  isFocused: boolean;
  showEmissives: boolean;
  onFocusScreen: (screenId: ScreenId) => void;
  onExecuteHitAction: (screenId: ScreenId, action: HitActionType) => void;
  onHoverScreenChange: (info: { screenId: ScreenId; label: string } | null) => void;
  registerClickableMesh: RegisterClickableMeshFn;
}

export const Laptop: React.FC<InteractiveScreenProps> = ({
  controller,
  isFocused,
  showEmissives,
  onFocusScreen,
  onExecuteHitAction,
  onHoverScreenChange,
  registerClickableMesh,
}) => {
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const displayMeshRef = useRef<THREE.Mesh | null>(null);
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const onHoverScreenChangeRef = useRef(onHoverScreenChange);
  onHoverScreenChangeRef.current = onHoverScreenChange;

  const spec = SCREEN_SPECS[0]; // 'about' screen on laptop

  useEffect(() => {
    const mesh = displayMeshRef.current;
    if (!mesh) return;
    return registerClickableMesh(mesh, {
      id: 'screen-about',
      screenId: 'about',
      onHoverMove: (uv) => {
        if (!hoveredRef.current) {
          hoveredRef.current = true;
          setHovered(true);
          onHoverScreenChangeRef.current({ screenId: 'about', label: 'About (Laptop)' });
        }
        if (uv) {
          const hit = findHitRegionAtUV(controller.hitRegions, uv.x, uv.y);
          controller.setHoveredRegion(hit ? hit.id : null);
          if (isFocusedRef.current) {
            return Boolean(hit);
          }
          return true;
        }
        controller.setHoveredRegion(null);
        return !isFocusedRef.current;
      },
      onHoverLeave: () => {
        if (!hoveredRef.current) return;
        hoveredRef.current = false;
        setHovered(false);
        controller.setHoveredRegion(null);
        onHoverScreenChangeRef.current(null);
      },
    });
  }, [registerClickableMesh, controller]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const hit = e.uv ? findHitRegionAtUV(controller.hitRegions, e.uv.x, e.uv.y) : null;
    if (hit) {
      onExecuteHitAction('about', hit.action);
      if (!isFocused && hit.action.type === 'page') {
        onFocusScreen('about');
      }
      return;
    }
    if (!isFocused) {
      onFocusScreen('about');
    }
  };

  return (
    <group name="LaptopGroup" userData={{ screenId: 'about' }}>
      {/* Laptop Base centered at (-2.75, 0.76, -2.30), angled +12 deg toward viewer */}
      <group
        position={[-2.75, 0.76, -2.30]}
        rotation={[0, spec.rotation[1], 0]}
        userData={{ screenId: 'about' }}
      >
        {/* Aluminium base () */}
        <RoundedBox
          args={[0.38, 0.018, 0.26]}
          radius={0.007}
          smoothness={3}
          castShadow
          receiveShadow
          userData={{ screenId: 'about' }}
        >
          <meshStandardMaterial color={PALETTE.laptopBody} roughness={0.62} metalness={0.12} />
        </RoundedBox>

        {/* Keyboard well ( keys with  legends hint) */}
        <RoundedBox
          args={[0.32, 0.006, 0.13]}
          radius={0.003}
          smoothness={2}
          position={[0, 0.009, -0.025]}
          userData={{ screenId: 'about' }}
        >
          <meshStandardMaterial color={PALETTE.laptopKeys} roughness={0.75} />
        </RoundedBox>

        {/* Trackpad () */}
        <RoundedBox
          args={[0.11, 0.004, 0.068]}
          radius={0.002}
          smoothness={2}
          position={[0, 0.009, 0.08]}
          userData={{ screenId: 'about' }}
        >
          <meshStandardMaterial color={PALETTE.laptopTrackpad} roughness={0.68} />
        </RoundedBox>
      </group>

      {/* Open Laptop Lid & Display positioned at exact spec.center [-2.75, 0.91, -2.40] */}
      <group
        position={spec.center}
        rotation={[spec.rotation[0], spec.rotation[1], spec.rotation[2], 'YXZ']}
        userData={{ screenId: 'about' }}
      >
        {/* Hover soft outline frame */}
        {(hovered || isFocused) && (
          <RoundedBox
            args={[spec.width + 0.042, spec.height + 0.042, 0.012]}
            radius={0.012}
            smoothness={3}
            position={[0, 0, -0.01]}
            userData={{ screenId: 'about', ignoreVisibilityRay: true, isOutlinePlane: true }}
          >
            <meshBasicMaterial color={PALETTE.screenAccentAbout} />
          </RoundedBox>
        )}

        {/* Lid rear aluminium housing () */}
        <RoundedBox
          args={[spec.width + 0.028, spec.height + 0.028, 0.014]}
          radius={0.008}
          smoothness={3}
          position={[0, 0, -0.009]}
          castShadow
          userData={{ screenId: 'about' }}
        >
          <meshStandardMaterial color={PALETTE.laptopBody} roughness={0.62} metalness={0.12} />
        </RoundedBox>

        {/* Screen Bezel () */}
        <RoundedBox
          args={[spec.width + 0.02, spec.height + 0.02, 0.008]}
          radius={0.006}
          smoothness={2}
          position={[0, 0, -0.003]}
          userData={{ screenId: 'about' }}
        >
          <meshStandardMaterial color={PALETTE.laptopBezel} roughness={0.72} />
        </RoundedBox>

        {/* Active Display Mesh (same 1536x864 CanvasTexture seen from afar and up close) */}
        <mesh
          ref={displayMeshRef}
          name="screen-mesh-about"
          position={[0, 0, 0.002]}
          userData={{ screenId: 'about', isDisplayMesh: true }}
          onClick={handleClick}
        >
          <planeGeometry args={[spec.width, spec.height]} />
          <meshStandardMaterial
            color={PALETTE.screenDarkBg}
            map={controller.texture}
            emissive={PALETTE.starWhite}
            emissiveMap={controller.texture}
            emissiveIntensity={showEmissives ? 0.45 : 0.05}
            roughness={0.35}
            metalness={0}
            toneMapped={true}
          />
        </mesh>
      </group>
    </group>
  );
};
