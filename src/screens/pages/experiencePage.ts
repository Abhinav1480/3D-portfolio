import { PALETTE } from '../../config/palette';
import { ExperienceItem, PORTFOLIO_CONTENT } from '../../data/content';
import { createHitRegion, HitRegion, SCREEN_TEX_H, SCREEN_TEX_W } from '../hitRegions';
import {
  drawDarkCard,
  drawDarkNavButton,
  drawSubtleEdgeVignette,
  drawTrackedLabel,
  drawWrappedText,
  hexToRgba,
  setupDarkPageCanvas,
} from './drawUtils';

export function drawExperiencePage(
  ctx: CanvasRenderingContext2D,
  page: number,
  hoveredRegionId: string | null
): HitRegion[] {
  const regions: HitRegion[] = [];
  const accent = PALETTE.screenAccentExperience; // #FF8FB1
  const margin = 56;

  setupDarkPageCanvas(ctx, SCREEN_TEX_W, SCREEN_TEX_H);

  // Top-right page switch button
  const nextPage = page === 0 ? 1 : 0;
  const navBtnLabel = page === 0 ? 'Page 2: Hackathons →' : '← Page 1: Experience';
  const navBtnW = 360;
  const navBtnH = 56;
  const navBtnX = SCREEN_TEX_W - margin - navBtnW;
  const navBtnY = margin;

  drawDarkNavButton(
    ctx,
    navBtnX,
    navBtnY,
    navBtnW,
    navBtnH,
    navBtnLabel,
    accent,
    hoveredRegionId === 'exp-page-toggle',
    false,
    26
  );

  regions.push(
    createHitRegion('exp-page-toggle', navBtnLabel, navBtnX, navBtnY, navBtnW, navBtnH, {
      type: 'page',
      targetPage: nextPage,
    })
  );

  const labelText =
    page === 0 ? '04 / EXPERIENCE · ROLES' : '04 / EXPERIENCE · HACKATHONS';
  drawTrackedLabel(ctx, labelText, margin, margin + 36, 26, accent, 0.08);

  // Big Page Title (76 px Sora 700 in #FFF3DC)
  ctx.font = '700 76px "Sora", sans-serif';
  ctx.fillStyle = PALETTE.screenDarkText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(page === 0 ? 'Experience & Roles' : 'Hackathons & Builds', margin, 196);

  const items: readonly ExperienceItem[] =
    page === 0 ? PORTFOLIO_CONTENT.experience.page1 : PORTFOLIO_CONTENT.experience.page2;

  const isCompact = items.length > 3;
  const startY = isCompact ? 220 : 238;
  const cardGap = isCompact ? 14 : 22;
  const timelineX = margin + 22;
  const cardX = margin + 68;
  const cardW = SCREEN_TEX_W - cardX - margin;
  const cardH = isCompact ? 140 : 176;
  const dotOffsetY = isCompact ? 46 : 56;

  // Vertical timeline spine with accent line
  ctx.strokeStyle = hexToRgba(accent, 0.45);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(timelineX, startY + dotOffsetY);
  ctx.lineTo(timelineX, startY + (items.length - 1) * (cardH + cardGap) + dotOffsetY);
  ctx.stroke();

  items.forEach((item, idx) => {
    const cy = startY + idx * (cardH + cardGap);
    const dotY = cy + dotOffsetY;

    // Accent dot on timeline
    ctx.fillStyle = PALETTE.screenDarkBg;
    ctx.beginPath();
    ctx.arc(timelineX, dotY, isCompact ? 14 : 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(timelineX, dotY, isCompact ? 10 : 11, 0, Math.PI * 2);
    ctx.fill();

    // Timeline Card (#33264A with 2 px #FF8FB1 border at 40% opacity)
    drawDarkCard(ctx, cardX, cy, cardW, cardH, isCompact ? 18 : 22, accent, false);

    // Organization label
    drawTrackedLabel(
      ctx,
      item.organization,
      cardX + 32,
      cy + (isCompact ? 32 : 44),
      isCompact ? 20 : 26,
      accent,
      0.07
    );

    // Role / Event Subtitle
    ctx.font = isCompact ? '700 32px "Sora", sans-serif' : '700 38px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(item.title, cardX + 32, cy + (isCompact ? 72 : 96));

    // Supporting summary text
    ctx.font = isCompact ? '500 22px "Inter", sans-serif' : '500 30px "Inter", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkTextSecondary;
    const textMaxW = isCompact
      ? cardW - 64
      : item.proofUrl
        ? cardW - 290
        : cardW - 64;
    drawWrappedText(
      ctx,
      item.summary,
      cardX + 32,
      cy + (isCompact ? 112 : 144),
      textMaxW,
      isCompact ? 26 : 42,
      isCompact ? 2 : 1
    );

    if (item.proofUrl) {
      const btnId = `exp-proof-${page}-${idx}`;
      const btnW = isCompact ? 196 : 220;
      const btnH = isCompact ? 46 : 54;
      const btnX = cardX + cardW - btnW - (isCompact ? 24 : 28);
      const btnY = isCompact ? cy + 20 : cy + (cardH - btnH) / 2;

      drawDarkNavButton(
        ctx,
        btnX,
        btnY,
        btnW,
        btnH,
        'GitHub ↗',
        accent,
        hoveredRegionId === btnId,
        false,
        isCompact ? 22 : 26
      );

      regions.push(
        createHitRegion(btnId, `Open ${item.title} Repository`, btnX, btnY, btnW, btnH, {
          type: 'external-link',
          url: item.proofUrl,
          label: item.title,
        })
      );
    }
  });

  drawSubtleEdgeVignette(ctx, SCREEN_TEX_W, SCREEN_TEX_H);
  return regions;
}
