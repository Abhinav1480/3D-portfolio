import React from 'react';
import { PortfolioMode } from '../camera/CameraRig';
import { ScreenId } from '../config/layout';
import { PALETTE } from '../config/palette';
import { CERTIFICATES } from '../data/certificates';
import { PORTFOLIO_CONTENT } from '../data/content';
import { LightDebugState } from '../scene/Lights';
import { HitActionType, HitRegion } from '../screens/hitRegions';

export interface HUDProps {
  activeStopIndex: number;
  mode: PortfolioMode;
  locationName: string;
  focusedScreenId: ScreenId | null;
  focusedPage: number;
  focusedTotalVisiblePages: number;
  focusedHitRegions: readonly HitRegion[];
  hoveredScreenInfo: { screenId: ScreenId; label: string } | null;
  hoveredCertificateInfo: { index: number; title: string } | null;
  hoveredGuitar: boolean;
  soundMuted: boolean;
  guitarAudioToast?: string | null;
  hasScrolled: boolean;
  hudMinimized: boolean;
  reducedMotion: boolean;
  safeAreaBottomReservedPx: number;
  showShelfHintChip: boolean;
  showExploreHintChip: boolean;
  showAutoAdvanceHint: boolean;
  lightDebugOpen: boolean;
  lightDebug: LightDebugState;
  onDismissShelfHintChip: () => void;
  onDismissExploreHintChip: () => void;
  onResetExploreView: () => void;
  onToggleMinimize: () => void;
  onToggleSoundMuted: () => void;
  onPlayGuitarFromUI: () => void;
  onSelectStop: (stopIndex: number) => void;
  onPrevStop: () => void;
  onNextStop: () => void;
  onSkipToExplore: () => void;
  onBackToTour: () => void;
  onExitFocus: () => void;
  onChangeFocusedPage: (nextPage: number) => void;
  onExecuteHitAction: (screenId: ScreenId, action: HitActionType) => void;
  onFocusScreen?: (screenId: ScreenId) => void;
  onOpenCertificateFromUI: (index: number, triggerEl: HTMLElement | null) => void;
  onChangeLightDebug: (next: LightDebugState) => void;
}

const STOP_LABELS = [
  'Overview',
  'About (Laptop)',
  'Projects (Monitor 2)',
  'Experience & Roles (Monitor 3)',
  'Certificates (Shelf)',
  'Contact (Phone)',
] as const;

const MODE_DISPLAY_LABELS: Record<PortfolioMode, string> = {
  TOUR: 'Tour',
  EXPLORE: 'Explore',
  FOCUSED: 'Focused',
};

export const HUD: React.FC<HUDProps> = ({
  activeStopIndex,
  mode,
  locationName,
  focusedScreenId,
  focusedPage,
  focusedTotalVisiblePages,
  focusedHitRegions,
  hoveredScreenInfo,
  hoveredCertificateInfo,
  hoveredGuitar,
  soundMuted,
  guitarAudioToast,
  hasScrolled,
  hudMinimized,
  reducedMotion,
  safeAreaBottomReservedPx,
  showShelfHintChip,
  showExploreHintChip,
  showAutoAdvanceHint,
  lightDebugOpen,
  lightDebug,
  onDismissShelfHintChip,
  onDismissExploreHintChip,
  onResetExploreView,
  onToggleMinimize,
  onToggleSoundMuted,
  onPlayGuitarFromUI,
  onSelectStop,
  onPrevStop,
  onNextStop,
  onSkipToExplore,
  onBackToTour,
  onExitFocus,
  onChangeFocusedPage,
  onExecuteHitAction,
  onFocusScreen,
  onOpenCertificateFromUI,
  onChangeLightDebug,
}) => {
  const clampedStopIdx = Math.max(0, Math.min(STOP_LABELS.length - 1, activeStopIndex));
  const locationNumber = String(clampedStopIdx + 1).padStart(2, '0');

  const isAtOverview = mode === 'TOUR' && clampedStopIdx === 0;
  const isFocusedOnHovered =
    mode === 'FOCUSED' &&
    hoveredScreenInfo !== null &&
    focusedScreenId === hoveredScreenInfo.screenId;
  const showScreenHoverTooltip =
    hoveredScreenInfo !== null && !isFocusedOnHovered && !isAtOverview;

  const showCertHoverTooltip =
    hoveredCertificateInfo !== null && mode !== 'FOCUSED';

  const showGuitarHoverTooltip = hoveredGuitar && mode !== 'FOCUSED';

  // Prominent "Explore the Room" button centered just above the HUD when at the final stop (stop 5, Contact) in TOUR mode
  const showExploreRoomPrompt = mode === 'TOUR' && clampedStopIdx === 5;

  const hintBottomPx = Math.max(88, safeAreaBottomReservedPx + 6);
  const exploreHintBottomPx = showShelfHintChip ? hintBottomPx + 48 : hintBottomPx;
  const scrollHintBottomPx =
    showShelfHintChip || showExploreHintChip ? exploreHintBottomPx + 48 : 96;

  const contactData = PORTFOLIO_CONTENT.contact;

  return (
    <>
      {/* Visually hidden DOM mirror of the focused screen's text & actions + contact links + 11 certificate buttons for keyboard Tab/Enter */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        <p>
          Current Mode: {MODE_DISPLAY_LABELS[mode]}. Location {locationNumber} of 06: {locationName}.
        </p>
        {focusedScreenId && (
          <div>
            <h2>Focused Screen: {locationName}</h2>
            {focusedHitRegions.map((region) =>
              region.action.type === 'external-link' ? (
                <a
                  key={region.id}
                  href={region.action.url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {region.label}
                </a>
              ) : (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => onExecuteHitAction(focusedScreenId, region.action)}
                >
                  {region.label}
                </button>
              )
            )}
          </div>
        )}
        <nav aria-label="Contact links keyboard access">
          <a href={contactData.linkedin.url} target="_blank" rel="noopener noreferrer">
            LinkedIn Profile
          </a>
          <a href={contactData.github.url} target="_blank" rel="noopener noreferrer">
            GitHub Profile
          </a>
          <a href={contactData.phone.url} target="_blank" rel="noopener noreferrer">
            WhatsApp {contactData.phone.display}
          </a>
          <a href={contactData.email.url}>Email {contactData.email.address}</a>
        </nav>
      </div>

      {/* Visually hidden list of 11 certificate buttons + Play the guitar button */}
      <nav aria-label="Certificates and room props keyboard access" className="sr-only">
        <h2>Certificates (Wall Frames and Bookshelf)</h2>
        <ul>
          {CERTIFICATES.map((cert, idx) => (
            <li key={cert.id}>
              <button
                type="button"
                onClick={(e) => onOpenCertificateFromUI(idx, e.currentTarget)}
              >
                {`Open certificate ${idx + 1} of ${CERTIFICATES.length}: ${cert.title}`}
              </button>
            </li>
          ))}
          <li>
            <button type="button" onClick={onPlayGuitarFromUI}>
              Play the guitar
            </button>
          </li>
        </ul>
      </nav>

      {/* Hover Tooltip for Guitar, Certificate, or Screen */}
      {(showGuitarHoverTooltip || showCertHoverTooltip || showScreenHoverTooltip) && (
        <div
          role="tooltip"
          className="pointer-events-none fixed top-16 left-1/2 z-30 max-w-[90vw] -translate-x-1/2 truncate rounded-xl px-4 py-1.5 text-xs sm:text-sm font-bold shadow-md transition-opacity duration-150"
          style={{
            backgroundColor: PALETTE.uiFrostedCreamSolid,
            color: PALETTE.uiText,
            border: `2px solid ${PALETTE.uiPrimaryAccent}`,
          }}
        >
          {showGuitarHoverTooltip
            ? soundMuted
              ? 'Click to play (sound is off)'
              : 'Click to play the guitar'
            : showCertHoverTooltip && hoveredCertificateInfo
              ? `Click to open: ${hoveredCertificateInfo.title}`
              : hoveredScreenInfo
                ? `Click to focus: ${hoveredScreenInfo.label}`
                : ''}
        </div>
      )}

      {/* Slim Right-Side Progress Rail with 6 labeled dots (0..5) */}
      <aside
        aria-label="Tour Progress Rail"
        className="fixed top-1/2 right-3 z-30 hidden -translate-y-1/2 flex-col items-end gap-2.5 md:flex"
      >
        {STOP_LABELS.map((label, idx) => {
          const isCurrent = clampedStopIdx === idx;
          const isAdjacent = Math.abs(clampedStopIdx - idx) === 1;
          const scale = isCurrent ? 1.25 : isAdjacent ? 1.05 : 0.9;
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onSelectStop(idx)}
              aria-label={`Jump to stop ${idx}: ${label}`}
              className="group flex cursor-pointer items-center gap-2 focus-visible:outline-2"
              style={{ outlineColor: PALETTE.uiPrimaryAccent }}
            >
              <span
                className="rounded-lg px-2.5 py-0.5 text-xs font-bold opacity-0 shadow-sm transition-opacity duration-150 group-hover:opacity-100"
                style={{
                  backgroundColor: PALETTE.uiFrostedCreamSolid,
                  color: PALETTE.uiText,
                }}
              >
                {label}
              </span>
              <span
                className="block rounded-full transition-transform duration-150"
                style={{
                  width: isCurrent ? '12px' : '8px',
                  height: isCurrent ? '12px' : '8px',
                  transform: `scale(${scale})`,
                  backgroundColor: isCurrent
                    ? PALETTE.uiPrimaryAccent
                    : PALETTE.uiFrostedCreamSolid,
                  border: `1.5px solid ${PALETTE.uiText}`,
                }}
              />
            </button>
          );
        })}
      </aside>

      {/* Scroll Hint that fades after the first scroll */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-1 rounded-full px-4 py-1.5 transition-opacity duration-300"
        style={{
          bottom: `${scrollHintBottomPx}px`,
          backgroundColor: PALETTE.uiFrostedCream,
          color: PALETTE.uiText,
          opacity: hasScrolled || mode !== 'TOUR' || clampedStopIdx !== 0 ? 0 : 0.92,
        }}
      >
        <span className="text-xs font-bold tracking-wider">Scroll to Tour Room</span>
        <span className="text-xs leading-none">▾</span>
      </div>

      {/* Subtle "Auto-advance in 3s" hint after 6 seconds of inactivity in TOUR mode */}
      {showAutoAdvanceHint && mode === 'TOUR' && (
        <div
          role="status"
          aria-live="polite"
          data-testid="auto-advance-hint"
          className="pointer-events-none fixed left-1/2 z-30 -translate-x-1/2 rounded-full px-4 py-1 text-xs font-bold whitespace-nowrap shadow-sm transition-opacity duration-200"
          style={{
            bottom: `${hintBottomPx + (showExploreRoomPrompt ? 48 : 0)}px`,
            backgroundColor: PALETTE.uiFrostedCreamSolid,
            color: PALETTE.uiText,
            border: `1.5px solid ${PALETTE.uiPrimaryAccent}`,
          }}
        >
          Auto-advance in 3s
        </div>
      )}

      {/* 2 s frosted cream toast above the HUD when AudioContext stays suspended */}
      {guitarAudioToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="guitar-audio-toast"
          className="pointer-events-none fixed left-1/2 z-40 -translate-x-1/2 rounded-xl px-4 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap shadow-md"
          style={{
            bottom: `${hintBottomPx + 46}px`,
            backgroundColor: PALETTE.uiFrostedCreamSolid,
            color: PALETTE.uiText,
            border: `1.5px solid ${PALETTE.uiPrimaryAccent}`,
          }}
        >
          {guitarAudioToast}
        </div>
      )}

      {/* Prominent "Explore the Room" button at the final stop (stop 5) centered just above the HUD */}
      {showExploreRoomPrompt && (
        <div
          className="fixed left-1/2 z-30 -translate-x-1/2"
          style={{ bottom: `${hintBottomPx}px` }}
        >
          <button
            type="button"
            data-testid="explore-the-room-button"
            onClick={onSkipToExplore}
            className="cursor-pointer rounded-2xl px-6 py-2.5 text-sm font-extrabold whitespace-nowrap shadow-lg transition-transform duration-150 hover:scale-105 focus-visible:outline-2"
            style={{
              backgroundColor: PALETTE.uiFrostedCreamSolid,
              color: PALETTE.uiText,
              border: `2px solid ${PALETTE.uiPrimaryAccent}`,
              outlineColor: PALETTE.uiPrimaryAccent,
            }}
          >
            Explore the Room
          </button>
        </div>
      )}

      {/* One-Time Bookshelf Certificate Hint Chip above the bottom HUD */}
      {(showShelfHintChip || !reducedMotion) && (
        <div
          role="status"
          aria-live="polite"
          data-testid="bookshelf-hint-chip"
          className={`fixed left-1/2 z-30 flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-bold shadow-md ${
            reducedMotion ? '' : 'transition-opacity duration-300'
          }`}
          style={{
            bottom: `${hintBottomPx}px`,
            backgroundColor: PALETTE.uiHintChipBg,
            color: PALETTE.screenText,
            border: `1.5px solid ${PALETTE.certGold}`,
            opacity: showShelfHintChip ? 1 : 0,
            pointerEvents: showShelfHintChip ? 'auto' : 'none',
          }}
        >
          <span>8 more certificates on the bookshelf. Click the gold books.</span>
          <button
            type="button"
            data-testid="bookshelf-hint-show-me"
            onClick={(e) => {
              onDismissShelfHintChip();
              onOpenCertificateFromUI(3, e.currentTarget);
            }}
            className="cursor-pointer rounded-lg px-2.5 py-1 text-xs font-extrabold whitespace-nowrap transition-transform duration-150 hover:scale-105 focus-visible:outline-2"
            style={{
              backgroundColor: PALETTE.certGold,
              color: PALETTE.screenText,
              outlineColor: PALETTE.screenText,
            }}
          >
            Show me
          </button>
          <button
            type="button"
            data-testid="bookshelf-hint-dismiss"
            onClick={onDismissShelfHintChip}
            aria-label="Dismiss bookshelf certificates hint"
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-sm leading-none font-extrabold transition-transform duration-150 hover:scale-110 focus-visible:outline-2"
            style={{
              color: PALETTE.screenText,
              outlineColor: PALETTE.screenText,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* One-Time EXPLORE Mode Hint Chip above the bottom HUD */}
      {(showExploreHintChip || !reducedMotion) && (
        <div
          role="status"
          aria-live="polite"
          data-testid="explore-hint-chip"
          className={`fixed left-1/2 z-30 flex max-w-[92vw] -translate-x-1/2 items-center gap-2.5 rounded-2xl px-3.5 py-2 text-xs sm:text-sm font-bold shadow-md ${
            reducedMotion ? '' : 'transition-opacity duration-300'
          }`}
          style={{
            bottom: `${exploreHintBottomPx}px`,
            backgroundColor: PALETTE.uiHintChipBg,
            color: PALETTE.screenText,
            border: `1.5px solid ${PALETTE.accentSkills}`,
            opacity: showExploreHintChip ? 1 : 0,
            pointerEvents: showExploreHintChip ? 'auto' : 'none',
          }}
        >
          <span>Scroll to zoom to the cursor. Right-drag to pan. Double-click to focus.</span>
          <button
            type="button"
            data-testid="explore-hint-dismiss"
            onClick={onDismissExploreHintChip}
            aria-label="Dismiss explore controls hint"
            className="cursor-pointer rounded-md px-1.5 py-0.5 text-sm leading-none font-extrabold transition-transform duration-150 hover:scale-110 focus-visible:outline-2"
            style={{
              color: PALETTE.screenText,
              outlineColor: PALETTE.screenText,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* Hidden Light Debug Panel (key L) */}
      {lightDebugOpen && (
        <aside
          aria-label="Lighting Debug Controls"
          className="fixed top-20 right-14 z-40 w-64 rounded-2xl p-4 shadow-xl"
          style={{
            backgroundColor: PALETTE.uiFrostedCreamSolid,
            color: PALETTE.uiText,
            border: `2px solid ${PALETTE.uiBorderCream}`,
          }}
        >
          <div className="flex items-center justify-between">
            <h3
              className="text-xs font-extrabold uppercase"
              style={{ fontFamily: '"JetBrains Mono", monospace' }}
            >
              Light Debug (Key L)
            </h3>
          </div>
          <div className="mt-3 space-y-1.5 text-xs font-semibold">
            {(
              [
                ['environment', 'Environment (0.25)'],
                ['hemisphere', 'Hemisphere (0.50)'],
                ['ambient', 'Ambient (0.32)'],
                ['moon', 'Moon Directional (0.44)'],
                ['lamps', 'Warm Lamps (2x 1.0)'],
                ['backglow', 'Monitor Backglow (0.22)'],
                ['emissives', 'Screen/Sign Emissives'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between py-0.5">
                <span>{label}</span>
                <input
                  type="checkbox"
                  checked={lightDebug[key]}
                  onChange={(e) =>
                    onChangeLightDebug({ ...lightDebug, [key]: e.target.checked })
                  }
                />
              </label>
            ))}

            <div className="pt-2">
              <div className="flex justify-between">
                <span>Exposure</span>
                <span className="tabular-nums">{lightDebug.exposure.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min={0.6}
                max={1.0}
                step={0.01}
                value={lightDebug.exposure}
                onChange={(e) =>
                  onChangeLightDebug({ ...lightDebug, exposure: Number(e.target.value) })
                }
                className="mt-1 w-full"
              />
            </div>
          </div>
        </aside>
      )}

      {/* Unified Collapsible Bottom HUD Dock */}
      <div
        data-ui-hud="true"
        className="fixed bottom-3 left-1/2 z-30 w-full max-w-5xl -translate-x-1/2 px-3 sm:px-4"
      >
        <div className="flex flex-col items-center">
          {/* Collapse / Expand toggle button (Key H) */}
          <button
            type="button"
            onClick={onToggleMinimize}
            aria-label={hudMinimized ? 'Show HUD Controls (Key H)' : 'Hide HUD Controls (Key H)'}
            className="mb-1.5 cursor-pointer rounded-full px-4 py-1 text-xs font-bold shadow-sm transition-transform duration-150 hover:scale-105 focus-visible:outline-2"
            style={{
              backgroundColor: PALETTE.uiFrostedCreamSolid,
              color: PALETTE.uiText,
              border: `1px solid ${PALETTE.uiBorderCream}`,
              outlineColor: PALETTE.uiPrimaryAccent,
            }}
          >
            {hudMinimized ? '▴ Show HUD (H)' : '▾ Hide HUD (H)'}
          </button>

          {!hudMinimized && (
            <div
              className="flex w-full flex-wrap items-center justify-between gap-2.5 sm:gap-3 rounded-2xl px-3.5 py-2.5 sm:px-4 shadow-lg"
              style={{
                backgroundColor: PALETTE.uiFrostedCream,
                color: PALETTE.uiText,
                border: `1px solid ${PALETTE.uiBorderCream}`,
              }}
            >
              {/* Left: Location 01 of 06, Mode Badge, Location Name */}
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className="text-xs sm:text-sm font-extrabold tabular-nums"
                  style={{ fontFamily: '"JetBrains Mono", monospace' }}
                >
                  Location {locationNumber} of 06
                </span>

                <span
                  className="rounded-lg px-2.5 py-0.5 text-xs font-extrabold tracking-wide"
                  style={{
                    backgroundColor:
                      mode === 'FOCUSED'
                        ? PALETTE.accentProjects
                        : mode === 'EXPLORE'
                          ? PALETTE.accentSkills
                          : PALETTE.uiPrimaryAccent,
                    color: PALETTE.screenBg,
                    fontFamily: '"JetBrains Mono", monospace',
                  }}
                >
                  {MODE_DISPLAY_LABELS[mode]}
                </span>

                <span className="text-xs sm:text-sm font-bold whitespace-nowrap">
                  {locationName}
                </span>
              </div>

              {/* Center: Previous / Stop Dots 0..5 / Next Tour Controls */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  data-testid="hud-tour-prev"
                  onClick={onPrevStop}
                  disabled={clampedStopIdx <= 0 && mode === 'TOUR'}
                  aria-label="Previous tour stop"
                  className="cursor-pointer rounded-xl px-2.5 py-1 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2"
                  style={{
                    backgroundColor: PALETTE.screenCardBg,
                    color: PALETTE.uiText,
                    border: `1px solid ${PALETTE.uiBorderCream}`,
                    outlineColor: PALETTE.uiPrimaryAccent,
                  }}
                >
                  ← Previous
                </button>

                <div className="hidden sm:flex items-center gap-1.5" role="group" aria-label="Stop Dots">
                  {[0, 1, 2, 3, 4, 5].map((idx) => {
                    const isActive = clampedStopIdx === idx;
                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onSelectStop(idx)}
                        aria-label={`Stop ${idx}: ${STOP_LABELS[idx]}`}
                        className="h-2.5 cursor-pointer rounded-full transition-all duration-150 focus-visible:outline-2"
                        style={{
                          width: isActive ? '22px' : '10px',
                          backgroundColor: isActive
                            ? PALETTE.uiPrimaryAccent
                            : PALETTE.screenCardBorder,
                          outlineColor: PALETTE.uiText,
                        }}
                      />
                    );
                  })}
                </div>

                <button
                  type="button"
                  data-testid="hud-tour-next"
                  onClick={onNextStop}
                  disabled={clampedStopIdx >= 5 && mode === 'TOUR'}
                  aria-label="Next tour stop"
                  className="cursor-pointer rounded-xl px-2.5 py-1 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2"
                  style={{
                    backgroundColor: PALETTE.screenCardBg,
                    color: PALETTE.uiText,
                    border: `1px solid ${PALETTE.uiBorderCream}`,
                    outlineColor: PALETTE.uiPrimaryAccent,
                  }}
                >
                  Next →
                </button>
              </div>

              {/* Right: Focused screen page controls, Reset View, Certificates, and Skip to Explore / Back to Tour */}
              <div className="flex flex-wrap items-center gap-2">
                {mode === 'FOCUSED' && focusedTotalVisiblePages > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        onChangeFocusedPage(
                          (focusedPage - 1 + focusedTotalVisiblePages) % focusedTotalVisiblePages
                        )
                      }
                      className="cursor-pointer rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold whitespace-nowrap"
                      style={{
                        backgroundColor: PALETTE.screenCardBg,
                        color: PALETTE.uiText,
                        border: `1px solid ${PALETTE.uiBorderCream}`,
                      }}
                    >
                      ← Page
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onChangeFocusedPage((focusedPage + 1) % focusedTotalVisiblePages)
                      }
                      className="cursor-pointer rounded-lg px-2.5 py-1 text-xs sm:text-sm font-bold whitespace-nowrap"
                      style={{
                        backgroundColor: PALETTE.screenCardBg,
                        color: PALETTE.uiText,
                        border: `1px solid ${PALETTE.uiBorderCream}`,
                      }}
                    >
                      Page →
                    </button>
                  </div>
                )}

                {mode === 'EXPLORE' && (
                  <button
                    type="button"
                    data-testid="hud-reset-view-button"
                    onClick={onResetExploreView}
                    className="cursor-pointer rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
                    style={{
                      backgroundColor: PALETTE.screenCardBg,
                      color: PALETTE.uiText,
                      border: `1.5px solid ${PALETTE.accentSkills}`,
                      outlineColor: PALETTE.accentSkills,
                    }}
                  >
                    Reset View
                  </button>
                )}

                {/* Technical Skills (Monitor 1) quick-focus button */}
                {onFocusScreen && focusedScreenId !== 'skills' && (
                  <button
                    type="button"
                    data-testid="hud-skills-button"
                    onClick={() => onFocusScreen('skills')}
                    className="cursor-pointer rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
                    style={{
                      backgroundColor: PALETTE.screenCardBg,
                      color: PALETTE.uiText,
                      border: `1.5px solid ${PALETTE.accentSkills}`,
                      outlineColor: PALETTE.accentSkills,
                    }}
                  >
                    Technical Skills
                  </button>
                )}

                {/* HUD Certificates Button (opens full-screen viewer at certificate 1) */}
                <button
                  type="button"
                  data-testid="hud-certificates-button"
                  onClick={(e) => onOpenCertificateFromUI(0, e.currentTarget)}
                  className="cursor-pointer rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
                  style={{
                    backgroundColor: PALETTE.screenCardBg,
                    color: PALETTE.uiText,
                    border: `1.5px solid ${PALETTE.uiPrimaryAccent}`,
                    outlineColor: PALETTE.uiPrimaryAccent,
                  }}
                >
                  Certificates
                </button>

                {/* Guitar Audio Mute / Unmute Button */}
                <button
                  type="button"
                  data-testid="hud-mute-button"
                  onClick={onToggleSoundMuted}
                  aria-pressed={soundMuted}
                  aria-label={soundMuted ? 'Unmute room audio' : 'Mute room audio'}
                  className="cursor-pointer rounded-xl px-2.5 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
                  style={{
                    backgroundColor: PALETTE.screenCardBg,
                    color: PALETTE.uiText,
                    border: `1px solid ${PALETTE.uiBorderCream}`,
                    outlineColor: PALETTE.uiPrimaryAccent,
                  }}
                >
                  {soundMuted ? 'Muted' : 'Sound On'}
                </button>

                {mode === 'FOCUSED' && (
                  <button
                    type="button"
                    data-testid="hud-back-to-room-button"
                    onClick={onExitFocus}
                    className="cursor-pointer rounded-xl px-3 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap"
                    style={{
                      backgroundColor: PALETTE.uiText,
                      color: PALETTE.screenBg,
                    }}
                  >
                    Back to Room (Esc)
                  </button>
                )}

                {mode === 'TOUR' ? (
                  <button
                    type="button"
                    data-testid="hud-skip-to-explore-button"
                    onClick={onSkipToExplore}
                    className="cursor-pointer rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
                    style={{
                      backgroundColor: PALETTE.uiPrimaryAccent,
                      color: PALETTE.screenBg,
                      outlineColor: PALETTE.uiText,
                    }}
                  >
                    Skip to Explore
                  </button>
                ) : (
                  <button
                    type="button"
                    data-testid="hud-back-to-tour-button"
                    onClick={onBackToTour}
                    className="cursor-pointer rounded-xl px-3.5 py-1.5 text-xs sm:text-sm font-bold whitespace-nowrap transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-2"
                    style={{
                      backgroundColor: PALETTE.uiPrimaryAccent,
                      color: PALETTE.screenBg,
                      outlineColor: PALETTE.uiText,
                    }}
                  >
                    Back to Tour
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
