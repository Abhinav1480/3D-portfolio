import React, { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { PALETTE } from '../config/palette';
import {
  CERTIFICATES,
  CertificateItem,
  getCachedCertificateDecodedMeta,
  loadAndDecodeCertificateImage,
  preloadCertificateImage,
} from '../data/certificates';
import { CertificateRect } from '../scene/Props';

export interface CertificateViewerProps {
  activeIndex: number;
  initialOriginRect: CertificateRect | null;
  reducedMotion: boolean;
  getProjectedRectForIndex?: (index: number) => CertificateRect | null;
  onSelectIndex: (nextIndex: number) => void;
  onCloseImmediate: () => void;
}

function isRectOnScreen(rect: CertificateRect | null): rect is CertificateRect {
  if (!rect) return false;
  if (typeof window === 'undefined') return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    rect.width > 8 &&
    rect.height > 8 &&
    rect.left + rect.width > 0 &&
    rect.left < vw &&
    rect.top + rect.height > 0 &&
    rect.top < vh
  );
}

export const CertificateViewer: React.FC<CertificateViewerProps> = ({
  activeIndex,
  initialOriginRect,
  reducedMotion,
  getProjectedRectForIndex,
  onSelectIndex,
  onCloseImmediate,
}) => {
  const total = CERTIFICATES.length;
  const safeIndex = ((activeIndex % total) + total) % total;
  const currentCert: CertificateItem = CERTIFICATES[safeIndex];

  const cachedMeta = getCachedCertificateDecodedMeta(currentCert.imageUrl);
  const [imgStatus, setImgStatus] = useState<'loading' | 'loaded' | 'error'>(() =>
    cachedMeta ? 'loaded' : 'loading'
  );
  const [fadeVisible, setFadeVisible] = useState<boolean>(() => Boolean(cachedMeta));
  const [decodedAspect, setDecodedAspect] = useState<number>(
    cachedMeta?.aspectRatio ?? currentCert.aspectRatio
  );
  const [retryCount, setRetryCount] = useState(0);
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [focusCloseBtnHovered, setFocusCloseBtnHovered] = useState(false);
  const [focusCloseBtnFocused, setFocusCloseBtnFocused] = useState(false);

  const dialogRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const stageCardRef = useRef<HTMLDivElement | null>(null);
  const imgElementRef = useRef<HTMLImageElement | null>(null);

  // Interactive focusable refs for strict focus trap
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const prevBtnRef = useRef<HTMLButtonElement | null>(null);
  const nextBtnRef = useRef<HTMLButtonElement | null>(null);
  const zoomBtnRef = useRef<HTMLButtonElement | null>(null);
  const backToRoomBtnRef = useRef<HTMLButtonElement | null>(null);

  const isClosingRef = useRef(false);
  const lastEscTimeRef = useRef(0);
  const loadReqIdRef = useRef(0);

  // Panning state when zoomed
  const dragStateRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startY: number;
    originPanX: number;
    originPanY: number;
  }>({
    active: false,
    moved: false,
    startX: 0,
    startY: 0,
    originPanX: 0,
    originPanY: 0,
  });

  // Touch swipe state when unzoomed
  const touchSwipeRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
  });

  const clampPan = useCallback((nx: number, ny: number, currentZoom: number) => {
    if (currentZoom <= 1) return { x: 0, y: 0 };
    const maxOffsetX = ((currentZoom - 1) * Math.min(window.innerWidth * 0.92, 1100)) / 2;
    const maxOffsetY = ((currentZoom - 1) * Math.min(window.innerHeight * 0.78, 760)) / 2;
    return {
      x: Math.max(-maxOffsetX, Math.min(maxOffsetX, nx)),
      y: Math.max(-maxOffsetY, Math.min(maxOffsetY, ny)),
    };
  }, []);

  // Decode current image before revealing, handle rapid navigation via loadReqIdRef, and preload adjacent certificates
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });

    const reqId = ++loadReqIdRef.current;
    const bypassCache = retryCount > 0;
    const alreadyDecoded = !bypassCache
      ? getCachedCertificateDecodedMeta(currentCert.imageUrl)
      : undefined;

    if (alreadyDecoded) {
      setDecodedAspect(alreadyDecoded.aspectRatio);
      setImgStatus('loaded');
      setFadeVisible(false);
      const raf = requestAnimationFrame(() => {
        if (loadReqIdRef.current === reqId) {
          setFadeVisible(true);
        }
      });
      const prevIdx = (safeIndex - 1 + total) % total;
      const nextIdx = (safeIndex + 1) % total;
      preloadCertificateImage(CERTIFICATES[prevIdx].imageUrl);
      preloadCertificateImage(CERTIFICATES[nextIdx].imageUrl);
      return () => cancelAnimationFrame(raf);
    }

    setDecodedAspect(currentCert.aspectRatio);
    setImgStatus('loading');
    setFadeVisible(false);

    loadAndDecodeCertificateImage(currentCert.imageUrl, bypassCache)
      .then((meta) => {
        if (loadReqIdRef.current !== reqId) return;
        setDecodedAspect(meta.aspectRatio);
        setImgStatus('loaded');
        requestAnimationFrame(() => {
          if (loadReqIdRef.current === reqId) {
            setFadeVisible(true);
          }
        });
      })
      .catch(() => {
        if (loadReqIdRef.current !== reqId) return;
        setImgStatus('error');
        setFadeVisible(false);
      });

    // Preload adjacent (previous and next) certificate images
    const prevIdx = (safeIndex - 1 + total) % total;
    const nextIdx = (safeIndex + 1) % total;
    preloadCertificateImage(CERTIFICATES[prevIdx].imageUrl);
    preloadCertificateImage(CERTIFICATES[nextIdx].imageUrl);
  }, [currentCert.aspectRatio, currentCert.imageUrl, retryCount, safeIndex, total]);

  // Focus the Close button immediately when the viewer opens
  useEffect(() => {
    closeBtnRef.current?.focus({ preventScroll: true });
  }, []);

  // Push browser history state on open and listen for popstate
  useEffect(() => {
    let pushed = false;
    try {
      window.history.pushState({ cert: true }, '');
      pushed = true;
    } catch {
      pushed = false;
    }

    const onPopState = () => {
      if (isClosingRef.current) return;
      closeViewer(false);
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (pushed && typeof window !== 'undefined' && window.history.state?.cert === true) {
        try {
          window.history.replaceState(null, '');
        } catch {
          // ignore
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // FLIP Open Animation from the clicked 3D mesh's projected screen rectangle
  useEffect(() => {
    const stageEl = stageCardRef.current;
    const backdropEl = backdropRef.current;
    if (!stageEl || !backdropEl) return;

    gsap.killTweensOf(stageEl);
    gsap.killTweensOf(backdropEl);

    if (reducedMotion) {
      gsap.fromTo(
        backdropEl,
        { opacity: 0 },
        { opacity: 1, duration: 0.1, ease: 'power1.out' }
      );
      gsap.fromTo(
        stageEl,
        { opacity: 0, scale: 1, x: 0, y: 0 },
        { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.1, ease: 'power1.out' }
      );
      return;
    }

    const rect = initialOriginRect;
    if (isRectOnScreen(rect)) {
      const targetBox = stageEl.getBoundingClientRect();
      const targetCenterX = targetBox.left + targetBox.width / 2 || window.innerWidth / 2;
      const targetCenterY = targetBox.top + targetBox.height / 2 || window.innerHeight / 2;
      const originCenterX = rect.left + rect.width / 2;
      const originCenterY = rect.top + rect.height / 2;

      const dx = originCenterX - targetCenterX;
      const dy = originCenterY - targetCenterY;
      const scaleX = Math.max(0.08, Math.min(1, rect.width / Math.max(1, targetBox.width || 720)));
      const scaleY = Math.max(0.08, Math.min(1, rect.height / Math.max(1, targetBox.height || 520)));
      const initScale = Math.min(scaleX, scaleY);

      gsap.fromTo(
        backdropEl,
        { opacity: 0 },
        { opacity: 1, duration: 0.25, ease: 'power2.out' }
      );
      gsap.fromTo(
        stageEl,
        { x: dx, y: dy, scale: initScale, opacity: 0.35 },
        { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.35, ease: 'power3.out' }
      );
    } else {
      gsap.fromTo(
        backdropEl,
        { opacity: 0 },
        { opacity: 1, duration: 0.2, ease: 'power2.out' }
      );
      gsap.fromTo(
        stageEl,
        { scale: 0.92, opacity: 0, x: 0, y: 0 },
        { scale: 1, opacity: 1, x: 0, y: 0, duration: 0.2, ease: 'power2.out' }
      );
    }
    // Only run on initial mount of viewer
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Unified closeViewer() shared by all close paths.
   */
  const closeViewer = useCallback(
    (forceImmediate = false) => {
      if (isClosingRef.current && !forceImmediate) return;
      isClosingRef.current = true;

      const finalizeClose = () => {
        try {
          if (typeof window !== 'undefined' && window.history.state?.cert === true) {
            try {
              window.history.replaceState(null, '');
            } catch {
              // Ignore history errors in restricted sandbox contexts
            }
          }
        } finally {
          onCloseImmediate();
        }
      };

      if (forceImmediate) {
        finalizeClose();
        return;
      }

      try {
        const stageEl = stageCardRef.current;
        const backdropEl = backdropRef.current;

        if (!stageEl || !backdropEl) {
          finalizeClose();
          return;
        }

        gsap.killTweensOf(stageEl);
        gsap.killTweensOf(backdropEl);

        if (reducedMotion) {
          gsap.to([stageEl, backdropEl], {
            opacity: 0,
            duration: 0.1,
            ease: 'power1.in',
            onComplete: finalizeClose,
          });
          return;
        }

        const currentRect = getProjectedRectForIndex?.(safeIndex) ?? null;
        if (isRectOnScreen(currentRect)) {
          const stageBox = stageEl.getBoundingClientRect();
          const stageCenterX = stageBox.left + stageBox.width / 2;
          const stageCenterY = stageBox.top + stageBox.height / 2;
          const destCenterX = currentRect.left + currentRect.width / 2;
          const destCenterY = currentRect.top + currentRect.height / 2;

          const dx = destCenterX - stageCenterX;
          const dy = destCenterY - stageCenterY;
          const scale = Math.max(
            0.08,
            Math.min(
              currentRect.width / Math.max(1, stageBox.width),
              currentRect.height / Math.max(1, stageBox.height)
            )
          );

          gsap.to(backdropEl, {
            opacity: 0,
            duration: 0.22,
            ease: 'power2.in',
          });
          gsap.to(stageEl, {
            x: dx,
            y: dy,
            scale,
            opacity: 0,
            duration: 0.22,
            ease: 'power3.in',
            onComplete: finalizeClose,
          });
        } else {
          gsap.to(backdropEl, {
            opacity: 0,
            duration: 0.18,
            ease: 'power2.in',
          });
          gsap.to(stageEl, {
            scale: 0.92,
            opacity: 0,
            duration: 0.18,
            ease: 'power2.in',
            onComplete: finalizeClose,
          });
        }
      } catch {
        finalizeClose();
      }
    },
    [getProjectedRectForIndex, onCloseImmediate, reducedMotion, safeIndex]
  );

  const handlePrev = useCallback(() => {
    setRetryCount(0);
    onSelectIndex((safeIndex - 1 + total) % total);
  }, [onSelectIndex, safeIndex, total]);

  const handleNext = useCallback(() => {
    setRetryCount(0);
    onSelectIndex((safeIndex + 1) % total);
  }, [onSelectIndex, safeIndex, total]);

  const toggleZoom = useCallback(() => {
    setZoom((prev) => {
      const next = prev > 1 ? 1 : 2.5;
      if (next === 1) setPan({ x: 0, y: 0 });
      return next;
    });
  }, []);

  const stepZoom = useCallback(
    (delta: number) => {
      setZoom((prev) => {
        const next = Math.max(1, Math.min(4, Number((prev + delta).toFixed(2))));
        setPan((p) => clampPan(p.x, p.y, next));
        return next;
      });
    },
    [clampPan]
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Keyboard navigation, focus trap, Escape & double-Escape failsafe
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        const now = performance.now();
        // Double-Esc within 300 ms forces immediate unmount failsafe
        if (now - lastEscTimeRef.current < 300) {
          closeViewer(true);
        } else {
          lastEscTimeRef.current = now;
          closeViewer(false);
        }
        return;
      }

      if (e.key === 'Tab') {
        const focusable = [
          closeBtnRef.current,
          prevBtnRef.current,
          zoomBtnRef.current,
          nextBtnRef.current,
          backToRoomBtnRef.current,
        ].filter((el): el is HTMLButtonElement => el !== null);

        if (focusable.length > 0) {
          e.preventDefault();
          const currentIdx = focusable.indexOf(document.activeElement as HTMLButtonElement);
          if (e.shiftKey) {
            const prevIdx = currentIdx <= 0 ? focusable.length - 1 : currentIdx - 1;
            focusable[prevIdx].focus();
          } else {
            const nextIdx = currentIdx === -1 || currentIdx >= focusable.length - 1 ? 0 : currentIdx + 1;
            focusable[nextIdx].focus();
          }
        }
        return;
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        handlePrev();
      } else if (e.key === 'Home') {
        e.preventDefault();
        e.stopPropagation();
        onSelectIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        e.stopPropagation();
        onSelectIndex(total - 1);
      } else if (e.key === 'z' || e.key === 'Z') {
        e.preventDefault();
        toggleZoom();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        stepZoom(0.5);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        stepZoom(-0.5);
      } else if (e.key === '0') {
        e.preventDefault();
        resetZoom();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [
    closeViewer,
    handleNext,
    handlePrev,
    onSelectIndex,
    resetZoom,
    stepZoom,
    toggleZoom,
    total,
  ]);

  // Wheel zoom (1x..4x) on the viewer stage
  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 0.25 : -0.25;
    stepZoom(delta);
  };

  // Image pointer handlers for drag-pan when zoomed or click-toggle zoom
  const handleImagePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    dragStateRef.current = {
      active: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      originPanX: pan.x,
      originPanY: pan.y,
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const handleImagePointerMove = (e: React.PointerEvent) => {
    const st = dragStateRef.current;
    if (!st.active) return;
    const dx = e.clientX - st.startX;
    const dy = e.clientY - st.startY;
    if (Math.hypot(dx, dy) > 5) {
      st.moved = true;
    }
    if (zoom > 1) {
      setPan(clampPan(st.originPanX + dx, st.originPanY + dy, zoom));
    }
  };

  const handleImagePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    const st = dragStateRef.current;
    dragStateRef.current.active = false;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      // ignore
    }
    if (!st.moved) {
      toggleZoom();
    }
  };

  // Touch swipe handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (zoom > 1 || e.touches.length !== 1) {
      touchSwipeRef.current.active = false;
      return;
    }
    touchSwipeRef.current = {
      active: true,
      startX: e.touches[0].clientX,
      startY: e.touches[0].clientY,
    };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const sw = touchSwipeRef.current;
    touchSwipeRef.current.active = false;
    if (!sw.active || zoom > 1 || e.changedTouches.length === 0) return;

    const dx = e.changedTouches[0].clientX - sw.startX;
    const dy = e.changedTouches[0].clientY - sw.startY;

    if (dy > 80 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      closeViewer(false);
      return;
    }

    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
      if (dx < 0) {
        handleNext();
      } else {
        handlePrev();
      }
    }
  };

  const skeletonAspect = Number.isFinite(decodedAspect) && decodedAspect > 0 ? decodedAspect : 1.414;
  const imgSrc =
    retryCount > 0
      ? `${currentCert.imageUrl}${currentCert.imageUrl.includes('?') ? '&' : '?'}retry=${retryCount}`
      : currentCert.imageUrl;

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Certificate viewer"
      data-testid="certificate-viewer"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between overflow-hidden select-none"
      onWheel={handleWheel}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Screen-reader live announcement: "<title>, 3 of 11" */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {`${currentCert.title}, ${safeIndex + 1} of ${total}`}
      </div>

      {/* Solid Dark Backdrop — clicking outside closes viewer */}
      <div
        ref={backdropRef}
        data-testid="certificate-viewer-backdrop"
        onClick={() => closeViewer(false)}
        className="absolute inset-0"
        style={{
          backgroundColor: PALETTE.viewerBackdrop,
        }}
      />

      {/* Top-Right Close Button — rendered immediately on open, never covered */}
      <button
        ref={closeBtnRef}
        type="button"
        data-testid="certificate-viewer-close"
        aria-label="Close certificate viewer"
        onClick={(e) => {
          e.stopPropagation();
          closeViewer(false);
        }}
        onMouseEnter={() => setFocusCloseBtnHovered(true)}
        onMouseLeave={() => setFocusCloseBtnHovered(false)}
        onFocus={() => setFocusCloseBtnFocused(true)}
        onBlur={() => setFocusCloseBtnFocused(false)}
        className="fixed z-[110] flex min-h-[48px] min-w-[48px] cursor-pointer items-center justify-center gap-2 rounded-full px-3.5 sm:px-5 font-extrabold transition-colors duration-150 focus:outline-none"
        style={{
          top: 'max(16px, env(safe-area-inset-top))',
          right: '16px',
          backgroundColor: focusCloseBtnHovered ? PALETTE.uiPrimaryAccent : PALETTE.screenBg,
          color: focusCloseBtnHovered ? PALETTE.certPaperEmissive : PALETTE.screenText,
          border: `2px solid ${PALETTE.uiPrimaryAccent}`,
          boxShadow: focusCloseBtnFocused
            ? `0 0 0 3px ${PALETTE.certPaperEmissive}, 0 0 0 5px ${PALETTE.uiPrimaryAccent}, 0 8px 24px rgba(0, 0, 0, 0.38)`
            : '0 8px 24px rgba(0, 0, 0, 0.35)',
          fontFamily: 'Outfit, sans-serif',
        }}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinecap-fallback="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        <span className="hidden text-sm tracking-wide sm:inline">Close</span>
      </button>

      {/* Side Prev Button (←) */}
      <button
        ref={prevBtnRef}
        type="button"
        data-testid="certificate-viewer-prev"
        aria-label="Previous certificate"
        onClick={(e) => {
          e.stopPropagation();
          handlePrev();
        }}
        className="fixed top-1/2 left-3 z-[105] flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-lg font-extrabold shadow-lg transition-transform duration-150 hover:scale-105 focus-visible:outline-2 sm:left-5"
        style={{
          backgroundColor: PALETTE.screenBg,
          color: PALETTE.screenText,
          border: `2px solid ${PALETTE.uiPrimaryAccent}`,
          outlineColor: PALETTE.certPaperEmissive,
        }}
      >
        ←
      </button>

      {/* Side Next Button (→) */}
      <button
        ref={nextBtnRef}
        type="button"
        data-testid="certificate-viewer-next"
        aria-label="Next certificate"
        onClick={(e) => {
          e.stopPropagation();
          handleNext();
        }}
        className="fixed top-1/2 right-3 z-[105] flex h-12 w-12 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-lg font-extrabold shadow-lg transition-transform duration-150 hover:scale-105 focus-visible:outline-2 sm:right-5"
        style={{
          backgroundColor: PALETTE.screenBg,
          color: PALETTE.screenText,
          border: `2px solid ${PALETTE.uiPrimaryAccent}`,
          outlineColor: PALETTE.certPaperEmissive,
        }}
      >
        →
      </button>

      {/* Center Stage: Certificate Image + Caption + Back to Room Button */}
      <div
        ref={stageCardRef}
        className="relative z-[102] my-auto flex max-h-full w-full flex-col items-center justify-center px-4 py-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            closeViewer(false);
          }
        }}
      >
        {/* Image Frame Container */}
        <div
          className="relative flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Rounded Skeleton Placeholder matching the certificate's aspect ratio with a subtle shimmer */}
          {imgStatus === 'loading' && (
            <div
              data-testid="certificate-viewer-skeleton"
              aria-label="Loading certificate preview"
              className="relative overflow-hidden rounded-[12px] shadow-2xl"
              style={{
                aspectRatio: String(skeletonAspect),
                width: skeletonAspect >= 1 ? 'min(74vw, 780px)' : 'min(52vw, 480px)',
                maxHeight: '72vh',
                backgroundColor: PALETTE.screenBg,
                border: `2px solid ${PALETTE.screenCardBorder}`,
              }}
            >
              <div
                className="absolute inset-0 animate-pulse"
                style={{
                  background: `linear-gradient(110deg, ${PALETTE.screenCardBg} 25%, ${PALETTE.certPaperEmissive} 50%, ${PALETTE.screenCardBg} 75%)`,
                }}
              />
              <div className="relative z-10 flex h-full w-full flex-col justify-between p-6 opacity-55">
                <div
                  className="h-4 w-1/3 rounded-md"
                  style={{ backgroundColor: PALETTE.screenCardBorder }}
                />
                <div className="my-auto flex flex-col items-center gap-3">
                  <div
                    className="h-6 w-2/3 rounded-lg"
                    style={{ backgroundColor: PALETTE.screenCardBorder }}
                  />
                  <div
                    className="h-4 w-1/2 rounded-md"
                    style={{ backgroundColor: PALETTE.screenCardBorder }}
                  />
                </div>
                <div className="flex justify-between">
                  <div
                    className="h-3 w-1/4 rounded-md"
                    style={{ backgroundColor: PALETTE.screenCardBorder }}
                  />
                  <div
                    className="h-3 w-1/4 rounded-md"
                    style={{ backgroundColor: PALETTE.screenCardBorder }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Error Fallback with Retry & Open in New Tab */}
          {imgStatus === 'error' && (
            <div
              data-testid="certificate-viewer-error"
              className="flex h-[48vh] w-[74vw] max-w-[680px] flex-col items-center justify-center gap-4 rounded-[12px] p-6 text-center shadow-2xl"
              style={{
                backgroundColor: PALETTE.screenBg,
                color: PALETTE.screenText,
                border: `2px solid ${PALETTE.uiPrimaryAccent}`,
              }}
            >
              <p className="text-base font-bold">Unable to load certificate image</p>
              <p className="text-sm" style={{ color: PALETTE.screenTextMuted }}>
                {currentCert.title}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  type="button"
                  data-testid="certificate-viewer-retry"
                  onClick={() => {
                    setRetryCount((c) => c + 1);
                  }}
                  className="cursor-pointer rounded-xl px-4 py-2 text-sm font-bold transition-transform duration-150 hover:scale-105"
                  style={{
                    backgroundColor: PALETTE.uiPrimaryAccent,
                    color: PALETTE.screenBg,
                  }}
                >
                  Retry
                </button>
                <a
                  href={currentCert.imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl px-4 py-2 text-sm font-bold transition-transform duration-150 hover:scale-105"
                  style={{
                    backgroundColor: PALETTE.screenText,
                    color: PALETTE.screenBg,
                  }}
                >
                  Open image in new tab ↗
                </a>
              </div>
            </div>
          )}

          {/* Decoded Certificate Image faded in over ~200 ms */}
          {imgStatus === 'loaded' && (
            <img
              ref={imgElementRef}
              key={`${currentCert.id}-${retryCount}`}
              src={imgSrc}
              alt={currentCert.alt}
              onPointerDown={handleImagePointerDown}
              onPointerMove={handleImagePointerMove}
              onPointerUp={handleImagePointerUp}
              onDoubleClick={(e) => {
                e.stopPropagation();
                resetZoom();
              }}
              draggable={false}
              className={`max-h-[76vh] max-w-[92vw] rounded-[8px] object-contain shadow-2xl transition-opacity duration-200 ${
                fadeVisible ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                cursor: zoom > 1 ? 'grab' : 'zoom-in',
                transform: `translate3d(${pan.x}px, ${pan.y}px, 0) scale(${zoom})`,
                transformOrigin: 'center center',
              }}
            />
          )}

          {/* "Click to zoom" hint button on the image */}
          {imgStatus === 'loaded' && (
            <button
              ref={zoomBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleZoom();
              }}
              aria-label={zoom > 1 ? 'Reset certificate zoom' : 'Zoom into certificate'}
              className="absolute right-2.5 bottom-2.5 z-10 cursor-pointer rounded-full px-3.5 py-1.5 text-xs font-bold shadow-md transition-transform duration-150 hover:scale-105 focus-visible:outline-2"
              style={{
                backgroundColor: PALETTE.uiFrostedCreamSolid,
                color: PALETTE.screenText,
                border: `1.5px solid ${PALETTE.uiPrimaryAccent}`,
                outlineColor: PALETTE.certPaperEmissive,
              }}
            >
              {zoom > 1 ? `${zoom.toFixed(1)}× · Click to reset` : '🔍 Click to zoom'}
            </button>
          )}
        </div>

        {/* Caption & Secondary "Back to Room" Button below the image */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="mt-3 flex w-full max-w-2xl flex-col items-center gap-2 rounded-2xl px-5 py-3 text-center shadow-lg"
          style={{
            backgroundColor: PALETTE.screenBg,
            color: PALETTE.screenText,
            border: `1.5px solid ${PALETTE.screenCardBorder}`,
          }}
        >
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <h2
              className="text-sm font-extrabold sm:text-base"
              style={{ fontFamily: 'Outfit, sans-serif' }}
            >
              {currentCert.title}
            </h2>
            <span
              data-testid="certificate-viewer-counter"
              className="rounded-lg px-2.5 py-0.5 text-xs font-extrabold tabular-nums"
              style={{
                backgroundColor: PALETTE.screenCardBg,
                color: PALETTE.uiPrimaryAccent,
                border: `1px solid ${PALETTE.screenCardBorder}`,
                fontFamily: '"JetBrains Mono", monospace',
              }}
            >
              {safeIndex + 1} / {total}
            </span>
          </div>

          {(currentCert.issuer || currentCert.date) && (
            <p className="text-xs font-medium sm:text-sm" style={{ color: PALETTE.screenTextMuted }}>
              {currentCert.issuer && <span>{currentCert.issuer}</span>}
              {currentCert.issuer && currentCert.date && <span> · </span>}
              {currentCert.date && <span>{currentCert.date}</span>}
            </p>
          )}

          <div className="mt-1 flex items-center justify-center gap-3">
            <button
              ref={backToRoomBtnRef}
              type="button"
              data-testid="certificate-viewer-back-to-room"
              onClick={() => closeViewer(false)}
              className="cursor-pointer rounded-xl px-4 py-1.5 text-xs font-bold sm:text-sm transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
              style={{
                backgroundColor: PALETTE.screenText,
                color: PALETTE.screenBg,
                outlineColor: PALETTE.uiPrimaryAccent,
              }}
            >
              ← Back to Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
