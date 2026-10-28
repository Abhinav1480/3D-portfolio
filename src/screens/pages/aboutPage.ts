import { PALETTE } from '../../config/palette';
import { PORTFOLIO_CONTENT } from '../../data/content';
import { createHitRegion, HitRegion, SCREEN_TEX_H, SCREEN_TEX_W } from '../hitRegions';
import {
  drawAccentChip,
  drawDarkCard,
  drawDarkNavButton,
  drawSubtleEdgeVignette,
  drawTrackedLabel,
  fillRoundRect,
  setupDarkPageCanvas,
} from './drawUtils';

export function drawAboutPage(
  ctx: CanvasRenderingContext2D,
  page: number,
  hoveredRegionId: string | null
): HitRegion[] {
  const regions: HitRegion[] = [];
  const accent = PALETTE.screenAccentAbout; // #FFB454
  const margin = 56;

  setupDarkPageCanvas(ctx, SCREEN_TEX_W, SCREEN_TEX_H);

  // Top-right page switch button
  const nextPage = page === 0 ? 1 : 0;
  const navBtnLabel = page === 0 ? 'Page 2: Education →' : '← Page 1: Bio';
  const navBtnW = 340;
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
    hoveredRegionId === 'about-page-toggle',
    false,
    26
  );

  regions.push(
    createHitRegion('about-page-toggle', navBtnLabel, navBtnX, navBtnY, navBtnW, navBtnH, {
      type: 'page',
      targetPage: nextPage,
    })
  );

  if (page === 0) {
    // Page 1: Bio & Engineering Focus (<= 7 body lines, left aligned, clear hierarchy)
    drawTrackedLabel(ctx, '01 / ABOUT · BIO', margin, margin + 36, 26, accent, 0.08);

    // Big Page Title (76 px Sora 700 in #FFF3DC) + Accent Line (#FFB454)
    ctx.font = '700 76px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(PORTFOLIO_CONTENT.profile.name, margin, 196);

    // Accent line directly under title
    fillRoundRect(ctx, margin, 218, 220, 6, 3, accent);

    // Subtitle (38 px Inter 500 in #D9CBEA)
    ctx.font = '500 38px "Inter", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkTextSecondary;
    ctx.fillText('Full-Stack Developer · UI & 3D Web Engineer', margin, 278);

    // Main Card (#33264A with 2 px #FFB454 border at 40% opacity)
    const cardY = 318;
    const cardW = SCREEN_TEX_W - margin * 2;
    const cardH = 490;
    drawDarkCard(ctx, margin, cardY, cardW, cardH, 24, accent, false);

    // 4 short body lines (32 px Inter 500, line-height 1.4 = 45 px)
    const bodyLines = [
      'Building interactive web products from responsive UI to backend APIs.',
      'Full-stack apps with React, Next.js, TypeScript, Node.js, and Express.',
      'Interactive 3D web experiences built with Three.js, R3F, and GSAP.',
      'Clean design systems, fast performance, and accessible user flows.',
    ];

    ctx.font = '500 32px "Inter", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    let lineY = cardY + 78;
    for (let i = 0; i < bodyLines.length; i++) {
      // Bullet dot in section accent
      ctx.fillStyle = accent;
      ctx.beginPath();
      ctx.arc(margin + 48, lineY - 11, 7, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = i === 0 ? PALETTE.screenDarkText : PALETTE.screenDarkTextSecondary;
      ctx.fillText(bodyLines[i], margin + 76, lineY);
      lineY += 68;
    }

    // Accent chips at bottom of card (>= 26 px JetBrains Mono 500, 18% accent fill, 2 px accent border)
    const chips = ['React & Next.js', 'TypeScript', 'Three.js / R3F', 'Node.js', 'Hyderabad, IN'];
    let chipX = margin + 42;
    const chipY = cardY + cardH - 92;
    for (const chip of chips) {
      const w = drawAccentChip(ctx, chipX, chipY, chip, accent, 26, 22, 52);
      chipX += w + 18;
    }
  } else {
    // Page 2: Education & Location (<= 7 body lines)
    drawTrackedLabel(ctx, '01 / ABOUT · EDUCATION', margin, margin + 36, 26, accent, 0.08);

    // Big Page Title (76 px Sora 700 in #FFF3DC) + Accent Line
    ctx.font = '700 76px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Education & Base', margin, 196);

    fillRoundRect(ctx, margin, 218, 260, 6, 3, accent);

    // Subtitle (38 px Inter 500 in #D9CBEA)
    ctx.font = '500 38px "Inter", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkTextSecondary;
    ctx.fillText('Vidya Jyothi Institute of Technology (VJIT) · Hyderabad', margin, 278);

    // Two side-by-side cards
    const gap = 32;
    const colW = (SCREEN_TEX_W - margin * 2 - gap) / 2;
    const cardY = 320;
    const cardH = 488;

    // Left Card: Degree
    drawDarkCard(ctx, margin, cardY, colW, cardH, 24, accent, false);
    drawTrackedLabel(ctx, 'DEGREE & PROGRAM', margin + 40, cardY + 64, 26, accent, 0.08);

    ctx.font = '700 38px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.fillText('B.Tech in CSE', margin + 40, cardY + 132);

    ctx.font = '500 32px "Inter", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkTextSecondary;
    ctx.fillText('Computer Science & Engineering', margin + 40, cardY + 198);
    ctx.fillText('Third-year undergraduate student', margin + 40, cardY + 252);

    drawAccentChip(ctx, margin + 40, cardY + cardH - 92, 'VJIT Hyderabad', accent, 26, 22, 52);

    // Right Card: Location & Availability
    const rightX = margin + colW + gap;
    drawDarkCard(ctx, rightX, cardY, colW, cardH, 24, accent, false);
    drawTrackedLabel(ctx, 'LOCATION & STATUS', rightX + 40, cardY + 64, 26, accent, 0.08);

    ctx.font = '700 38px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.fillText('Hyderabad, India', rightX + 40, cardY + 132);

    ctx.font = '500 32px "Inter", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkTextSecondary;
    ctx.fillText('Open to SWE & UI internships', rightX + 40, cardY + 198);
    ctx.fillText('Full-stack, frontend & 3D web', rightX + 40, cardY + 252);

    drawAccentChip(ctx, rightX + 40, cardY + cardH - 92, 'Available for Roles', accent, 26, 22, 52);
  }

  drawSubtleEdgeVignette(ctx, SCREEN_TEX_W, SCREEN_TEX_H);
  return regions;
}
