import React, { useCallback, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { PALETTE } from '../config/palette';
import { CertificateRect } from '../scene/Props';

export type ContactPanelState = 'closed' | 'opening' | 'open' | 'closing';

export interface ContactPanelProps {
  panelState: ContactPanelState;
  reducedMotion: boolean;
  effectiveCanvasWidth: number;
  getPhoneProjectedRect: () => CertificateRect | null;
  onStateChange: (nextState: ContactPanelState) => void;
  onRequestClose: () => void;
}

function isRectOnScreen(rect: CertificateRect | null): rect is CertificateRect {
  if (!rect || typeof window === 'undefined') return false;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  return (
    rect.width > 4 &&
    rect.height > 4 &&
    rect.left + rect.width > 0 &&
    rect.left < vw &&
    rect.top + rect.height > 0 &&
    rect.top < vh
  );
}

const CONTACT_LINKS = [
  {
    id: 'linkedin',
    label: 'LinkedIn',
    value: 'linkedin.com/in/abhinav-nakka-5133b1356/',
    href: 'https://www.linkedin.com/in/abhinav-nakka-5133b1356/',
    external: true,
  },
  {
    id: 'github',
    label: 'GitHub',
    value: 'github.com/Abhinav1480',
    href: 'https://github.com/Abhinav1480',
    external: true,
  },
  {
    id: 'whatsapp',
    label: 'Phone / WhatsApp',
    value: '+91 93923 80501',
    href: 'https://wa.me/919392380501',
    external: true,
  },
  {
    id: 'email',
    label: 'Email',
    value: 'nakkaabhinav19@gmail.com',
    href: 'mailto:nakkaabhinav19@gmail.com',
    external: false,
  },
] as const;

export const ContactPanel: React.FC<ContactPanelProps> = ({
  panelState,
  reducedMotion,
  effectiveCanvasWidth,
  getPhoneProjectedRect,
  onStateChange,
  onRequestClose,
}) => {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  // Stable refs for callbacks so parent re-renders never restart active GSAP timelines
  const onStateChangeRef = useRef(onStateChange);
  onStateChangeRef.current = onStateChange;
  const onRequestCloseRef = useRef(onRequestClose);
  onRequestCloseRef.current = onRequestClose;
  const getPhoneProjectedRectRef = useRef(getPhoneProjectedRect);
  getPhoneProjectedRectRef.current = getPhoneProjectedRect;
  const panelStateRef = useRef<ContactPanelState>(panelState);
  panelStateRef.current = panelState;

  // Track active animation phase and single GSAP timeline instance
  const animatedPhaseRef = useRef<ContactPanelState>('closed');
  const timelineRef = useRef<gsap.core.Timeline | null>(null);

  const killActiveTimeline = useCallback(() => {
    if (timelineRef.current) {
      timelineRef.current.kill();
      timelineRef.current = null;
    }
    if (cardRef.current) {
      gsap.killTweensOf(cardRef.current);
    }
    if (backdropRef.current) {
      gsap.killTweensOf(backdropRef.current);
    }
  }, []);

  // Clean up any active GSAP timeline on unmount (and reset phase for React Strict Mode)
  useEffect(() => {
    return () => {
      killActiveTimeline();
      animatedPhaseRef.current = 'closed';
    };
  }, [killActiveTimeline]);

  const triggerClose = useCallback(() => {
    if (
      panelStateRef.current === 'closed' ||
      panelStateRef.current === 'closing' ||
      animatedPhaseRef.current === 'closing'
    ) {
      return;
    }
    onRequestCloseRef.current();
  }, []);

  // Deterministic state machine: 'closed' -> 'opening' -> 'open' -> 'closing' -> 'closed'
  useEffect(() => {
    if (panelState === 'closed') {
      killActiveTimeline();
      animatedPhaseRef.current = 'closed';
      return;
    }

    const cardEl = cardRef.current;
    const backdropEl = backdropRef.current;
    if (!cardEl || !backdropEl) return;

    if (panelState === 'opening') {
      // Idempotency guard: never restart the opening animation if already opening or open
      if (animatedPhaseRef.current === 'opening' || animatedPhaseRef.current === 'open') {
        return;
      }
      animatedPhaseRef.current = 'opening';
      killActiveTimeline();

      if (reducedMotion) {
        gsap.set(backdropEl, { opacity: 1 });
        gsap.set(cardEl, { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 });
        animatedPhaseRef.current = 'open';
        onStateChangeRef.current('open');
        closeBtnRef.current?.focus({ preventScroll: true });
        return;
      }

      const phoneRect = getPhoneProjectedRectRef.current();
      const targetBox = cardEl.getBoundingClientRect();
      const targetCenterX = targetBox.left + targetBox.width / 2 || window.innerWidth / 2;
      const targetCenterY = targetBox.top + targetBox.height / 2 || window.innerHeight / 2;

      const tl = gsap.timeline({
        onComplete: () => {
          timelineRef.current = null;
          animatedPhaseRef.current = 'open';
          onStateChangeRef.current('open');
          closeBtnRef.current?.focus({ preventScroll: true });
        },
      });
      timelineRef.current = tl;

      if (isRectOnScreen(phoneRect)) {
        const originCenterX = phoneRect.left + phoneRect.width / 2;
        const originCenterY = phoneRect.top + phoneRect.height / 2;
        const dx = originCenterX - targetCenterX;
        const dy = originCenterY - targetCenterY;
        const sx = Math.max(
          0.08,
          Math.min(0.65, phoneRect.width / Math.max(1, targetBox.width || 760))
        );
        const sy = Math.max(
          0.12,
          Math.min(0.65, phoneRect.height / Math.max(1, targetBox.height || 500))
        );

        tl.fromTo(
          backdropEl,
          { opacity: 0 },
          { opacity: 1, duration: 0.38, ease: 'power2.out' },
          0
        ).fromTo(
          cardEl,
          { x: dx, y: dy, scaleX: sx, scaleY: sy, opacity: 0.25 },
          {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            duration: 0.48,
            ease: 'power3.out',
          },
          0
        );
      } else {
        tl.fromTo(
          backdropEl,
          { opacity: 0 },
          { opacity: 1, duration: 0.3, ease: 'power2.out' },
          0
        ).fromTo(
          cardEl,
          { x: 0, y: 36, scaleX: 0.86, scaleY: 0.86, opacity: 0 },
          {
            x: 0,
            y: 0,
            scaleX: 1,
            scaleY: 1,
            opacity: 1,
            duration: 0.42,
            ease: 'power3.out',
          },
          0
        );
      }
    } else if (panelState === 'open') {
      animatedPhaseRef.current = 'open';
      gsap.set(backdropEl, { opacity: 1 });
      gsap.set(cardEl, { opacity: 1, x: 0, y: 0, scaleX: 1, scaleY: 1 });
    } else if (panelState === 'closing') {
      // Idempotency guard: never restart the closing animation if already closing
      if (animatedPhaseRef.current === 'closing') {
        return;
      }
      animatedPhaseRef.current = 'closing';
      killActiveTimeline();

      if (reducedMotion) {
        animatedPhaseRef.current = 'closed';
        onStateChangeRef.current('closed');
        return;
      }

      const phoneRect = getPhoneProjectedRectRef.current();
      const cardBox = cardEl.getBoundingClientRect();
      const cardCenterX = cardBox.left + cardBox.width / 2;
      const cardCenterY = cardBox.top + cardBox.height / 2;

      const tl = gsap.timeline({
        onComplete: () => {
          timelineRef.current = null;
          animatedPhaseRef.current = 'closed';
          onStateChangeRef.current('closed');
        },
      });
      timelineRef.current = tl;

      if (isRectOnScreen(phoneRect)) {
        const destCenterX = phoneRect.left + phoneRect.width / 2;
        const destCenterY = phoneRect.top + phoneRect.height / 2;
        const dx = destCenterX - cardCenterX;
        const dy = destCenterY - cardCenterY;
        const sx = Math.max(0.08, Math.min(0.65, phoneRect.width / Math.max(1, cardBox.width)));
        const sy = Math.max(0.12, Math.min(0.65, phoneRect.height / Math.max(1, cardBox.height)));

        tl.to(
          backdropEl,
          {
            opacity: 0,
            duration: 0.32,
            ease: 'power2.in',
          },
          0
        ).to(
          cardEl,
          {
            x: dx,
            y: dy,
            scaleX: sx,
            scaleY: sy,
            opacity: 0,
            duration: 0.36,
            ease: 'power3.in',
          },
          0
        );
      } else {
        tl.to(
          backdropEl,
          {
            opacity: 0,
            duration: 0.25,
            ease: 'power2.in',
          },
          0
        ).to(
          cardEl,
          {
            x: 0,
            y: 28,
            scaleX: 0.88,
            scaleY: 0.88,
            opacity: 0,
            duration: 0.28,
            ease: 'power2.in',
          },
          0
        );
      }
    }
  }, [killActiveTimeline, panelState, reducedMotion]);

  // Escape key closes the contact panel once
  useEffect(() => {
    if (panelState === 'closed' || panelState === 'closing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        triggerClose();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [panelState, triggerClose]);

  if (panelState === 'closed') {
    return null;
  }

  // Desktop target width: 720-820px (or 55%-70% of effective canvas width, capped at 82vw);
  // Mobile (<768px): 92vw responsive width
  const isCompactMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const computedDesktopWidth = Math.round(
    Math.min(800, Math.max(720, effectiveCanvasWidth * 0.62))
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Contact Abhinav Nakka"
      data-testid="phone-contact-panel"
      data-panel-state={panelState}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[90] flex items-center justify-center p-3 sm:p-6 select-none"
    >
      {/* Subtle translucent backdrop that keeps the 3D room clearly visible around the floating panel */}
      <div
        ref={backdropRef}
        data-testid="phone-contact-backdrop"
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          triggerClose();
        }}
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(26, 20, 46, 0.36)',
        }}
      />

      {/* Floating Contact Panel Card anchored to the phone interaction */}
      <div
        ref={cardRef}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 flex flex-col justify-between overflow-y-auto shadow-2xl"
        style={{
          width: isCompactMobile ? 'min(92vw, 420px)' : `min(82vw, ${computedDesktopWidth}px)`,
          minHeight: isCompactMobile ? 'auto' : '480px',
          maxHeight: '78vh',
          padding: isCompactMobile ? '22px 20px' : '32px 36px',
          borderRadius: '22px',
          backgroundColor: 'rgba(36, 27, 54, 0.96)',
          color: PALETTE.screenDarkText,
          border: `2px solid ${PALETTE.screenAccentContact}`,
          boxShadow: '0 24px 64px rgba(12, 8, 24, 0.65)',
          transformOrigin: 'center center',
        }}
      >
        {/* Top-Right Close Button (✕, >= 40x40px hit area) */}
        <button
          ref={closeBtnRef}
          type="button"
          data-testid="phone-contact-close"
          aria-label="Close contact panel"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            triggerClose();
          }}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 flex h-11 w-11 min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded-full text-lg font-extrabold transition-transform duration-150 hover:scale-105 focus-visible:outline-2"
          style={{
            backgroundColor: PALETTE.screenDarkCardBg,
            color: PALETTE.screenDarkText,
            border: `1.5px solid ${PALETTE.screenAccentContact}`,
            outlineColor: PALETTE.uiPrimaryAccent,
          }}
        >
          ✕
        </button>

        {/* Header: 1. Name & 2. Role */}
        <div className="pr-12">
          <div
            className="text-xs font-bold tracking-widest uppercase"
            style={{
              color: PALETTE.screenAccentContact,
              fontFamily: '"JetBrains Mono", monospace',
            }}
          >
            05 / Contact
          </div>

          {/* 1. Name: Abhinav Nakka (28-36px on desktop) */}
          <h2
            data-testid="contact-panel-name"
            className="mt-1 font-extrabold tracking-tight"
            style={{
              fontSize: isCompactMobile ? '24px' : '32px',
              lineHeight: 1.18,
              color: PALETTE.screenDarkText,
              fontFamily: '"Sora", "Outfit", sans-serif',
            }}
          >
            Abhinav Nakka
          </h2>

          {/* 2. Role: Full-Stack Developer | UI Engineer | Creative Developer */}
          <p
            data-testid="contact-panel-role"
            className="mt-1.5 font-semibold"
            style={{
              fontSize: isCompactMobile ? '14px' : '17px',
              lineHeight: 1.4,
              color: PALETTE.screenDarkTextSecondary,
              fontFamily: '"Inter", sans-serif',
            }}
          >
            Full-Stack Developer | UI Engineer | Creative Developer
          </p>
        </div>

        {/* 3..6: Ordered Contact Links Grid (LinkedIn, GitHub, Phone / WhatsApp, Email) */}
        <div className="my-4 grid grid-cols-1 gap-2.5 sm:my-5 sm:grid-cols-2 sm:gap-3.5">
          {CONTACT_LINKS.map((item) => (
            <a
              key={item.id}
              data-testid={`contact-panel-link-${item.id}`}
              href={item.href}
              target={item.external ? '_blank' : undefined}
              rel={item.external ? 'noopener noreferrer' : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onPointerUp={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="group flex flex-col justify-between rounded-2xl px-4 py-3.5 transition-all duration-150 hover:scale-[1.015] focus-visible:outline-2"
              style={{
                backgroundColor: PALETTE.screenDarkCardBg,
                border: `1.5px solid rgba(195, 166, 255, 0.42)`,
                outlineColor: PALETTE.screenAccentContact,
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className="text-xs font-bold tracking-wider uppercase"
                  style={{
                    color: PALETTE.screenAccentContact,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  {item.label}
                </span>
                <span
                  className="text-base font-extrabold transition-transform duration-150 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                  style={{ color: PALETTE.screenAccentContact }}
                  aria-hidden="true"
                >
                  ↗
                </span>
              </div>
              <span
                className="mt-1.5 break-all font-bold"
                style={{
                  fontSize: isCompactMobile ? '15px' : '17px',
                  lineHeight: 1.35,
                  color: PALETTE.screenDarkText,
                  fontFamily: '"Inter", sans-serif',
                }}
              >
                {item.value}
              </span>
            </a>
          ))}
        </div>

        {/* 7. Subheading */}
        <div
          data-testid="contact-panel-subheading"
          className="rounded-xl px-4 py-3 text-center font-medium"
          style={{
            backgroundColor: 'rgba(51, 38, 74, 0.72)',
            border: '1px solid rgba(195, 166, 255, 0.28)',
            fontSize: isCompactMobile ? '14px' : '16px',
            lineHeight: 1.45,
            color: PALETTE.screenDarkTextSecondary,
            fontFamily: '"Inter", sans-serif',
          }}
        >
          “Available for full-stack, frontend, and creative developer internships.”
        </div>
      </div>
    </div>
  );
};
