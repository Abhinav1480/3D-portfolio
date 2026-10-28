import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { ThreeEvent, useThree } from '@react-three/fiber';
import { RoundedBox } from '@react-three/drei';
import { PALETTE } from '../config/palette';
import { SCREEN_SPECS, ScreenId } from '../config/layout';
import { ScreenTextureController } from '../screens/ScreenTexture';
import { HitActionType } from '../screens/hitRegions';
import { CertificateRect } from './Props';
import { RegisterClickableMeshFn } from './Room';

export interface PhoneProps {
  controller: ScreenTextureController;
  isFocused: boolean;
  showEmissives: boolean;
  onFocusScreen: (screenId: ScreenId) => void;
  onExecuteHitAction?: (screenId: ScreenId, action: HitActionType) => void;
  onHoverScreenChange: (info: { screenId: ScreenId; label: string } | null) => void;
  registerClickableMesh: RegisterClickableMeshFn;
  registerPhoneRectGetter?: (getter: () => CertificateRect | null) => void;
}

const _phoneBox3 = new THREE.Box3();
const _phoneCorner = new THREE.Vector3();

/**
 * Stylized Smartphone on the Coffee Table (Contact, Stop 4)
 * - Preserves exact world-space position [-1.36, 0.532, 1.14], rotation, and scale.
 * - Clicking the phone focuses the camera on the phone and opens the floating Contact Panel.
 */
export const Phone: React.FC<PhoneProps> = ({
  controller,
  isFocused,
  showEmissives,
  onFocusScreen,
  onHoverScreenChange,
  registerClickableMesh,
  registerPhoneRectGetter,
}) => {
  const { camera, gl } = useThree();
  const [hovered, setHovered] = useState(false);
  const hoveredRef = useRef(false);
  const phoneGroupRef = useRef<THREE.Group | null>(null);
  const displayMeshRef = useRef<THREE.Mesh | null>(null);
  const isFocusedRef = useRef(isFocused);
  isFocusedRef.current = isFocused;
  const onHoverScreenChangeRef = useRef(onHoverScreenChange);
  onHoverScreenChangeRef.current = onHoverScreenChange;

  const spec = SCREEN_SPECS[4]; // 'contact' phone on the coffee table at [-1.36, 0.532, 1.14]

  // Register projected screen-space bounding rectangle getter for FLIP ContactPanel animation
  useEffect(() => {
    if (!registerPhoneRectGetter) return;
    registerPhoneRectGetter(() => {
      const mesh = displayMeshRef.current;
      if (!mesh) return null;
      mesh.updateWorldMatrix(true, false);
      _phoneBox3.setFromObject(mesh);
      if (_phoneBox3.isEmpty()) return null;

      const canvasRect = gl.domElement.getBoundingClientRect();
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      const xs = [_phoneBox3.min.x, _phoneBox3.max.x];
      const ys = [_phoneBox3.min.y, _phoneBox3.max.y];
      const zs = [_phoneBox3.min.z, _phoneBox3.max.z];

      for (let ix = 0; ix < 2; ix++) {
        for (let iy = 0; iy < 2; iy++) {
          for (let iz = 0; iz < 2; iz++) {
            _phoneCorner.set(xs[ix], ys[iy], zs[iz]).project(camera);
            const sx = canvasRect.left + (_phoneCorner.x * 0.5 + 0.5) * canvasRect.width;
            const sy = canvasRect.top + (-_phoneCorner.y * 0.5 + 0.5) * canvasRect.height;
            if (sx < minX) minX = sx;
            if (sy < minY) minY = sy;
            if (sx > maxX) maxX = sx;
            if (sy > maxY) maxY = sy;
          }
        }
      }

      if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;
      return {
        left: minX,
        top: minY,
        width: Math.max(12, maxX - minX),
        height: Math.max(20, maxY - minY),
      };
    });
  }, [camera, gl, registerPhoneRectGetter]);

  useEffect(() => {
    const targetObj = phoneGroupRef.current ?? displayMeshRef.current;
    if (!targetObj) return;
    return registerClickableMesh(targetObj, {
      id: 'screen-contact',
      screenId: 'contact',
      onHoverMove: () => {
        if (isFocusedRef.current) {
          return false;
        }
        if (!hoveredRef.current) {
          hoveredRef.current = true;
          setHovered(true);
          onHoverScreenChangeRef.current({ screenId: 'contact', label: 'Contact' });
        }
        return true;
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
    if (isFocusedRef.current) {
      return;
    }
    onFocusScreen('contact');
  };

  return (
    <group
      ref={phoneGroupRef}
      name="PhoneContactGroup"
      userData={{ screenId: 'contact', ignoreForCamera: true }}
      onClick={handleClick}
    >
      {/* Small Phone Stand (#F5F1EA) resting directly on the coffee table top surface (y = 0.4225 m, no floating) */}
      <group
        position={[spec.center[0], 0.4225, spec.center[2]]}
        rotation={[0, spec.rotation[1], 0]}
        userData={{ screenId: 'contact', ignoreForCamera: true }}
      >
        {/* Stand Base Plate touching table at y = 0 */}
        <RoundedBox
          args={[0.088, 0.008, 0.096]}
          radius={0.003}
          smoothness={3}
          position={[0, 0.004, -0.012]}
          castShadow
          receiveShadow
          userData={{ screenId: 'contact', ignoreForCamera: true }}
        >
          <meshStandardMaterial color={PALETTE.phoneStandWarm} roughness={0.62} />
        </RoundedBox>

        {/* Angled Stand Spine supporting the tilted phone back */}
        <RoundedBox
          args={[0.056, 0.095, 0.012]}
          radius={0.004}
          smoothness={3}
          position={[0, 0.046, -0.022]}
          rotation={[spec.rotation[0], 0, 0]}
          castShadow
          receiveShadow
          userData={{ screenId: 'contact', ignoreForCamera: true }}
        >
          <meshStandardMaterial color={PALETTE.phoneStandWarm} roughness={0.62} />
        </RoundedBox>

        {/* Front cradle lip cradling the bottom edge of the phone */}
        <RoundedBox
          args={[0.078, 0.012, 0.022]}
          radius={0.003}
          smoothness={2}
          position={[0, 0.010, 0.036]}
          rotation={[spec.rotation[0], 0, 0]}
          castShadow
          receiveShadow
          userData={{ screenId: 'contact', ignoreForCamera: true }}
        >
          <meshStandardMaterial color={PALETTE.phoneStandWarm} roughness={0.62} />
        </RoundedBox>
      </group>

      {/* Tilted Smartphone Body (0.11 x 0.23 x 0.01 m) at spec.center [-1.36, 0.532, 1.14] */}
      <group
        position={spec.center}
        rotation={[spec.rotation[0], spec.rotation[1], spec.rotation[2], 'YXZ']}
        userData={{ screenId: 'contact', ignoreForCamera: true }}
      >
        {/* Hover / Focus Soft Outline */}
        {(hovered || isFocused) && (
          <RoundedBox
            args={[0.11 + 0.018, 0.23 + 0.018, 0.008]}
            radius={0.016}
            smoothness={4}
            position={[0, 0, -0.006]}
            userData={{
              screenId: 'contact',
              ignoreVisibilityRay: true,
              isOutlinePlane: true,
              ignoreForCamera: true,
            }}
          >
            <meshBasicMaterial color={PALETTE.screenAccentContact} />
          </RoundedBox>
        )}

        {/* Phone Back Shell (#E9E4DC, 0.11 x 0.23 x 0.006 m) */}
        <RoundedBox
          args={[0.11, 0.23, 0.006]}
          radius={0.014}
          smoothness={4}
          position={[0, 0, -0.003]}
          castShadow
          receiveShadow
          userData={{ screenId: 'contact', ignoreForCamera: true }}
        >
          <meshStandardMaterial color={PALETTE.phoneBackWarm} roughness={0.58} metalness={0.08} />
        </RoundedBox>

        {/* Phone Front Bezel (#3A2F2A, 0.108 x 0.228 x 0.006 m, total thickness 0.01 m) */}
        <RoundedBox
          args={[0.108, 0.228, 0.006]}
          radius={0.013}
          smoothness={4}
          position={[0, 0, 0.001]}
          castShadow
          receiveShadow
          userData={{ screenId: 'contact', ignoreForCamera: true }}
        >
          <meshStandardMaterial color={PALETTE.deviceBezelWarm} roughness={0.64} />
        </RoundedBox>

        {/* Active Portrait Display Mesh (0.098 x 0.214 m, 1080x2340 physical CanvasTexture) */}
        <mesh
          ref={displayMeshRef}
          name="screen-mesh-contact"
          position={[0, 0, 0.0045]}
          userData={{ screenId: 'contact', isDisplayMesh: true }}
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
