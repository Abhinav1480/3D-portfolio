import gsap from 'gsap';

export interface ActiveFlightState {
  isFlying: boolean;
  tween: gsap.core.Tween | null;
}

/**
 * Section 7.7 Timed flights (~1.4s, power3.inOut) using the SAME stops and curve sampling.
 * A new flight kills the previous one and starts from the current pose.
 */
export class FlightController {
  private tween: gsap.core.Tween | null = null;
  public isFlying = false;

  public startFlight(
    fromProgress: number,
    toProgress: number,
    onUpdate: (progress: number) => void,
    onComplete?: () => void,
    reducedMotion = false
  ): void {
    this.kill();

    const duration = reducedMotion ? 0.25 : 1.4;
    const proxy = { p: fromProgress };
    this.isFlying = true;

    this.tween = gsap.to(proxy, {
      p: toProgress,
      duration,
      ease: 'power3.inOut',
      onUpdate: () => {
        onUpdate(proxy.p);
      },
      onComplete: () => {
        this.isFlying = false;
        this.tween = null;
        onUpdate(toProgress);
        onComplete?.();
      },
    });
  }

  public kill(): void {
    if (this.tween) {
      this.tween.kill();
      this.tween = null;
    }
    this.isFlying = false;
  }
}
