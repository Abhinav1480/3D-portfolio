import { PALETTE } from '../../config/palette';
import { PORTFOLIO_CONTENT, SkillCategory } from '../../data/content';
import { createHitRegion, HitRegion, SCREEN_TEX_H, SCREEN_TEX_W } from '../hitRegions';
import {
  drawAccentChip,
  drawDarkCard,
  drawDarkNavButton,
  drawSubtleEdgeVignette,
  drawTrackedLabel,
  setupDarkPageCanvas,
} from './drawUtils';

export function drawSkillsPage(
  ctx: CanvasRenderingContext2D,
  page: number,
  hoveredRegionId: string | null
): HitRegion[] {
  const regions: HitRegion[] = [];
  const accent = PALETTE.screenAccentSkills; // #7BE0A0
  const margin = 56;

  setupDarkPageCanvas(ctx, SCREEN_TEX_W, SCREEN_TEX_H);

  // Top-right page switch button
  const nextPage = page === 0 ? 1 : 0;
  const navBtnLabel = page === 0 ? 'Page 2: 3D & Tools →' : '← Page 1: Core Stack';
  const navBtnW = 350;
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
    hoveredRegionId === 'skills-page-toggle',
    false,
    26
  );

  regions.push(
    createHitRegion('skills-page-toggle', navBtnLabel, navBtnX, navBtnY, navBtnW, navBtnH, {
      type: 'page',
      targetPage: nextPage,
    })
  );

  const labelText = page === 0 ? '02 / SKILLS · CORE STACK' : '02 / SKILLS · 3D & TOOLING';
  drawTrackedLabel(ctx, labelText, margin, margin + 36, 26, accent, 0.08);

  // Page Title (76 px Sora 700 in #FFF3DC)
  ctx.font = '700 76px "Sora", sans-serif';
  ctx.fillStyle = PALETTE.screenDarkText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(page === 0 ? 'Technical Skills' : '3D Web & Tooling', margin, 196);

  // Category cards with accent-colored chips
  const cats: SkillCategory[] =
    page === 0
      ? PORTFOLIO_CONTENT.skills.slice(0, 3)
      : PORTFOLIO_CONTENT.skills.slice(3, 5);

  const cardStartY = 238;
  const cardGap = 24;
  const cardW = SCREEN_TEX_W - margin * 2;
  const cardH = page === 0 ? 174 : 265;

  cats.forEach((cat, idx) => {
    const cy = cardStartY + idx * (cardH + cardGap);
    drawDarkCard(ctx, margin, cy, cardW, cardH, 22, accent, false);

    // Category subtitle (38 px Sora 700 in #FFF3DC) + small uppercase tag on right
    ctx.font = '700 38px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.textAlign = 'left';
    ctx.fillText(cat.title, margin + 36, cy + 56);

    drawTrackedLabel(
      ctx,
      `${cat.items.length} SKILLS`,
       SCREEN_TEX_W - margin - 210,
      cy + 52,
      26,
      accent,
      0.08
    );

    // Accent chips row (26 px JetBrains Mono 500, 18% accent fill, accent text, 2 px accent border)
    let chipX = margin + 36;
    let chipY = cy + 88;
    for (const item of cat.items) {
      ctx.font = '500 26px "JetBrains Mono", monospace';
      const estW = Math.ceil(ctx.measureText(item).width) + 40;
      if (chipX + estW > margin + cardW - 32) {
        chipX = margin + 36;
        chipY += 64;
      }
      const drawnW = drawAccentChip(ctx, chipX, chipY, item, accent, 26, 20, 50);
      chipX += drawnW + 16;
    }
  });

  drawSubtleEdgeVignette(ctx, SCREEN_TEX_W, SCREEN_TEX_H);
  return regions;
}
