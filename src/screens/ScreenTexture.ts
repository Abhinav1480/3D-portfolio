import * as THREE from 'three';
import { ScreenId } from '../config/layout';
import { PALETTE } from '../config/palette';
import { PORTFOLIO_CONTENT } from '../data/content';
import { HitRegion, PHONE_TEX_H, PHONE_TEX_W, SCREEN_TEX_H, SCREEN_TEX_W } from './hitRegions';
import { drawAboutPage } from './pages/aboutPage';
import { drawContactPage } from './pages/contactPage';
import {
  computeCanvasLuminanceStats,
  drawSubtleEdgeVignette,
  ensureScreenFontsLoaded,
  measureTrackedTextWidth,
  ScreenLuminanceStats,
  setupDarkPageCanvas,
  verifyScreenContrastRules,
} from './pages/drawUtils';
import { drawExperiencePage } from './pages/experiencePage';
import { drawProjectsPage } from './pages/projectsPage';
import { drawSkillsPage } from './pages/skillsPage';

// Task 3: Physical texture resolutions (>= 1024px wide for phone, 2048px wide for monitors/laptop/TV)
export const PHYSICAL_SCREEN_TEX_W = 2048;
export const PHYSICAL_SCREEN_TEX_H = 1152;
export const PHYSICAL_PHONE_TEX_W = 1080;
export const PHYSICAL_PHONE_TEX_H = 2340;

// Assert WCAG contrast ratios (>= 7:1 primary, >= 4.5:1 secondary/accent) once at module init
export const SCREEN_CONTRAST_REPORT = verifyScreenContrastRules();
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).__PORTFOLIO_CONTRAST__ = SCREEN_CONTRAST_REPORT;
}

/**
 * Wrap 2D canvas context text methods so every fillText and strokeText call
 * rounds x and y to integer logical pixel coordinates to eliminate subpixel blur.
 */
function enforceIntegerPixelTextDrawing(ctx: CanvasRenderingContext2D): void {
  const origFillText = ctx.fillText.bind(ctx);
  ctx.fillText = (text: string, x: number, y: number, maxWidth?: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (maxWidth !== undefined) {
      origFillText(text, rx, ry, Math.round(maxWidth));
    } else {
      origFillText(text, rx, ry);
    }
  };

  const origStrokeText = ctx.strokeText.bind(ctx);
  ctx.strokeText = (text: string, x: number, y: number, maxWidth?: number) => {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (maxWidth !== undefined) {
      origStrokeText(text, rx, ry, Math.round(maxWidth));
    } else {
      origStrokeText(text, rx, ry);
    }
  };
}

export class ScreenTextureController {
  public readonly screenId: ScreenId;
  public readonly contentId: ScreenId;
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly texture: THREE.CanvasTexture;
  public readonly texWidth: number;
  public readonly texHeight: number;
  public readonly logicalWidth: number;
  public readonly logicalHeight: number;
  public hitRegions: HitRegion[] = [];
  public luminanceStats: ScreenLuminanceStats = {
    averageLuminance: 0.15,
    brightPixelFraction: 0.02,
    passed: true,
  };

  private page = 0;
  private hoveredRegionId: string | null = null;
  private toastMessage: string | null = null;
  private toastTimeout: number | null = null;
  private wakeProgress = 1; // 1 = fully visible

  constructor(screenId: ScreenId) {
    this.screenId = screenId;
    this.contentId = screenId;

    // Landscape 2048x1152 physical (1536x864 logical) for Laptop & 3 Monitors;
    // Portrait 1080x2340 physical (720x1560 logical) for Smartphone ('contact')
    const isPortraitPhone = screenId === 'contact';
    this.texWidth = isPortraitPhone ? PHYSICAL_PHONE_TEX_W : PHYSICAL_SCREEN_TEX_W;
    this.texHeight = isPortraitPhone ? PHYSICAL_PHONE_TEX_H : PHYSICAL_SCREEN_TEX_H;
    this.logicalWidth = isPortraitPhone ? PHONE_TEX_W : SCREEN_TEX_W;
    this.logicalHeight = isPortraitPhone ? PHONE_TEX_H : SCREEN_TEX_H;

    this.canvas = document.createElement('canvas');
    this.canvas.width = this.texWidth;
    this.canvas.height = this.texHeight;

    const context = this.canvas.getContext('2d');
    if (!context) {
      throw new Error(`Failed to create 2D context for screen ${screenId}`);
    }
    enforceIntegerPixelTextDrawing(context);
    this.ctx = context;

    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.name = isPortraitPhone
      ? `phone-contact-${this.texWidth}x${this.texHeight}`
      : `screen-${screenId}-${this.texWidth}x${this.texHeight}`;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 16;
    this.texture.minFilter = THREE.LinearMipmapLinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = true;
    this.texture.userData = {
      category: isPortraitPhone ? 'phone' : 'screen',
      screenId,
      integerPixelText: true,
    };

    const fontsReadyNow =
      typeof document !== 'undefined' &&
      'fonts' in document &&
      document.fonts.check('700 76px "Sora"') &&
      document.fonts.check('500 32px "Inter"');

    if (fontsReadyNow) {
      this.redraw();
    } else {
      this.redraw();
      ensureScreenFontsLoaded().then(() => {
        this.redraw();
      });
    }
  }

  public syncMaxAnisotropy(rendererMaxAnisotropy: number): void {
    const targetAniso = Math.min(16, Math.max(1, rendererMaxAnisotropy));
    if (this.texture.anisotropy !== targetAniso) {
      this.texture.anisotropy = targetAniso;
      this.texture.needsUpdate = true;
    }
  }

  public getPage(): number {
    return this.page;
  }

  public getTotalVisiblePages(): number {
    switch (this.screenId) {
      case 'about':
        return 2;
      case 'skills':
        return 2;
      case 'projects':
        return 5; // Page 0 Grid + Pages 1..4 Project Details
      case 'experience':
        return 2;
      case 'contact':
        return 1;
    }
  }

  public setPage(nextPage: number): void {
    const maxPage = this.screenId === 'projects' ? 4 : this.getTotalVisiblePages() - 1;
    const clamped = Math.max(0, Math.min(maxPage, nextPage));
    if (clamped !== this.page) {
      this.page = clamped;
      this.hoveredRegionId = null;
      this.redraw();
    }
  }

  public setHoveredRegion(regionId: string | null): void {
    if (this.hoveredRegionId !== regionId) {
      this.hoveredRegionId = regionId;
      this.redraw();
    }
  }

  public showToast(msg: string, durationMs = 1500): void {
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
    }
    this.toastMessage = msg;
    this.redraw();
    this.toastTimeout = window.setTimeout(() => {
      this.toastMessage = null;
      this.toastTimeout = null;
      this.redraw();
    }, durationMs);
  }

  public triggerWakeReveal(reducedMotion: boolean): void {
    if (reducedMotion) {
      this.wakeProgress = 1;
      return;
    }
    this.wakeProgress = 1;
    this.redraw();
  }

  public redraw(): void {
    const {
      ctx,
      page,
      hoveredRegionId,
      toastMessage,
      texWidth,
      texHeight,
      logicalWidth,
      logicalHeight,
    } = this;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, texWidth, texHeight);
    ctx.scale(texWidth / logicalWidth, texHeight / logicalHeight);

    switch (this.screenId) {
      case 'about':
        this.hitRegions = drawAboutPage(ctx, page, hoveredRegionId);
        break;
      case 'skills':
        this.hitRegions = drawSkillsPage(ctx, page, hoveredRegionId);
        break;
      case 'projects':
        this.hitRegions = drawProjectsPage(ctx, page, hoveredRegionId);
        break;
      case 'experience':
        this.hitRegions = drawExperiencePage(ctx, page, hoveredRegionId);
        break;
      case 'contact':
        this.hitRegions = drawContactPage(ctx, hoveredRegionId, toastMessage);
        break;
    }

    if (this.wakeProgress < 1) {
      ctx.fillStyle = `rgba(36, 27, 54, ${(1 - this.wakeProgress) * 0.25})`;
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    }

    ctx.restore();

    // Compute texture luminance stats on base page redraws (skip on hover/toast redraws)
    if (hoveredRegionId === null && toastMessage === null) {
      this.luminanceStats = computeCanvasLuminanceStats(ctx, texWidth, texHeight);
      if (typeof window !== 'undefined') {
        const store = ((window as unknown as Record<string, unknown>).__PORTFOLIO_LUMINANCE__ ??=
          {}) as Record<string, ScreenLuminanceStats>;
        store[this.screenId] = this.luminanceStats;
      }
    }

    this.texture.needsUpdate = true;
  }

  public dispose(): void {
    if (this.toastTimeout !== null) {
      window.clearTimeout(this.toastTimeout);
    }
    this.texture.dispose();
  }
}

/**
 * Static TV texture showing ONLY "ABHINAV" at 2048x1152 physical resolution
 */
export function createStaticTvTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = PHYSICAL_SCREEN_TEX_W;
  canvas.height = PHYSICAL_SCREEN_TEX_H;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    enforceIntegerPixelTextDrawing(ctx);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.name = `screen-tv-${PHYSICAL_SCREEN_TEX_W}x${PHYSICAL_SCREEN_TEX_H}`;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 16;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.userData = { category: 'screen', screenId: 'tv', integerPixelText: true };

  const drawTv = () => {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, PHYSICAL_SCREEN_TEX_W, PHYSICAL_SCREEN_TEX_H);
    ctx.scale(PHYSICAL_SCREEN_TEX_W / SCREEN_TEX_W, PHYSICAL_SCREEN_TEX_H / SCREEN_TEX_H);

    setupDarkPageCanvas(ctx, SCREEN_TEX_W, SCREEN_TEX_H);

    const text = PORTFOLIO_CONTENT.profile.uppercaseName; // "ABHINAV"
    const targetWidthPx = SCREEN_TEX_W * 0.72;
    const letterSpacingEm = 0.08;

    const refSize = 200;
    ctx.font = `800 ${refSize}px "Sora", sans-serif`;
    const refWidth = measureTrackedTextWidth(ctx, text, refSize, letterSpacingEm);
    const fontSize = Math.round((refSize * targetWidthPx) / Math.max(1, refWidth));

    ctx.font = `800 ${fontSize}px "Sora", sans-serif`;
    const exactWidth = measureTrackedTextWidth(ctx, text, fontSize, letterSpacingEm);

    const metrics = ctx.measureText(text);
    const capHeight =
      metrics.actualBoundingBoxAscent && metrics.actualBoundingBoxAscent > 0
        ? metrics.actualBoundingBoxAscent
        : fontSize * 0.72;
    const baselineY = Math.round(SCREEN_TEX_H * 0.5 + capHeight * 0.5);
    let curX = Math.round((SCREEN_TEX_W - exactWidth) * 0.5);
    const spacingPx = fontSize * letterSpacingEm;

    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      ctx.fillText(ch, Math.round(curX), baselineY);
      curX += ctx.measureText(ch).width + (i < text.length - 1 ? spacingPx : 0);
    }

    drawSubtleEdgeVignette(ctx, SCREEN_TEX_W, SCREEN_TEX_H);
    ctx.restore();

    const tvStats = computeCanvasLuminanceStats(ctx, PHYSICAL_SCREEN_TEX_W, PHYSICAL_SCREEN_TEX_H);
    if (typeof window !== 'undefined') {
      const store = ((window as unknown as Record<string, unknown>).__PORTFOLIO_LUMINANCE__ ??=
        {}) as Record<string, ScreenLuminanceStats>;
      store.tv = tvStats;
    }

    tex.needsUpdate = true;
  };

  drawTv();
  ensureScreenFontsLoaded().then(drawTv);

  return tex;
}
