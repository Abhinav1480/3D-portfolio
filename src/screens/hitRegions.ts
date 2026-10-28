// Interactive UV Hit Regions for In-Screen Pages (Parts 1 & 3)
// Normalized UV coordinates (u in [0..1] left-to-right, v in [0..1] bottom-to-top in Three.js PlaneGeometry UV space)

export const SCREEN_TEX_W = 1536;
export const SCREEN_TEX_H = 864;

export const PHONE_TEX_W = 720;
export const PHONE_TEX_H = 1560;

export type HitActionType =
  | { type: 'page'; targetPage: number }
  | { type: 'external-link'; url: string; label: string }
  | { type: 'copy-text'; text: string; toastMessage: string };

export interface HitRegion {
  id: string;
  label: string;
  /** Canvas pixel coordinates (origin top-left) */
  rect: { x: number; y: number; w: number; h: number };
  /** Normalized UV bounds (u: 0..1 left-right, v: 0..1 bottom-top) */
  uvBounds: { uMin: number; uMax: number; vMin: number; vMax: number };
  action: HitActionType;
}

export function createHitRegion(
  id: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number,
  action: HitActionType,
  texW: number = SCREEN_TEX_W,
  texH: number = SCREEN_TEX_H
): HitRegion {
  const uMin = x / texW;
  const uMax = (x + w) / texW;
  // In Three.js PlaneGeometry, v=1 is top (y=0) and v=0 is bottom (y=texH)
  const vMax = 1 - y / texH;
  const vMin = 1 - (y + h) / texH;

  return {
    id,
    label,
    rect: { x, y, w, h },
    uvBounds: { uMin, uMax, vMin, vMax },
    action,
  };
}

export function findHitRegionAtUV(
  regions: readonly HitRegion[],
  u: number,
  v: number
): HitRegion | null {
  for (const r of regions) {
    if (
      u >= r.uvBounds.uMin &&
      u <= r.uvBounds.uMax &&
      v >= r.uvBounds.vMin &&
      v <= r.uvBounds.vMax
    ) {
      return r;
    }
  }
  return null;
}
