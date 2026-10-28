import { PALETTE } from '../../config/palette';
import { PORTFOLIO_CONTENT, ProjectData } from '../../data/content';
import { createHitRegion, HitRegion, SCREEN_TEX_H, SCREEN_TEX_W } from '../hitRegions';
import {
  drawAccentChip,
  drawDarkCard,
  drawDarkNavButton,
  drawSubtleEdgeVignette,
  drawTrackedLabel,
  drawWrappedText,
  fillRoundRect,
  hexToRgba,
  setupDarkPageCanvas,
  strokeRoundRect,
} from './drawUtils';

export function drawProjectsPage(
  ctx: CanvasRenderingContext2D,
  page: number,
  hoveredRegionId: string | null
): HitRegion[] {
  const regions: HitRegion[] = [];
  const accent = PALETTE.screenAccentProjects; // #6FB1FF
  const margin = 60;

  setupDarkPageCanvas(ctx, SCREEN_TEX_W, SCREEN_TEX_H);

  if (page === 0) {
    // Page 0: 2x2 Cards with a bold accent title bar and direct GitHub link button
    drawTrackedLabel(ctx, '03 / PROJECTS · FEATURED WORK', margin, margin + 36, 26, accent, 0.08);
    drawTrackedLabel(
      ctx,
      'CLICK CARD OR GITHUB ↗',
      SCREEN_TEX_W - margin - 420,
      margin + 36,
      26,
      PALETTE.screenDarkTextSecondary,
      0.08
    );

    // Big Page Title (76 px Sora 700 in #FFF3DC)
    ctx.font = '700 76px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Featured Projects', margin, 194);

    const gridTop = 232;
    const gapX = 28;
    const gapY = 26;
    const cardW = (SCREEN_TEX_W - margin * 2 - gapX) / 2;
    const cardH = (SCREEN_TEX_H - gridTop - margin - gapY) / 2;

    PORTFOLIO_CONTENT.projects.forEach((proj, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const cx = margin + col * (cardW + gapX);
      const cy = gridTop + row * (cardH + gapY);
      const regionId = `proj-card-${proj.id}`;
      const ghRegionId = `proj-gh-${proj.id}`;
      const isHovered = hoveredRegionId === regionId;
      const isGhHovered = hoveredRegionId === ghRegionId;

      // Card base (#33264A with 2 px #6FB1FF border at 40% opacity)
      drawDarkCard(ctx, cx, cy, cardW, cardH, 22, accent, isHovered || isGhHovered);

      // Bold accent title bar at top of card (22% accent fill + 4 px solid top accent stripe)
      const barH = 76;
      fillRoundRect(ctx, cx + 2, cy + 2, cardW - 4, barH, 20, hexToRgba(accent, 0.22));
      fillRoundRect(ctx, cx + 18, cy + 2, cardW - 36, 4, 2, accent);

      // Project Title inside accent title bar (42 px Sora 700 in #FFF3DC — clearly legible from tour stop)
      ctx.font = '700 42px "Sora", sans-serif';
      ctx.fillStyle = PALETTE.screenDarkText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(proj.shortTitle, cx + 28, cy + 54);

      // Action label on right of title bar (26 px JetBrains Mono 500 in #6FB1FF)
      drawTrackedLabel(ctx, 'DETAILS →', cx + cardW - 188, cy + 50, 26, accent, 0.08);

      // Card short description (22 px Inter 500 in #D9CBEA, up to 3 compact lines so full summary is readable without clipping)
      ctx.font = '500 22px "Inter", sans-serif';
      ctx.fillStyle = PALETTE.screenDarkTextSecondary;
      const summary = proj.oneLineSummary ?? '';
      drawWrappedText(ctx, summary, cx + 28, cy + 110, cardW - 56, 30, 3);

      // Accent chips at bottom-left of card
      let chipX = cx + 28;
      const chipY = cy + cardH - 68;
      for (const chip of proj.chips) {
        const w = drawAccentChip(ctx, chipX, chipY, chip, accent, 25, 16, 48);
        chipX += w + 12;
      }

      // Direct GitHub Repo button at bottom-right of each card
      const ghBtnW = 190;
      const ghBtnH = 48;
      const ghBtnX = cx + cardW - ghBtnW - 24;
      const ghBtnY = chipY;
      fillRoundRect(
        ctx,
        ghBtnX,
        ghBtnY,
        ghBtnW,
        ghBtnH,
        14,
        hexToRgba(accent, isGhHovered ? 0.32 : 0.18)
      );
      strokeRoundRect(ctx, ghBtnX, ghBtnY, ghBtnW, ghBtnH, 14, accent, isGhHovered ? 2.5 : 1.5);
      ctx.font = '700 24px "Sora", sans-serif';
      ctx.fillStyle = PALETTE.screenDarkText;
      ctx.textAlign = 'center';
      ctx.fillText('GitHub ↗', ghBtnX + ghBtnW / 2, ghBtnY + 32);
      ctx.textAlign = 'left';

      // Push direct GitHub link hit region first so it takes priority over card body click
      regions.push(
        createHitRegion(
          ghRegionId,
          `Open ${proj.shortTitle} GitHub (${proj.repoUrl})`,
          ghBtnX,
          ghBtnY,
          ghBtnW,
          ghBtnH,
          {
            type: 'external-link',
            url: proj.repoUrl,
            label: `${proj.shortTitle} GitHub`,
          }
        )
      );

      // Card body hit region opens detail page
      regions.push(
        createHitRegion(regionId, `Open ${proj.shortTitle} details`, cx, cy, cardW, cardH, {
          type: 'page',
          targetPage: proj.pageIndex,
        })
      );
    });

    drawSubtleEdgeVignette(ctx, SCREEN_TEX_W, SCREEN_TEX_H);
    return regions;
  }

  // Pages 1..4: Individual Project Detail View
  const proj: ProjectData =
    PORTFOLIO_CONTENT.projects[page - 1] ?? PORTFOLIO_CONTENT.projects[0];

  drawTrackedLabel(
    ctx,
    `03 / PROJECT 0${page} OF 04 · ${proj.shortTitle.toUpperCase()}`,
    margin,
    margin + 36,
    26,
    accent,
    0.08
  );

  // Back to Grid button at top-right
  const backW = 300;
  const backH = 56;
  const backX = SCREEN_TEX_W - margin - backW;
  const backY = margin;
  drawDarkNavButton(
    ctx,
    backX,
    backY,
    backW,
    backH,
    '← All Projects',
    accent,
    hoveredRegionId === 'proj-back-grid',
    false,
    26
  );
  regions.push(
    createHitRegion('proj-back-grid', 'Back to All Projects', backX, backY, backW, backH, {
      type: 'page',
      targetPage: 0,
    })
  );

  // Detail Page Heading: full project name for ORCA, shortTitle for others, fitted cleanly within margin
  const detailHeading = proj.id === 'sih' ? proj.fullTitle : proj.shortTitle;
  const maxHeadingW = SCREEN_TEX_W - margin * 2 - (proj.role ? 320 : 0);
  let headingFontPx = proj.id === 'sih' ? 44 : 68;
  ctx.font = `700 ${headingFontPx}px "Sora", sans-serif`;
  while (headingFontPx > 34 && ctx.measureText(detailHeading).width > maxHeadingW) {
    headingFontPx -= 2;
    ctx.font = `700 ${headingFontPx}px "Sora", sans-serif`;
  }
  ctx.fillStyle = PALETTE.screenDarkText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(detailHeading, margin, 178);

  if (proj.role) {
    const titleWidth = Math.ceil(ctx.measureText(detailHeading).width);
    drawAccentChip(ctx, margin + titleWidth + 28, 132, proj.role, accent, 26, 20, 48);
  }

  // Detail Description under the title (24 px Inter 500 in #D9CBEA, up to 2 lines)
  ctx.font = '500 24px "Inter", sans-serif';
  ctx.fillStyle = PALETTE.screenDarkTextSecondary;
  const subText = proj.problem ?? proj.oneLineSummary ?? proj.fullTitle;
  drawWrappedText(ctx, subText, margin, 224, SCREEN_TEX_W - margin * 2, 32, 2);

  // Detail Card
  const cardY = 282;
  const cardW = SCREEN_TEX_W - margin * 2;
  const cardH = 526;
  drawDarkCard(ctx, margin, cardY, cardW, cardH, 24, accent, false);

  // Bold accent header bar inside detail card
  fillRoundRect(ctx, margin + 2, cardY + 2, cardW - 4, 62, 22, hexToRgba(accent, 0.22));
  fillRoundRect(ctx, margin + 24, cardY + 2, cardW - 48, 4, 2, accent);
  drawTrackedLabel(ctx, 'KEY HIGHLIGHTS & STACK', margin + 36, cardY + 42, 25, accent, 0.08);

  // Up to 3 key highlight bullet points (23 px Inter 500, up to 2 lines per bullet)
  const lines =
    proj.features && proj.features.length > 0
      ? proj.features.slice(0, 3)
      : ['Source code, architecture, and documentation available on GitHub.'];

  ctx.font = '500 23px "Inter", sans-serif';
  let curY = cardY + 104;
  for (const feat of lines) {
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(margin + 46, curY - 8, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = PALETTE.screenDarkText;
    curY = drawWrappedText(ctx, feat, margin + 72, curY, cardW - 108, 30, 2) + 12;
  }

  // Tech stack chips (up to 6 confirmed technologies)
  const stackItems = (proj.stack && proj.stack.length > 0 ? proj.stack : proj.chips).slice(0, 6);
  let chipX = margin + 36;
  const chipY = cardY + 356;
  for (const item of stackItems) {
    const w = drawAccentChip(ctx, chipX, chipY, item, accent, 23, 15, 44);
    chipX += w + 12;
  }

  // Action buttons at bottom of card
  const btnY = cardY + cardH - 92;
  const ghBtnW = 340;
  const ghBtnH = 64;
  const ghBtnX = margin + 36;
  drawDarkNavButton(
    ctx,
    ghBtnX,
    btnY,
    ghBtnW,
    ghBtnH,
    'GitHub Repo ↗',
    accent,
    hoveredRegionId === 'proj-open-repo',
    true,
    28
  );
  regions.push(
    createHitRegion(
      'proj-open-repo',
      `Open ${proj.shortTitle} GitHub Repository`,
      ghBtnX,
      btnY,
      ghBtnW,
      ghBtnH,
      {
        type: 'external-link',
        url: proj.repoUrl,
        label: `${proj.shortTitle} GitHub`,
      }
    )
  );

  if (proj.liveUrl) {
    const liveX = ghBtnX + ghBtnW + 24;
    const liveW = 310;
    drawDarkNavButton(
      ctx,
      liveX,
      btnY,
      liveW,
      ghBtnH,
      'Live Demo ↗',
      accent,
      hoveredRegionId === 'proj-open-live',
      false,
      28
    );
    regions.push(
      createHitRegion(
        'proj-open-live',
        `Open ${proj.shortTitle} Live Demo`,
        liveX,
        btnY,
        liveW,
        ghBtnH,
        {
          type: 'external-link',
          url: proj.liveUrl,
          label: `${proj.shortTitle} Live Demo`,
        }
      )
    );
  }

  drawSubtleEdgeVignette(ctx, SCREEN_TEX_W, SCREEN_TEX_H);
  return regions;
}
