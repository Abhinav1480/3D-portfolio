import React, { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { PortfolioMode } from '../camera/CameraRig';
import { ScreenId } from '../config/layout';
import { ScreenTextureController } from '../screens/ScreenTexture';
import { HitActionType } from '../screens/hitRegions';
import { Chair } from './Chair';
import { Desk } from './Desk';
import { Diorama } from './Diorama';
import { Dust } from './Dust';
import { Guitar } from './Guitar';
import { Laptop } from './Laptop';
import { LightDebugState, Lights } from './Lights';
import { Monitors } from './Monitors';
import { Phone } from './Phone';
import { Plants } from './Plants';
import { CertificateRect, Props } from './Props';
import { Shelf } from './Shelf';
import { Sofa } from './Sofa';
import { TV } from './TV';
import { Window } from './Window';

export interface ClickableHoverTarget {
  id: string;
  screenId?: ScreenId;
  onHoverMove: (uv?: THREE.Vector2) => boolean;
  onHoverLeave: () => void;
}

export type RegisterClickableMeshFn = (
  mesh: THREE.Object3D | null,
  target: ClickableHoverTarget
) => () => void;

export type NativeCursorShape = 'default' | 'pointer' | 'grab' | 'grabbing';

export interface RoomProps {
  controllers: Record<ScreenId, ScreenTextureController>;
  mode: PortfolioMode;
  modeRef: React.MutableRefObject<PortfolioMode>;
  isFlying: boolean;
  isFlyingRef: React.MutableRefObject<boolean>;
  focusedScreenId: ScreenId | null;
  reducedMotion: boolean;
  lightDebug: LightDebugState;
  canInteractWithCertificates: boolean;
  activeCertificateIndex: number | null;
  onFocusScreen: (screenId: ScreenId) => void;
  onExecuteHitAction: (screenId: ScreenId, action: HitActionType) => void;
  onHoverScreenChange: (info: { screenId: ScreenId; label: string } | null) => void;
  onHoverCertificateChange: (info: { index: number; title: string } | null) => void;
  onHoverGuitarChange: (hovered: boolean) => void;
  registerPlayGuitarTrigger: (fn: () => void) => void;
  onOpenCertificate: (
    index: number,
    originRect: CertificateRect | null,
    triggerEl?: HTMLElement | null
  ) => void;
  registerCertificateRectGetter: (
    index: number,
    getter: () => CertificateRect | null
  ) => void;
  registerPhoneRectGetter?: (getter: () => CertificateRect | null) => void;
  onExposureCalibrated: (newExposure: number) => void;
  registerCalibrator: (fn: () => void) => void;
}

// Module-scope reusable raycaster and NDC vector — zero per-frame allocations
const _hoverRaycaster = new THREE.Raycaster();
const _pointerNdc = new THREE.Vector2();

export const Room: React.FC<RoomProps> = ({
  controllers,
  mode,
  modeRef,
  isFlying,
  isFlyingRef,
  focusedScreenId,
  reducedMotion,
  lightDebug,
  canInteractWithCertificates,
  activeCertificateIndex,
  onFocusScreen,
  onExecuteHitAction,
  onHoverScreenChange,
  onHoverCertificateChange,
  onHoverGuitarChange,
  registerPlayGuitarTrigger,
  onOpenCertificate,
  registerCertificateRectGetter,
  registerPhoneRectGetter,
  onExposureCalibrated,
  registerCalibrator,
}) => {
  const { camera, gl } = useThree();

  // Dedicated clickable meshes list (only the 5 screens, 3 wall frames, 8 certificate books, 1 shelf plaque, and 1 guitar)
  const clickableMapRef = useRef<Map<THREE.Object3D, ClickableHoverTarget>>(new Map());
  const clickableListRef = useRef<THREE.Object3D[]>([]);
  const activeHoverTargetRef = useRef<ClickableHoverTarget | null>(null);

  // Pointer tracking refs for once-per-frame throttled hover raycast
  const pointerDirtyRef = useRef(false);
  const isPointerDownRef = useRef(false);
  const isOverCanvasRef = useRef(false);
  const lastCursorRef = useRef<NativeCursorShape>('default');

  const focusedScreenIdRef = useRef<ScreenId | null>(focusedScreenId);
  focusedScreenIdRef.current = focusedScreenId;

  const activeCertIndexRef = useRef<number | null>(activeCertificateIndex);
  activeCertIndexRef.current = activeCertificateIndex;

  const applyNativeCursor = useCallback(
    (nextCursor: NativeCursorShape) => {
      if (
        lastCursorRef.current === nextCursor &&
        document.body.style.cursor === nextCursor &&
        gl.domElement.style.cursor === nextCursor
      ) {
        return;
      }
      lastCursorRef.current = nextCursor;
      if (typeof document !== 'undefined') {
        document.body.style.cursor = nextCursor;
      }
      gl.domElement.style.cursor = nextCursor;
    },
    [gl]
  );

  const clearHoverAndSetCursor = useCallback(
    (nextCursor: NativeCursorShape = 'default') => {
      if (activeHoverTargetRef.current) {
        activeHoverTargetRef.current.onHoverLeave();
        activeHoverTargetRef.current = null;
      }
      applyNativeCursor(nextCursor);
    },
    [applyNativeCursor]
  );

  const registerClickableMesh: RegisterClickableMeshFn = useCallback((mesh, target) => {
    if (!mesh) return () => {};
    clickableMapRef.current.set(mesh, target);
    clickableListRef.current = Array.from(clickableMapRef.current.keys());
    return () => {
      if (activeHoverTargetRef.current === target) {
        target.onHoverLeave();
        activeHoverTargetRef.current = null;
      }
      clickableMapRef.current.delete(mesh);
      clickableListRef.current = Array.from(clickableMapRef.current.keys());
    };
  }, []);

  // Restore "default" cursor on mode change, on any flight start, or while the certificate viewer is open
  useEffect(() => {
    pointerDirtyRef.current = false;
    if (isFlying || activeCertificateIndex !== null) {
      isPointerDownRef.current = false;
    }
    clearHoverAndSetCursor('default');
  }, [mode, isFlying, activeCertificateIndex, clearHoverAndSetCursor]);

  // Attach native pointer tracking and reset listeners (pointerleave, window blur, tab visibilitychange)
  useEffect(() => {
    const domEl = gl.domElement;
    applyNativeCursor('default');

    const onWindowPointerMove = (e: PointerEvent) => {
      // Touch devices have no cursor to show
      if (e.pointerType === 'touch') {
        isOverCanvasRef.current = false;
        pointerDirtyRef.current = false;
        return;
      }

      // Skip hover raycast while pointer is over HTML UI (HUD, nav, buttons, CertificateViewer)
      const overCanvas = e.target === domEl;
      if (!overCanvas) {
        if (isOverCanvasRef.current || activeHoverTargetRef.current || lastCursorRef.current !== 'default') {
          isOverCanvasRef.current = false;
          pointerDirtyRef.current = false;
          clearHoverAndSetCursor('default');
        }
        return;
      }

      isOverCanvasRef.current = true;
      const rect = domEl.getBoundingClientRect();
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      _pointerNdc.x = ((e.clientX - rect.left) / w) * 2 - 1;
      _pointerNdc.y = -((e.clientY - rect.top) / h) * 2 + 1;

      // Skip hover raycast while pointer is down (dragging)
      if (isPointerDownRef.current) {
        pointerDirtyRef.current = false;
        if (
          modeRef.current === 'EXPLORE' &&
          !isFlyingRef.current &&
          activeCertIndexRef.current === null
        ) {
          clearHoverAndSetCursor('grabbing');
        } else {
          clearHoverAndSetCursor('default');
        }
        return;
      }

      // Mark pointer dirty so useFrame runs at most one hover raycast on the next animation frame
      pointerDirtyRef.current = true;
    };

    const onCanvasPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      isPointerDownRef.current = true;
      isOverCanvasRef.current = true;
      pointerDirtyRef.current = false;

      if (
        modeRef.current === 'EXPLORE' &&
        !isFlyingRef.current &&
        activeCertIndexRef.current === null
      ) {
        clearHoverAndSetCursor('grabbing');
      }
    };

    const onWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!isPointerDownRef.current) return;
      isPointerDownRef.current = false;

      if (
        isOverCanvasRef.current &&
        !isFlyingRef.current &&
        activeCertIndexRef.current === null
      ) {
        pointerDirtyRef.current = true;
        if (modeRef.current === 'EXPLORE') {
          applyNativeCursor('grab');
        } else {
          applyNativeCursor('default');
        }
      } else {
        clearHoverAndSetCursor('default');
      }
    };

    const onPointerLeaveOrBlur = () => {
      isOverCanvasRef.current = false;
      isPointerDownRef.current = false;
      pointerDirtyRef.current = false;
      clearHoverAndSetCursor('default');
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        onPointerLeaveOrBlur();
      }
    };

    window.addEventListener('pointermove', onWindowPointerMove, { passive: true });
    domEl.addEventListener('pointerdown', onCanvasPointerDown, { passive: true });
    window.addEventListener('pointerup', onWindowPointerUp, { passive: true });
    window.addEventListener('pointercancel', onWindowPointerUp, { passive: true });
    domEl.addEventListener('pointerleave', onPointerLeaveOrBlur, { passive: true });
    document.addEventListener('mouseleave', onPointerLeaveOrBlur, { passive: true });
    window.addEventListener('blur', onPointerLeaveOrBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pointermove', onWindowPointerMove);
      domEl.removeEventListener('pointerdown', onCanvasPointerDown);
      window.removeEventListener('pointerup', onWindowPointerUp);
      window.removeEventListener('pointercancel', onWindowPointerUp);
      domEl.removeEventListener('pointerleave', onPointerLeaveOrBlur);
      document.removeEventListener('mouseleave', onPointerLeaveOrBlur);
      window.removeEventListener('blur', onPointerLeaveOrBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearHoverAndSetCursor('default');
    };
  }, [gl, modeRef, isFlyingRef, applyNativeCursor, clearHoverAndSetCursor]);

  // Throttled hover raycast: runs at most once per animation frame, only when pointer moved,
  // skipped during drags, skipped over HTML UI, skipped during camera flights & viewer open,
  // and raycasts ONLY against the clickable meshes list (never the whole scene).
  useFrame(() => {
    if (isFlyingRef.current || activeCertIndexRef.current !== null) {
      if (activeHoverTargetRef.current || lastCursorRef.current !== 'default') {
        clearHoverAndSetCursor('default');
      }
      pointerDirtyRef.current = false;
      return;
    }

    if (!isOverCanvasRef.current) {
      if (activeHoverTargetRef.current || lastCursorRef.current !== 'default') {
        clearHoverAndSetCursor('default');
      }
      pointerDirtyRef.current = false;
      return;
    }

    if (isPointerDownRef.current) {
      const dragCursor: NativeCursorShape =
        modeRef.current === 'EXPLORE' ? 'grabbing' : 'default';
      if (activeHoverTargetRef.current || lastCursorRef.current !== dragCursor) {
        clearHoverAndSetCursor(dragCursor);
      }
      pointerDirtyRef.current = false;
      return;
    }

    if (!pointerDirtyRef.current) {
      return;
    }
    pointerDirtyRef.current = false;

    const clickables = clickableListRef.current;
    if (clickables.length === 0) {
      clearHoverAndSetCursor(modeRef.current === 'EXPLORE' ? 'grab' : 'default');
      return;
    }

    _hoverRaycaster.setFromCamera(_pointerNdc, camera);
    const hits = _hoverRaycaster.intersectObjects(clickables, true);

    let matchedTarget: ClickableHoverTarget | null = null;
    let matchedUv: THREE.Vector2 | undefined;

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      if (!hit.object.visible || hit.object.userData?.isOutlinePlane) {
        continue;
      }

      let cur: THREE.Object3D | null = hit.object;
      let found: ClickableHoverTarget | null = null;
      while (cur) {
        const reg = clickableMapRef.current.get(cur);
        if (reg) {
          found = reg;
          break;
        }
        cur = cur.parent;
      }

      if (!found) continue;

      // In FOCUSED mode, only the focused screen's hit regions are interactive
      if (modeRef.current === 'FOCUSED') {
        if (found.screenId && found.screenId === focusedScreenIdRef.current) {
          matchedTarget = found;
          matchedUv = hit.uv;
          break;
        }
        continue;
      }

      matchedTarget = found;
      matchedUv = hit.uv;
      break;
    }

    if (matchedTarget) {
      if (activeHoverTargetRef.current && activeHoverTargetRef.current !== matchedTarget) {
        activeHoverTargetRef.current.onHoverLeave();
      }
      activeHoverTargetRef.current = matchedTarget;
      const isClickable = matchedTarget.onHoverMove(matchedUv);
      if (isClickable) {
        applyNativeCursor('pointer');
      } else {
        applyNativeCursor(modeRef.current === 'EXPLORE' ? 'grab' : 'default');
      }
    } else {
      const idleCursor: NativeCursorShape =
        modeRef.current === 'EXPLORE' ? 'grab' : 'default';
      clearHoverAndSetCursor(idleCursor);
    }
  });

  return (
    <group name="PortfolioRoomScene">
      <Lights
        debugState={lightDebug}
        onExposureCalibrated={onExposureCalibrated}
        registerCalibrator={registerCalibrator}
      />
      <Diorama />
      <Window showEmissives={lightDebug.emissives} />
      <Desk showEmissives={lightDebug.emissives} />
      <Laptop
        controller={controllers.about}
        isFocused={focusedScreenId === 'about'}
        showEmissives={lightDebug.emissives}
        onFocusScreen={onFocusScreen}
        onExecuteHitAction={onExecuteHitAction}
        onHoverScreenChange={onHoverScreenChange}
        registerClickableMesh={registerClickableMesh}
      />
      <Monitors
        controllers={controllers}
        focusedScreenId={focusedScreenId}
        showEmissives={lightDebug.emissives}
        onFocusScreen={onFocusScreen}
        onExecuteHitAction={onExecuteHitAction}
        onHoverScreenChange={onHoverScreenChange}
        registerClickableMesh={registerClickableMesh}
      />
      <Chair />
      <Sofa />
      <Phone
        controller={controllers.contact}
        isFocused={focusedScreenId === 'contact'}
        showEmissives={lightDebug.emissives}
        onFocusScreen={onFocusScreen}
        onExecuteHitAction={onExecuteHitAction}
        onHoverScreenChange={onHoverScreenChange}
        registerClickableMesh={registerClickableMesh}
        registerPhoneRectGetter={registerPhoneRectGetter}
      />
      <Shelf
        reducedMotion={reducedMotion}
        canInteractWithCertificates={canInteractWithCertificates}
        activeCertificateIndex={activeCertificateIndex}
        onHoverCertificateChange={onHoverCertificateChange}
        registerClickableMesh={registerClickableMesh}
        onOpenCertificate={onOpenCertificate}
        registerCertificateRectGetter={registerCertificateRectGetter}
      />
      <TV showEmissives={lightDebug.emissives} />
      <Plants reducedMotion={reducedMotion} />
      <Props
        showEmissives={lightDebug.emissives}
        reducedMotion={reducedMotion}
        canInteractWithCertificates={canInteractWithCertificates}
        onHoverCertificateChange={onHoverCertificateChange}
        registerClickableMesh={registerClickableMesh}
        onOpenCertificate={onOpenCertificate}
        registerCertificateRectGetter={registerCertificateRectGetter}
      />
      <Guitar
        mode={mode}
        isFlying={isFlying}
        viewerOpen={activeCertificateIndex !== null}
        reducedMotion={reducedMotion}
        onHoverGuitarChange={onHoverGuitarChange}
        registerClickableMesh={registerClickableMesh}
        registerPlayGuitarTrigger={registerPlayGuitarTrigger}
      />
      <Dust reducedMotion={reducedMotion} />
    </group>
  );
};
