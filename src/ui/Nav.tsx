import React from 'react';
import { PALETTE } from '../config/palette';
import { PORTFOLIO_CONTENT } from '../data/content';

export interface NavProps {
  activeStopIndex: number;
  onSelectStop: (stopIndex: number) => void;
}

const NAV_ITEMS = [
  { index: 0, code: '00', label: 'Overview', accent: PALETTE.uiPrimaryAccent },
  { index: 1, code: '01', label: 'About', accent: PALETTE.accentAbout },
  { index: 2, code: '02', label: 'Projects', accent: PALETTE.accentProjects },
  { index: 3, code: '03', label: 'Experience & Roles', accent: PALETTE.accentExperience },
  { index: 4, code: '04', label: 'Certificates', accent: PALETTE.certGold },
  { index: 5, code: '05', label: 'Contact', accent: PALETTE.accentContact },
] as const;

export const Nav: React.FC<NavProps> = ({
  activeStopIndex,
  onSelectStop,
}) => {
  return (
    <header
      data-ui-nav="true"
      className="fixed top-0 right-0 left-0 z-30 flex items-center justify-between gap-3 px-3 py-2.5 sm:px-5 sm:py-3"
      style={{ pointerEvents: 'none' }}
    >
      {/* Top-left chip: "ABHINAV | Full-Stack & UI Engineer" */}
      <button
        type="button"
        onClick={() => onSelectStop(0)}
        className="pointer-events-auto shrink-0 cursor-pointer rounded-xl px-3.5 py-2 text-xs sm:text-sm font-bold tracking-tight whitespace-nowrap shadow-sm transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
        style={{
          backgroundColor: PALETTE.uiFrostedCream,
          color: PALETTE.uiText,
          border: `1px solid ${PALETTE.uiBorderCream}`,
          outlineColor: PALETTE.uiPrimaryAccent,
        }}
      >
        {PORTFOLIO_CONTENT.profile.shortChip}
      </button>

      {/* Center Top Nav: 00 Overview .. 05 Certificates */}
      <nav
        aria-label="Portfolio Tour Stops"
        className="pointer-events-auto hidden items-center gap-1 rounded-2xl p-1.5 shadow-sm lg:flex"
        style={{
          backgroundColor: PALETTE.uiFrostedCream,
          border: `1px solid ${PALETTE.uiBorderCream}`,
        }}
      >
        {NAV_ITEMS.map((item) => {
          const isActive = activeStopIndex === item.index;
          return (
            <button
              key={item.index}
              type="button"
              onClick={() => onSelectStop(item.index)}
              aria-current={isActive ? 'step' : undefined}
              className="cursor-pointer rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 focus-visible:outline-2"
              style={{
                backgroundColor: isActive ? item.accent : 'transparent',
                color: isActive ? PALETTE.screenBg : PALETTE.uiText,
                outlineColor: item.accent,
              }}
            >
              <span
                className="mr-1.5 opacity-80 tabular-nums"
                style={{ fontFamily: '"JetBrains Mono", monospace' }}
              >
                {item.code}
              </span>
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="hidden w-[64px] shrink-0 xl:block" aria-hidden="true" />
    </header>
  );
};
