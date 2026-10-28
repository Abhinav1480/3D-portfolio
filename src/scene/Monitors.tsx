import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';
import { SCREEN_SPECS, ScreenId, ScreenSpec } from '../config/layout';
import { ScreenTextureController } from '../screens/ScreenTexture';
import { findHitRegionAtUV, HitActionType } from '../screens/hitRegions';
import { RegisterClickableMeshFn } from './Room';

export interface MonitorsProps {
  controllers: Record<ScreenId, ScreenTextureController>;
  focusedScreenId: ScreenId | null;
  showEmissives: boolean;
  onFocusScreen: (screenId: ScreenId) => void;
  onExecuteHitAction: (screenId: ScreenId, action: HitActionType) => void;
  onHoverScreenChange: (info: { screenId: ScreenId; label: string } | null) => void;
  registerClickableMesh: RegisterClickableMeshFn;
}

const ACCENT_BY_SCREEN: Record<ScreenId, string> = {
  about: PALETTE.screenAccentAbout,
  skills: PALETTE.screenAccentSkills,
  projects: PALETTE.screenAccentProjects,
  experience: PALETTE.screenAccentExperience,
  contact: PALETTE.screenAccentContact,
};

interface SingleMonitorProps {
  spec: ScreenSpec;
  controller: ScreenTextureController;
  isFocused: boolean;
  showEmissives: boolean;
  onFocusScreen: (screenId: ScreenId) => void;
  onExecuteHitAction: (screenId: ScreenId, action: HitActionType) => void;
  onHoverScreenChange: (info: { screenId: ScreenId; label: string } | null) => void;
  registerClickableMesh: RegisterClickableMeshFn;
}

const SingleMonitor: React.FC<SingleMonitorProps> = ({
  spec,
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

  const accentColor = ACCENT_BY_SCREEN[spec.id];

  useEffect(() => {
    const mesh = displayMeshRef.current;
    if (!mesh) return;
    return registerClickableMesh(mesh, {
      id: `screen-${spec.id}`,
      screenId: spec.id,
      onHoverMove: (uv) => {
        if (!hoveredRef.current) {
          hoveredRef.current = true;
          setHovered(true);
          onHoverScreenChangeRef.current({ screenId: spec.id, label: spec.label });
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
  }, [registerClickableMesh, spec.id, spec.label, controller]);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    const hit = e.uv ? findHitRegionAtUV(controller.hitRegions, e.uv.x, e.uv.y) : null;
    if (hit) {
      onExecuteHitAction(spec.id, hit.action);
      if (!isFocused && hit.action.type === 'page') {
        onFocusScreen(spec.id);
      }
      return;
    }
    if (!isFocused) {
      onFocusScreen(spec.id);
    }
  };

  return (
    <group name={`Monitor-${spec.id}`} userData={{ screenId: spec.id }}>
      {/* Monitor Stand Base & Neck standing on Desk (desk top y = 0.75) */}
      <group position={[spec.center[0], 0.75, spec.center[2] - 0.05]} userData={{ screenId: spec.id }}>
        <RoundedBox
          args={[0.20, 0.016, 0.16]}
          radius={0.006}
          smoothness={3}
          position={[0, 0.008, 0.02]}
          castShadow
          receiveShadow
          userData={{ screenId: spec.id }}
        >
          <meshStandardMaterial color={PALETTE.monitorStand} roughness={0.68} />
        </RoundedBox>
        <RoundedBox
          args={[0.048, 0.28, 0.036]}
          radius={0.01}
          smoothness={3}
          position={[0, 0.15, -0.02]}
          castShadow
          userData={{ screenId: spec.id }}
        >
          <meshStandardMaterial color={PALETTE.monitorStand} roughness={0.68} />
        </RoundedBox>
      </group>

      {/* Tilted Display Head (YXZ order for 0.00 deg horizon roll) */}
      <group
        position={spec.center}
        rotation={[spec.rotation[0], spec.rotation[1], spec.rotation[2], 'YXZ']}
        userData={{ screenId: spec.id }}
      >
        {/* Hover / Focus Soft Outline */}
        {(hovered || isFocused) && (
          <RoundedBox
            args={[spec.width + 0.048, spec.height + 0.048, 0.02]}
            radius={0.014}
            smoothness={3}
            position={[0, 0, -0.022]}
            userData={{ screenId: spec.id, ignoreVisibilityRay: true, isOutlinePlane: true }}
          >
            <meshBasicMaterial color={accentColor} />
          </RoundedBox>
        )}

        {/* Rear Housing with Real Thickness */}
        <RoundedBox
          args={[spec.width + 0.028, spec.height + 0.028, 0.032]}
          radius={0.012}
          smoothness={4}
          position={[0, 0, -0.022]}
          castShadow
          receiveShadow
          userData={{ screenId: spec.id }}
        >
          <meshStandardMaterial color={PALETTE.monitorRear} roughness={0.72} />
        </RoundedBox>

        {/* Front Bezel (never pure black) */}
        <RoundedBox
          args={[spec.width + 0.024, spec.height + 0.028, 0.012]}
          radius={0.008}
          smoothness={3}
          position={[0, -0.002, -0.004]}
          userData={{ screenId: spec.id }}
        >
          <meshStandardMaterial color={PALETTE.monitorBezel} roughness={0.7} />
        </RoundedBox>

        {/* Static Power LED (emissive 0.3) */}
        <mesh
          position={[spec.width * 0.44, -spec.height * 0.5 - 0.007, 0.003]}
          userData={{ screenId: spec.id }}
        >
          <sphereGeometry args={[0.0045, 8, 8]} />
          <meshStandardMaterial
            color={PALETTE.statusLedGreen}
            emissive={PALETTE.statusLedGreen}
            emissiveIntensity={showEmissives ? 0.3 : 0}
          />
        </mesh>

        {/* Recessed Active Display Mesh (0.60 x 0.34, 1536x864 CanvasTexture, emissiveIntensity 0.45, toneMapped true) */}
        <mesh
          ref={displayMeshRef}
          name={`screen-mesh-${spec.id}`}
          position={[0, 0, 0.003]}
          userData={{ screenId: spec.id, isDisplayMesh: true }}
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

export const Monitors: React.FC<MonitorsProps> = ({
  controllers,
  focusedScreenId,
  showEmissives,
  onFocusScreen,
  onExecuteHitAction,
  onHoverScreenChange,
  registerClickableMesh,
}) => {
  // Part 3: Three monitors remain on the desk: Skills (1), Projects (2), Experience (3).
  // Contact (Monitor 4) has been removed and replaced by the smartphone on the coffee table.
  const monitorSpecs = SCREEN_SPECS.slice(1, 4);

  return (
    <group name="MonitorsRow">
      {monitorSpecs.map((spec) => (
        <SingleMonitor
          key={spec.id}
          spec={spec}
          controller={controllers[spec.id]}
          isFocused={focusedScreenId === spec.id}
          showEmissives={showEmissives}
          onFocusScreen={onFocusScreen}
          onExecuteHitAction={onExecuteHitAction}
          onHoverScreenChange={onHoverScreenChange}
          registerClickableMesh={registerClickableMesh}
        />
      ))}
    </group>
  );
};
