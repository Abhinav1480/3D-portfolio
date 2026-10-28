import { PALETTE } from '../../config/palette';
import { PORTFOLIO_CONTENT } from '../../data/content';
import { createHitRegion, HitRegion, PHONE_TEX_H, PHONE_TEX_W } from '../hitRegions';
import {
  drawSubtleEdgeVignette,
  drawToastPill,
  drawTrackedLabel,
  drawWrappedText,
  fillRoundRect,
  hexToRgba,
  setupDarkPageCanvas,
  strokeRoundRect,
} from './drawUtils';

/**
 * Portrait Phone Screen (1080x2340 physical / 720x1560 logical CanvasTexture) in the Dark UI Theme:
 * Displays Abhinav Nakka's contact summary on the 3D coffee-table phone screen and invites clicking
 * to open the full floating Contact Panel.
 */
export function drawContactPage(
  ctx: CanvasRenderingContext2D,
  hoveredRegionId: string | null,
  toastMessage: string | null
): HitRegion[] {
  const regions: HitRegion[] = [];
  const accent = PALETTE.screenAccentContact; // #C3A6FF
  const texW = PHONE_TEX_W; // 720 logical (scaled to 1080 physical)
  const texH = PHONE_TEX_H; // 1560 logical (scaled to 2340 physical)
  const marginX = 56;

  setupDarkPageCanvas(ctx, texW, texH);

  // Subtle phone top speaker / status bar pill
  fillRoundRect(ctx, (texW - 140) / 2, 34, 140, 10, 5, hexToRgba(accent, 0.35));

  // Status line "05 / CONTACT" in accent #C3A6FF
  drawTrackedLabel(ctx, '05 / CONTACT', marginX, 118, 26, accent, 0.08);

  // Name Heading "Abhinav Nakka" (Sora 700, 54 px, #FFF3DC)
  ctx.font = '700 54px "Sora", sans-serif';
  ctx.fillStyle = PALETTE.screenDarkText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(PORTFOLIO_CONTENT.contact.name, marginX, 194);

  // Role line
  ctx.font = '500 26px "Inter", sans-serif';
  ctx.fillStyle = PALETTE.screenDarkTextSecondary;
  drawWrappedText(
    ctx,
    PORTFOLIO_CONTENT.contact.role,
    marginX,
    244,
    texW - marginX * 2,
    36,
    2
  );

  // Accent bar
  fillRoundRect(ctx, marginX, 304, 160, 6, 3, accent);

  const btnW = texW - marginX * 2;
  const btnH = 104;
  let curY = 344;

  const drawLargePhoneButton = (
    id: string,
    title: string,
    subHandle: string,
    y: number
  ) => {
    const isHovered = hoveredRegionId === id;
    fillRoundRect(
      ctx,
      marginX,
      y,
      btnW,
      btnH,
      22,
      isHovered ? hexToRgba(accent, 0.24) : PALETTE.screenDarkCardBg
    );
    strokeRoundRect(ctx, marginX, y, btnW, btnH, 22, accent, isHovered ? 3 : 2);

    ctx.font = '700 32px "Sora", sans-serif';
    ctx.fillStyle = PALETTE.screenDarkText;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(title, marginX + 32, y + 46);

    ctx.font = '500 24px "JetBrains Mono", monospace';
    ctx.fillStyle = PALETTE.screenDarkTextSecondary;
    ctx.fillText(subHandle, marginX + 32, y + 82);

    ctx.font = '700 32px "Sora", sans-serif';
    ctx.fillStyle = accent;
    ctx.textAlign = 'right';
    ctx.fillText('↗', marginX + btnW - 32, y + 62);
    ctx.textAlign = 'left';
  };

  // 1. LinkedIn
  drawLargePhoneButton(
    'contact-open-linkedin',
    'LinkedIn',
    'linkedin.com/in/abhinav-nakka-5133b1356/',
    curY
  );
  regions.push(
    createHitRegion(
      'contact-open-linkedin',
      'Open LinkedIn Profile',
      marginX,
      curY,
      btnW,
      btnH,
      {
        type: 'external-link',
        url: PORTFOLIO_CONTENT.contact.linkedin.url,
        label: 'LinkedIn',
      },
      texW,
      texH
    )
  );
  curY += btnH + 22;

  // 2. GitHub
  drawLargePhoneButton(
    'contact-open-github',
    'GitHub',
    PORTFOLIO_CONTENT.contact.github.handle,
    curY
  );
  regions.push(
    createHitRegion(
      'contact-open-github',
      'Open GitHub Profile',
      marginX,
      curY,
      btnW,
      btnH,
      {
        type: 'external-link',
        url: PORTFOLIO_CONTENT.contact.github.url,
        label: 'GitHub',
      },
      texW,
      texH
    )
  );
  curY += btnH + 22;

  // 3. Phone / WhatsApp
  drawLargePhoneButton(
    'contact-open-whatsapp',
    'Phone / WhatsApp',
    PORTFOLIO_CONTENT.contact.phone.display,
    curY
  );
  regions.push(
    createHitRegion(
      'contact-open-whatsapp',
      'Open WhatsApp Chat',
      marginX,
      curY,
      btnW,
      btnH,
      {
        type: 'external-link',
        url: PORTFOLIO_CONTENT.contact.phone.url,
        label: 'Phone / WhatsApp',
      },
      texW,
      texH
    )
  );
  curY += btnH + 22;

  // 4. Email
  drawLargePhoneButton(
    'contact-open-email',
    'Email',
    PORTFOLIO_CONTENT.contact.email.address,
    curY
  );
  regions.push(
    createHitRegion(
      'contact-open-email',
      `Email ${PORTFOLIO_CONTENT.contact.email.address}`,
      marginX,
      curY,
      btnW,
      btnH,
      {
        type: 'external-link',
        url: PORTFOLIO_CONTENT.contact.email.url,
        label: 'Email',
      },
      texW,
      texH
    )
  );
  curY += btnH + 28;

  // Subheading invitation card at bottom of phone screen
  const subCardH = 148;
  fillRoundRect(ctx, marginX, curY, btnW, subCardH, 22, PALETTE.screenDarkCardBg);
  strokeRoundRect(ctx, marginX, curY, btnW, subCardH, 22, hexToRgba(accent, 0.4), 2);

  ctx.font = '500 25px "Inter", sans-serif';
  ctx.fillStyle = PALETTE.screenDarkTextSecondary;
  drawWrappedText(
    ctx,
    `“${PORTFOLIO_CONTENT.contact.subtitle}”`,
    marginX + 28,
    curY + 52,
    btnW - 56,
    36,
    3
  );

  if (toastMessage) {
    drawToastPill(ctx, toastMessage, texW, texH, accent);
  }

  drawSubtleEdgeVignette(ctx, texW, texH);
  return regions;
}
