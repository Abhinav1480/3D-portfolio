import React from 'react';
import { PALETTE } from '../config/palette';
import { PortfolioMode } from '../camera/CameraRig';

export interface SectionOverlayProps {
  activeStopIndex: number;
  nearFactor: number;
  mode: PortfolioMode;
  leftMarginPx: number;
}

const SECTION_META: Record<
  number,
  { indexLabel: string; title: string; tagline: string; accent: string }
> = {
  1: {
    indexLabel: '01 / 05',
    title: 'About',
    tagline: 'B.Tech CSE @ VJIT · Full-Stack & UI Engineer',
    accent: PALETTE.accentAbout,
  },
  2: {
    indexLabel: '02 / 05',
    title: 'Projects',
    tagline: 'ExamOS, ORCA, Clinic Desk & StockPilot',
    accent: PALETTE.accentProjects,
  },
  3: {
    indexLabel: '03 / 05',
    title: 'Experience & Roles',
    tagline: 'InAmigos Internship, AWS Cloud Club & Hackathons',
    accent: PALETTE.accentExperience,
  },
  4: {
    indexLabel: '04 / 05',
    title: 'Certificates',
    tagline: '11 Verified Hackathon, Training & Internship Certificates',
    accent: PALETTE.certGold,
  },
  5: {
    indexLabel: '05 / 05',
    title: 'Contact',
    tagline: 'Abhinav Nakka · LinkedIn, GitHub, WhatsApp & Email',
    accent: PALETTE.accentContact,
  },
};

export const SectionOverlay: React.FC<SectionOverlayProps> = ({
  activeStopIndex,
  nearFactor,
  mode,
  leftMarginPx,
}) => {
  const meta = SECTION_META[activeStopIndex];
  // Never overlap the focused screen; only show during TOUR transition
  const visible = mode === 'TOUR' && Boolean(meta) && nearFactor > 0.15 && nearFactor < 0.88;

  if (!meta) return null;

  // If the left margin outside the focused screen is narrower than 300 px,
  // render as a compact chip directly under the brand chip at the top-left so it never overlaps the screen.
  if (leftMarginPx < 300) {
    return (
      <aside
        aria-hidden={!visible}
        data-section-overlay="compact-chip"
        className="pointer-events-none fixed top-14 left-4 z-20 inline-flex items-center gap-2 rounded-xl px-3 py-1.5 shadow-sm transition-all duration-200 md:left-6"
        style={{
          backgroundColor: PALETTE.uiFrostedCream,
          color: PALETTE.uiText,
          border: `1px solid ${PALETTE.uiBorderCream}`,
          opacity: visible ? 1 : 0,
          transform: visible ? 'translate3d(0, 0, 0)' : 'translate3d(0, -8px, 0)',
        }}
      >
        <span
          className="text-xs font-bold tracking-wider tabular-nums"
          style={{ color: meta.accent, fontFamily: '"JetBrains Mono", monospace' }}
        >
          {meta.indexLabel}
        </span>
        <span
          className="text-xs sm:text-sm font-extrabold tracking-tight"
          style={{ fontFamily: 'Outfit, sans-serif' }}
        >
          {meta.title}
        </span>
      </aside>
    );
  }

  return (
    <aside
      aria-hidden={!visible}
      data-section-overlay="card"
      className="pointer-events-none fixed bottom-24 left-6 z-20 hidden max-w-[280px] rounded-2xl p-4 shadow-md transition-all duration-200 xl:block"
      style={{
        backgroundColor: PALETTE.uiFrostedCream,
        color: PALETTE.uiText,
        border: `1px solid ${PALETTE.uiBorderCream}`,
        opacity: visible ? 1 : 0,
        transform: visible ? 'translate3d(0, 0, 0)' : 'translate3d(-18px, 0, 0)',
      }}
    >
      <div
        className="text-xs font-bold tracking-wider tabular-nums"
        style={{ color: meta.accent, fontFamily: '"JetBrains Mono", monospace' }}
      >
        {meta.indexLabel}
      </div>
      <h2
        className="mt-0.5 text-2xl font-extrabold tracking-tight"
        style={{ fontFamily: 'Outfit, sans-serif' }}
      >
        {meta.title}
      </h2>
      <p className="mt-1 text-xs sm:text-sm font-medium opacity-85">{meta.tagline}</p>
    </aside>
  );
};
