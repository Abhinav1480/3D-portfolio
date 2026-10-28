// C2-Continuous Smooth Pacing Curve for 6 Tour Stops (0..5: Overview, About, Projects, Experience, Contact, Certificates)
// Maps scroll progress p in [0..1] to synchronized spline parameter u in [0..1].
// Each stop k in 0..5 sits at evenly spaced scroll progress p_k = (k / 5) * 0.90, eliminating any multi-second scroll stall.

export interface PacingConfig {
  stopSplineParams: readonly number[];
  modulationDepth: number;
}

export const FINAL_STOP_HOLD_START_PROGRESS = 0.9;
export const PHONE_FINAL_HOLD_START_PROGRESS = FINAL_STOP_HOLD_START_PROGRESS;

export class PacingCurve {
  private readonly stopArcParams: number[];
  private readonly stopScrollPositions: number[];
  private readonly lutU: Float64Array;
  private readonly lutSize = 2000;

  constructor(stopSplineParams: readonly number[], modulationDepth = 0.16) {
    this.stopArcParams = [...stopSplineParams];
    const segmentCount = Math.max(1, this.stopArcParams.length - 1); // 5 segments for 6 stops (0..5)

    // Evenly spaced scroll positions: [0, 0.18, 0.36, 0.54, 0.72, 0.90]
    this.stopScrollPositions = this.stopArcParams.map((_, idx) =>
      Number(((idx / segmentCount) * FINAL_STOP_HOLD_START_PROGRESS).toFixed(4))
    );

    this.lutU = new Float64Array(this.lutSize + 1);
    const activeSamples = Math.round(this.lutSize * FINAL_STOP_HOLD_START_PROGRESS);

    for (let i = 0; i <= activeSamples; i++) {
      const q = i / activeSamples; // normalized progress across [0..0.90]
      const scaledSeg = q * segmentCount;
      const segIdx = Math.min(segmentCount - 1, Math.floor(scaledSeg));
      const localT = Math.max(0, Math.min(1, scaledSeg - segIdx));

      // Smooth C2 sinusoidal ease within each segment [u0..u1]
      const easedLocal =
        localT - (modulationDepth / (2 * Math.PI)) * Math.sin(2 * Math.PI * localT);
      const u0 = this.stopArcParams[segIdx];
      const u1 = this.stopArcParams[segIdx + 1];
      this.lutU[i] = u0 + (u1 - u0) * Math.max(0, Math.min(1, easedLocal));
    }

    for (let i = activeSamples + 1; i <= this.lutSize; i++) {
      this.lutU[i] = 1.0;
    }
  }

  public getStopScrollPosition(stopIndex: number): number {
    return this.stopScrollPositions[
      Math.max(0, Math.min(this.stopScrollPositions.length - 1, stopIndex))
    ];
  }

  public getStopScrollPositions(): readonly number[] {
    return this.stopScrollPositions;
  }

  public evaluate(progress: number): number {
    if (progress <= 0) return 0;
    if (progress >= FINAL_STOP_HOLD_START_PROGRESS) return 1;
    const exact = progress * this.lutSize;
    const idx = Math.min(this.lutSize - 1, Math.floor(exact));
    const frac = exact - idx;
    return this.lutU[idx] * (1 - frac) + this.lutU[idx + 1] * frac;
  }

  public findNearestStopIndex(progress: number): number {
    if (progress >= FINAL_STOP_HOLD_START_PROGRESS) {
      return this.stopArcParams.length - 1;
    }
    const u = this.evaluate(progress);
    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < this.stopArcParams.length; i++) {
      const d = Math.abs(u - this.stopArcParams[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    return bestIdx;
  }
}
