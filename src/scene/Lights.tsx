import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import gsap from 'gsap';
import { PALETTE } from '../config/palette';

export interface LightDebugState {
  environment: boolean;
  hemisphere: boolean;
  ambient: boolean;
  moon: boolean;
  lamps: boolean;
  backglow: boolean;
  emissives: boolean;
  exposure: number;
}

export interface LightsProps {
  debugState: LightDebugState;
  onExposureCalibrated: (newExposure: number) => void;
  registerCalibrator: (fn: () => void) => void;
}

export const Lights: React.FC<LightsProps> = ({
  debugState,
  onExposureCalibrated,
  registerCalibrator,
}) => {
  const { gl, scene, camera } = useThree();
  const envTexRef = useRef<THREE.Texture | null>(null);

  // Studio environment map (intensity 0.25)
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const envRoom = new RoomEnvironment();
    const rt = pmrem.fromScene(envRoom, 0.04);
    envTexRef.current = rt.texture;
    scene.environment = rt.texture;
    scene.environmentIntensity = 0.25;
    pmrem.dispose();

    return () => {
      rt.dispose();
    };
  }, [gl, scene]);

  useEffect(() => {
    scene.environment = debugState.environment ? envTexRef.current : null;
    scene.environmentIntensity = debugState.environment ? 0.25 : 0;
  }, [debugState.environment, scene]);

  useEffect(() => {
    gl.toneMappingExposure = debugState.exposure;
  }, [debugState.exposure, gl]);

  // One-time exposure calibration after load and after each camera flight finishes
  useEffect(() => {
    const calibrate = () => {
      try {
        const w = 64;
        const h = 36;
        const rt = new THREE.WebGLRenderTarget(w, h, {
          minFilter: THREE.LinearFilter,
          magFilter: THREE.LinearFilter,
          format: THREE.RGBAFormat,
          type: THREE.UnsignedByteType,
        });

        const prevTarget = gl.getRenderTarget();
        gl.setRenderTarget(rt);
        gl.render(scene, camera);

        const buf = new Uint8Array(w * h * 4);
        gl.readRenderTargetPixels(rt, 0, 0, w, h, buf);
        gl.setRenderTarget(prevTarget);
        rt.dispose();

        let sumLum = 0;
        const totalPixels = w * h;
        for (let i = 0; i < buf.length; i += 4) {
          const r = buf[i] / 255;
          const g = buf[i + 1] / 255;
          const b = buf[i + 2] / 255;
          sumLum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
        }
        const avgLum = sumLum / Math.max(1, totalPixels);

        if (avgLum > 0.02) {
          const currentExp = gl.toneMappingExposure;
          const ratio = Math.sqrt(0.35 / avgLum);
          const targetExp = THREE.MathUtils.clamp(currentExp * ratio, 0.6, 1.0);
          const proxy = { exp: currentExp };
          gsap.to(proxy, {
            exp: targetExp,
            duration: 0.6,
            ease: 'power2.out',
            onUpdate: () => {
              gl.toneMappingExposure = proxy.exp;
            },
            onComplete: () => {
              onExposureCalibrated(Number(targetExp.toFixed(2)));
            },
          });
        }
      } catch {
        // Fallback if WebGL readPixels is restricted
      }
    };

    registerCalibrator(calibrate);
    const timer = window.setTimeout(calibrate, 350);
    return () => window.clearTimeout(timer);
  }, [gl, scene, camera, registerCalibrator, onExposureCalibrated]);

  return (
    <group name="StaticNightLights">
      {debugState.ambient && <ambientLight color={PALETTE.lightAmbient} intensity={0.32} />}

      {debugState.hemisphere && (
        <hemisphereLight
          color={PALETTE.lightHemiSky}
          groundColor={PALETTE.lightHemiGround}
          intensity={0.5}
        />
      )}

      {/* Task 8: Softened moon directional angle and shadow radius so window-opening light never forms a sharp diagonal wedge near the monitors */}
      {debugState.moon && (
        <directionalLight
          color={PALETTE.lightMoon}
          intensity={0.44}
          position={[-4.8, 3.8, 2.6]}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
          shadow-radius={4}
          shadow-normalBias={0.025}
          shadow-bias={-0.0003}
          shadow-camera-near={0.5}
          shadow-camera-far={14}
          shadow-camera-left={-4.8}
          shadow-camera-right={5.2}
          shadow-camera-top={3.6}
          shadow-camera-bottom={-3.6}
        />
      )}

      {debugState.lamps && (
        <>
          {/* Warm Lamp 1: Desk/Room Fill */}
          <pointLight
            color={PALETTE.lightWarmLamp}
            intensity={1.0}
            distance={6}
            decay={2}
            position={[0.45, 1.65, -1.55]}
          />
          {/* Warm Lamp 2: Living Area / Sofa & Coffee Table Fill */}
          <pointLight
            color={PALETTE.lightWarmLamp}
            intensity={1.0}
            distance={6}
            decay={2}
            position={[-1.85, 1.75, 1.15]}
          />
        </>
      )}

      {/* Task 8 Fix: Replaced the front-mounted conical SpotLight (at z=-2.35 grazing the slanted monitors in a triangular wedge)
          with a soft, even PointLight placed behind the monitor row (z=-2.85) for gentle bias illumination without any hotspot */}
      {debugState.backglow && (
        <pointLight
          color={PALETTE.lightMonitorBackglow}
          intensity={0.22}
          distance={2.2}
          decay={2}
          position={[-1.06, 1.08, -2.85]}
        />
      )}
    </group>
  );
};
