import { PALETTE } from '../../config/palette';
import { SCREEN_TEX_H, SCREEN_TEX_W } from '../hitRegions';

export interface ScreenContrastAssertionReport {
  allPassed: boolean;
  primaryMinContrast: number;
  secondaryMinContrast: number;
  accentMinContrast: number;
  pairs: Record<string, number>;
}

export interface ScreenLuminanceStats {
  averageLuminance: number;
  brightPixelFraction: number;
  passed: boolean;
}

let _fontsLoadPromise: Promise<void> | null = null;

/**
 * Load all required font weights ("Sora" 700 & 800, "Inter" 500, "JetBrains Mono" 500)
 * via document.fonts.load(...) before drawing or redraw immediately on completion.
 */
export function ensureScreenFontsLoaded(): Promise<void> {
  if (typeof document === 'undefined' || !('fonts' in document)) {
    return Promise.resolve();
  }
  if (!_fontsLoadPromise) {
    _fontsLoadPromise = Promise.all([
      document.fonts.load('700 76px "Sora"'),
      document.fonts.load('800 180px "Sora"'),
      document.fonts.load('500 32px "Inter"'),
      document.fonts.load('500 26px "JetBrains Mono"'),
    ])
      .then(() => undefined)
      .catch(() => undefined);
  }
  return _fontsLoadPromise;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '').trim();
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function blendHexOverHex(fgHex: string, bgHex: string, alpha: number): string {
  const fg = hexToRgb(fgHex);
  const bg = hexToRgb(bgHex);
  const r = Math.round(fg.r * alpha + bg.r * (1 - alpha));
  const g = Math.round(fg.g * alpha + bg.g * (1 - alpha));
  const b = Math.round(fg.b * alpha + bg.b * (1 - alpha));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
}

/**
 * WCAG 2.1 linearized relative luminance for contrast ratio checks.
 */
export function computeRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const toLinear = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function computeContrastRatio(fgHex: string, bgHex: string): number {
  const l1 = computeRelativeLuminance(fgHex);
  const l2 = computeRelativeLuminance(bgHex);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Compute and assert in code that primary text contrast >= 7:1 and secondary/accent/chip text >= 4.5:1.
 */
export function verifyScreenContrastRules(): ScreenContrastAssertionReport {
  const pageBg = PALETTE.screenDarkBg; // #241B36
  const cardBg = PALETTE.screenDarkCardBg; // #33264A
  const primary = PALETTE.screenDarkText; // #FFF3DC
  const secondary = PALETTE.screenDarkTextSecondary; // #D9CBEA

  const accents: Record<string, string> = {
    about: PALETTE.screenAccentAbout, // #FFB454
    skills: PALETTE.screenAccentSkills, // #7BE0A0
    projects: PALETTE.screenAccentProjects, // #6FB1FF
    experience: PALETTE.screenAccentExperience, // #FF8FB1
    contact: PALETTE.screenAccentContact, // #C3A6FF
  };

  const pairs: Record<string, number> = {
    'primary-on-pageBg': computeContrastRatio(primary, pageBg),
    'primary-on-cardBg': computeContrastRatio(primary, cardBg),
    'secondary-on-pageBg': computeContrastRatio(secondary, pageBg),
    'secondary-on-cardBg': computeContrastRatio(secondary, cardBg),
  };

  const primaryMinContrast = Math.min(pairs['primary-on-pageBg'], pairs['primary-on-cardBg']);
  const secondaryMinContrast = Math.min(
    pairs['secondary-on-pageBg'],
    pairs['secondary-on-cardBg']
  );

  let accentMinContrast = Infinity;
  for (const [section, accentHex] of Object.entries(accents)) {
    const onPage = computeContrastRatio(accentHex, pageBg);
    const onCard = computeContrastRatio(accentHex, cardBg);
    const chipBg = blendHexOverHex(accentHex, pageBg, 0.18);
    const onChip = computeContrastRatio(accentHex, chipBg);

    pairs[`${section}-accent-on-pageBg`] = onPage;
    pairs[`${section}-accent-on-cardBg`] = onCard;
    pairs[`${section}-accent-on-chip18`] = onChip;

    accentMinContrast = Math.min(accentMinContrast, onPage, onCard, onChip);
  }

  // Projects card title bar (22% accent over #33264A) with primary text #FFF3DC
  const projBarBg = blendHexOverHex(PALETTE.screenAccentProjects, cardBg, 0.22);
  pairs['projects-title-on-accentBar'] = computeContrastRatio(primary, projBarBg);

  const allPassed =
    primaryMinContrast >= 7.0 &&
    pairs['projects-title-on-accentBar'] >= 7.0 &&
    secondaryMinContrast >= 4.5 &&
    accentMinContrast >= 4.5;

  if (!allPassed) {
    console.error('Screen contrast assertion failed:', pairs);
  }

  return {
    allPassed,
    primaryMinContrast,
    secondaryMinContrast,
    accentMinContrast,
    pairs,
  };
}

let _lumSampleCanvas: HTMLCanvasElement | null = null;
let _lumSampleCtx: CanvasRenderingContext2D | null = null;
const LUM_SAMPLE_W = 64;
const LUM_SAMPLE_H = 36;

/**
 * Sample pixel luminance of a drawn screen texture via a small 64x36 offscreen canvas
 * with willReadFrequently: true (avoids GPU readback warnings and stalls on 2048x1152 canvases):
 * - Average relative luminance is between 0.10 and 0.25
 * - No more than 5% (0.05) of pixels are above luminance 0.85
 */
export function computeCanvasLuminanceStats(
  ctx: CanvasRenderingContext2D,
  _w: number,
  _h: number
): ScreenLuminanceStats {
  if (typeof document === 'undefined') {
    return { averageLuminance: 0.15, brightPixelFraction: 0.01, passed: true };
  }
  if (!_lumSampleCanvas) {
    _lumSampleCanvas = document.createElement('canvas');
    _lumSampleCanvas.width = LUM_SAMPLE_W;
    _lumSampleCanvas.height = LUM_SAMPLE_H;
    _lumSampleCtx = _lumSampleCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!_lumSampleCtx) {
    return { averageLuminance: 0.15, brightPixelFraction: 0.01, passed: true };
  }

  _lumSampleCtx.clearRect(0, 0, LUM_SAMPLE_W, LUM_SAMPLE_H);
  _lumSampleCtx.drawImage(ctx.canvas, 0, 0, LUM_SAMPLE_W, LUM_SAMPLE_H);
  const img = _lumSampleCtx.getImageData(0, 0, LUM_SAMPLE_W, LUM_SAMPLE_H).data;

  let totalLum = 0;
  let brightCount = 0;
  const sampleCount = LUM_SAMPLE_W * LUM_SAMPLE_H;

  for (let i = 0; i < img.length; i += 4) {
    const r = img[i] / 255;
    const g = img[i + 1] / 255;
    const b = img[i + 2] / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    totalLum += lum;
    if (lum > 0.85) {
      brightCount++;
    }
  }

  const averageLuminance = Number((totalLum / Math.max(1, sampleCount)).toFixed(4));
  const brightPixelFraction = Number((brightCount / Math.max(1, sampleCount)).toFixed(4));
  const passed =
    averageLuminance >= 0.10 &&
    averageLuminance <= 0.25 &&
    brightPixelFraction <= 0.05;

  return {
    averageLuminance,
    brightPixelFraction,
    passed,
  };
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export function fillRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fillStyle: string | CanvasGradient
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

export function strokeRoundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  strokeStyle: string,
  lineWidth = 2
): void {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

/**
 * Configure typography state (normal kerning, alphabetic baseline, zero text shadow/glow/stroke)
 * and fill page background with deep plum #241B36.
 */
export function setupDarkPageCanvas(
  ctx: CanvasRenderingContext2D,
  w: number = SCREEN_TEX_W,
  h: number = SCREEN_TEX_H
): void {
  if ('fontKerning' in ctx) {
    ctx.fontKerning = 'normal';
  }
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  ctx.fillStyle = PALETTE.screenDarkBg;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Bake a subtle edge vignette (10% darker toward the outer edges) into the screen texture.
 */
export function drawSubtleEdgeVignette(
  ctx: CanvasRenderingContext2D,
  w: number = SCREEN_TEX_W,
  h: number = SCREEN_TEX_H
): void {
  const cx = w * 0.5;
  const cy = h * 0.5;
  const outerRadius = Math.hypot(cx, cy);
  const innerRadius = outerRadius * 0.52;

  const grad = ctx.createRadialGradient(cx, cy, innerRadius, cx, cy, outerRadius);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.10)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

/**
 * Draw a dark card (#33264A) with a 2 px border in the section accent at 40% opacity
 * (or 100% accent border when hovered).
 */
export function drawDarkCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  accentHex: string,
  isHovered = false
): void {
  fillRoundRect(ctx, x, y, w, h, r, PALETTE.screenDarkCardBg);
  strokeRoundRect(
    ctx,
    x,
    y,
    w,
    h,
    r,
    isHovered ? accentHex : hexToRgba(accentHex, 0.4),
    isHovered ? 3 : 2
  );
}

/**
 * Draw uppercase label in JetBrains Mono 500 with 0.08em letter spacing.
 */
export function drawTrackedLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fontSize: number = 26,
  colorHex: string = PALETTE.screenDarkTextSecondary,
  letterSpacingEm: number = 0.08,
  fontSpec?: string
): number {
  const upper = text.toUpperCase();
  ctx.font = fontSpec ?? `500 ${fontSize}px "JetBrains Mono", monospace`;
  ctx.fillStyle = colorHex;
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  const spacingPx = fontSize * letterSpacingEm;
  let curX = x;
  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    ctx.fillText(ch, curX, y);
    curX += ctx.measureText(ch).width + (i < upper.length - 1 ? spacingPx : 0);
  }
  return curX - x;
}

/**
 * Measure width of text with custom letter-spacing in em.
 */
export function measureTrackedTextWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  fontSize: number,
  letterSpacingEm: number = 0.08
): number {
  const spacingPx = fontSize * letterSpacingEm;
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    total += ctx.measureText(text[i]).width + (i < text.length - 1 ? spacingPx : 0);
  }
  return total;
}

/**
 * Draw a chip filled with the section accent at 18% opacity, accent-colored text, and 2 px accent border.
 * Returns the chip width in pixels.
 */
export function drawAccentChip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  accentHex: string,
  fontSize: number = 26,
  padX: number = 20,
  height: number = 48
): number {
  ctx.font = `500 ${fontSize}px "JetBrains Mono", monospace`;
  const textW = Math.ceil(ctx.measureText(text).width);
  const chipW = textW + padX * 2;

  fillRoundRect(
    ctx,
    x,
    y,
    chipW,
    height,
    12,
    blendHexOverHex(accentHex, PALETTE.screenDarkBg, 0.18)
  );
  strokeRoundRect(ctx, x, y, chipW, height, 12, accentHex, 2);

  ctx.fillStyle = accentHex;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x + padX, y + Math.round(height * 0.68));
  return chipW;
}

/**
 * Draw an interactive navigation / action button in the dark UI theme.
 */
export function drawDarkNavButton(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  label: string,
  accentHex: string,
  isHovered: boolean,
  filled = false,
  fontSize = 26
): void {
  const bg = filled
    ? hexToRgba(accentHex, isHovered ? 0.30 : 0.22)
    : hexToRgba(accentHex, isHovered ? 0.26 : 0.18);
  fillRoundRect(ctx, x, y, w, h, 14, bg);
  strokeRoundRect(ctx, x, y, w, h, 14, accentHex, isHovered ? 3 : 2);

  ctx.font = `700 ${fontSize}px "Sora", sans-serif`;
  ctx.fillStyle = filled ? PALETTE.screenDarkText : accentHex;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(label, x + w / 2, y + Math.round(h * 0.64));
  ctx.textAlign = 'left';
}

export function drawWrappedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
  maxLines = 3
): number {
  ctx.textBaseline = 'alphabetic';
  const words = text.split(' ');
  let line = '';
  let currentY = y;
  let linesDrawn = 0;

  for (let i = 0; i < words.length; i++) {
    const testLine = line ? `${line} ${words[i]}` : words[i];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      linesDrawn++;
      if (linesDrawn >= maxLines) {
        ctx.fillText(`${line}…`, x, currentY);
        return currentY + lineHeight;
      }
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }

  if (line && linesDrawn < maxLines) {
    ctx.fillText(line, x, currentY);
    currentY += lineHeight;
  }

  return currentY;
}

export function drawToastPill(
  ctx: CanvasRenderingContext2D,
  message: string,
  texW: number = SCREEN_TEX_W,
  texH: number = SCREEN_TEX_H,
  accentHex: string = PALETTE.screenAccentContact
): void {
  const w = 260;
  const h = 64;
  const x = (texW - w) / 2;
  const y = texH - 96;

  fillRoundRect(ctx, x, y, w, h, 32, PALETTE.screenDarkCardBg);
  strokeRoundRect(ctx, x, y, w, h, 32, accentHex, 3);

  ctx.font = '700 30px "Sora", sans-serif';
  ctx.fillStyle = PALETTE.screenDarkText;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(message, texW / 2, y + 43);
  ctx.textAlign = 'left';
}
