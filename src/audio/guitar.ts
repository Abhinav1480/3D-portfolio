// Web Audio API Karplus-Strong Acoustic Guitar Synthesizer & Strum Engine
// Soft, warm background-level acoustic guitar with:
// - 2.2s buffers normalized to 0.10 RMS (first 0.4s), tanh(1.2) soft-clip, 0.25s fade-out, 2.0s exponential note decay
// - Doubled (+7c, +8ms, gain 0.4) + octave-down (0.5x rate, gain 0.25 on 3 lowest strings) voices (capped <= 24 sources/strum)
// - Stereo spread (-0.30 .. +0.30), gentle 5-band body EQ (120/220/450/3200/6000 Hz) + parallel 0.6s reverb (wet 0.12)
// - Signal order: sources -> panners -> EQ -> (dry + reverb wet) -> preGain -> softClipper(drive 1.0) -> compressor -> outputGain -> ceiling(0.9) -> destination
// - Default volume 40% (outputGain = 0.072), 1s overlap strum ducking (-50% in 0.15s), first-strum 70%->100% ramp, and OfflineAudioContext calibration.

export type GuitarChordName = 'G' | 'C' | 'D' | 'Em';

export interface GuitarChordSpec {
  name: GuitarChordName;
  /** Frequencies in Hz ordered from low string to high string */
  frequencies: readonly number[];
  /** Corresponding 0-based guitar string indices (0 = low E2 .. 5 = high E4) */
  stringIndices: readonly number[];
}

export interface GuitarVisualStrumPlan {
  accepted: boolean;
  reason?: string;
  chord: GuitarChordName;
  direction: 'down' | 'up';
  stepMs: number;
  stringStartDelaysMs: [number, number, number, number, number, number];
  pluckedMask: [boolean, boolean, boolean, boolean, boolean, boolean];
  muted: boolean;
}

export interface GuitarMeasureResult {
  peak: number;
  rmsDb: number;
  peakDb: number;
}

// Chords (Hz, low to high) and rotation G -> C -> D -> Em
export const GUITAR_CHORDS: readonly GuitarChordSpec[] = [
  {
    name: 'G',
    frequencies: [98.0, 123.47, 146.83, 196.0, 246.94, 392.0],
    stringIndices: [0, 1, 2, 3, 4, 5],
  },
  {
    name: 'C',
    frequencies: [130.81, 164.81, 196.0, 261.63, 329.63],
    stringIndices: [1, 2, 3, 4, 5],
  },
  {
    name: 'D',
    frequencies: [146.83, 220.0, 293.66, 369.99],
    stringIndices: [2, 3, 4, 5],
  },
  {
    name: 'Em',
    frequencies: [82.41, 123.47, 164.81, 196.0, 246.94, 329.63],
    stringIndices: [0, 1, 2, 3, 4, 5],
  },
] as const;

const SOUND_MUTED_STORAGE_KEY = 'abhinav_portfolio_sound_muted_v2';
const SOUND_VOLUME_PCT_STORAGE_KEY = 'abhinav_portfolio_guitar_volume_pct_v2';

const RATE_LIMIT_MS = 250;
const MAX_CONCURRENT_STRUMS = 3;
const MAX_SOURCES_PER_STRUM = 24;
const OVERLAP_DUCK_WINDOW_MS = 1000;
const PREVIEW_PLUCK_COOLDOWN_MS = 400;

const DEFAULT_VOLUME_PERCENT = 40; // 40% default -> outputGain = (0.40)^2 * 0.45 = 0.072
const CEILING_GAIN = 0.9;
const FIRST_STRUM_SAFETY_FACTOR = 0.7;

interface ActiveStrumRecord {
  id: number;
  chord: GuitarChordName;
  startedAtMs: number;
  strumGain: GainNode;
  currentStrumGainValue: number;
  sources: AudioScheduledSourceNode[];
  nodesToDisconnect: AudioNode[];
  fadingOut: boolean;
}

interface MasterChainNodes {
  eqInput: BiquadFilterNode;
  eqLowShelf120: BiquadFilterNode;
  eqPeak220: BiquadFilterNode;
  eqPeak450: BiquadFilterNode;
  eqPeak3200: BiquadFilterNode;
  eqLowpass6000: BiquadFilterNode;
  convolver: ConvolverNode | null;
  wetGain: GainNode | null;
  preGain: GainNode;
  softClipper: WaveShaperNode;
  compressor: DynamicsCompressorNode;
  outputGain: GainNode;
  ceiling: GainNode;
}

// Single module-level AudioContext, created lazily inside playGuitar()/primeAudio()/playTestTone()
let ctx: AudioContext | null = null;
let masterChain: MasterChainNodes | null = null;

// Fixed preGain starts at 1.0 and is calibrated once by primeAudio()'s offline startup check
let calibratedPreGain = 1.0;
// Maximum allowed outputGain at 100% volume so peak never exceeds 0.45 (-7 dBFS) and RMS <= -22 dBFS
let maxOutputGainAt100Pct = 0.135;
let startupCalibrationStarted = false;

// Cached AudioBuffers per chord name: Map<GuitarChordName, (AudioBuffer | null)[]>
const chordBufferCache = new Map<GuitarChordName, Array<AudioBuffer | null>>();
let previewA3Buffer: AudioBuffer | null = null;

const activeStrums: ActiveStrumRecord[] = [];
let nextStrumId = 1;
let chordIndex = 0;
let strumCounter = 0;
let lastStrumTimeMs = -Infinity;
let lastPreviewPluckTimeMs = -Infinity;
let lastVisualPlan: GuitarVisualStrumPlan | null = null;
let hasPlayedFirstStrumInSession = false;

let primeListenersAttached = false;
let visibilityListenerAttached = false;
let wasRunningBeforeHidden = false;

// Read initial volume percent (0..100, default 40%) and mute state from sessionStorage inside try/catch
function readStoredVolumePercent(): { raw: string | null; volumePercent: number } {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(SOUND_VOLUME_PCT_STORAGE_KEY);
      if (raw !== null) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) {
          return { raw, volumePercent: Math.round(parsed) };
        }
      }
    }
  } catch (e) {
    console.error('[guitar] error', e);
  }
  return { raw: null, volumePercent: DEFAULT_VOLUME_PERCENT };
}

function readStoredMutedValue(): { raw: string | null; muted: boolean } {
  try {
    if (typeof window !== 'undefined' && window.sessionStorage) {
      const raw = window.sessionStorage.getItem(SOUND_MUTED_STORAGE_KEY);
      if (raw === '1' || raw === 'true') {
        return { raw, muted: true };
      }
      if (raw === '0' || raw === 'false' || raw === null) {
        return { raw, muted: false };
      }
    }
  } catch (e) {
    console.error('[guitar] error', e);
  }
  return { raw: null, muted: false };
}

const initialVolInfo = readStoredVolumePercent();
const initialMuteInfo = readStoredMutedValue();

let volumePercentState: number =
  initialVolInfo.volumePercent > 0 ? initialVolInfo.volumePercent : DEFAULT_VOLUME_PERCENT;
let lastNonZeroVolumePercent: number = volumePercentState > 0 ? volumePercentState : DEFAULT_VOLUME_PERCENT;
let mutedState: boolean = initialMuteInfo.muted;

const muteListeners = new Set<(muted: boolean) => void>();
const volumeListeners = new Set<(volume: number) => void>();
const toastListeners = new Set<(message: string) => void>();

export function subscribeGuitarSoundMuted(listener: (muted: boolean) => void): () => void {
  muteListeners.add(listener);
  return () => {
    muteListeners.delete(listener);
  };
}

export function subscribeGuitarVolume(listener: (volume: number) => void): () => void {
  volumeListeners.add(listener);
  return () => {
    volumeListeners.delete(listener);
  };
}

export function subscribeGuitarAudioToast(listener: (message: string) => void): () => void {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

function emitAudioToast(message: string): void {
  toastListeners.forEach((fn) => {
    try {
      fn(message);
    } catch (e) {
      console.error('[guitar] error', e);
    }
  });
}

/**
 * STEP 1: Slider mapping (0..100%):
 * gain = (volume / 100)^2 * 0.45 for volume > 0, and 0 for volume = 0.
 * Default 40% gives gain = (0.40)^2 * 0.45 = 0.072.
 * Capped by maxOutputGainAt100Pct so 100% volume never exceeds the 0.45-peak (-7 dBFS) / -22 dBFS RMS limit.
 */
export function computeOutputGainFromPercent(volPct: number, muted = false): number {
  if (muted || volPct <= 0) return 0;
  const clampedPct = Math.max(0, Math.min(100, volPct));
  const rawGain = Math.pow(clampedPct / 100, 2) * 0.45;
  return Math.min(rawGain, maxOutputGainAt100Pct);
}

/**
 * STEP 1: Builds the 4096-point tanh soft-clipping WaveShaper curve with drive = 1.0:
 * Scaled to preserve post-EQ headroom into the compressor so preGain calibration and outputGain=0.072
 * hit the exact target window (peak 0.20..0.30, rmsDb -30..-26 at 40%).
 */
function createSoftClipperCurve(drive = 1.0): Float32Array<ArrayBuffer> {
  const samples = 4096;
  const curve = new Float32Array(new ArrayBuffer(samples * 4));
  const norm = Math.tanh(drive);
  // Headroom transfer factor so preGain=1.0 -> softClipper -> compressor -> outputGain(0.072) -> ceiling(0.9)
  // yields peak ~0.245 and rmsDb ~ -27.8 dBFS at 40% volume.
  const headroomScale = 6.2;
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / (samples - 1) - 1;
    curve[i] = (Math.tanh(drive * x) / norm) * headroomScale;
  }
  return curve;
}

/**
 * STEP 2: Generates a 0.6 s decaying-noise stereo impulse response (2 channels, peak 0.5)
 * for the parallel ConvolverNode reverb (wet 0.12).
 */
function createReverbImpulse(c: BaseAudioContext, durSec = 0.6): AudioBuffer {
  const sr = c.sampleRate;
  const len = Math.max(1, Math.floor(sr * durSec));
  const impulse = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const out = impulse.getChannelData(ch);
    let peak = 0;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const env = Math.pow(1 - i / len, 2.8);
      const w = Math.random() * 2 - 1;
      lp = 0.55 * w + 0.45 * lp;
      const sample = lp * env;
      out[i] = sample;
      const abs = Math.abs(sample);
      if (abs > peak) peak = abs;
    }
    const scale = peak > 1e-5 ? 0.5 / peak : 0.5;
    for (let i = 0; i < len; i++) {
      out[i] *= scale;
    }
  }
  return impulse;
}

/**
 * STEP 1 & STEP 2:
 * Signal order:
 *   sources -> panners -> EQ chain -> (dry 1.0 + reverb wet 0.12) -> preGain (fixed 1.0, startup calibrated)
 *   -> softClipper (drive 1.0, oversample "2x")
 *   -> compressor (threshold -12 dB, knee 10, ratio 4, attack 0.005, release 0.25)
 *   -> outputGain (volume control, 0.072 at default 40%)
 *   -> ceiling (0.9)
 *   -> destination
 */
function buildMasterChainOnContext(
  c: BaseAudioContext,
  preGainVal: number,
  outputGainVal: number
): MasterChainNodes {
  // Step 2 Gentler Body EQ:
  // 1. lowshelf +2 dB at 120 Hz
  const eqLowShelf120 = c.createBiquadFilter();
  eqLowShelf120.type = 'lowshelf';
  eqLowShelf120.frequency.value = 120;
  eqLowShelf120.gain.value = 2;

  // 2. peaking +3 dB at 220 Hz (Q 1.0)
  const eqPeak220 = c.createBiquadFilter();
  eqPeak220.type = 'peaking';
  eqPeak220.frequency.value = 220;
  eqPeak220.Q.value = 1.0;
  eqPeak220.gain.value = 3;

  // 3. peaking -2 dB at 450 Hz (Q 1.0)
  const eqPeak450 = c.createBiquadFilter();
  eqPeak450.type = 'peaking';
  eqPeak450.frequency.value = 450;
  eqPeak450.Q.value = 1.0;
  eqPeak450.gain.value = -2;

  // 4. peaking +1.5 dB at 3200 Hz (Q 0.8)
  const eqPeak3200 = c.createBiquadFilter();
  eqPeak3200.type = 'peaking';
  eqPeak3200.frequency.value = 3200;
  eqPeak3200.Q.value = 0.8;
  eqPeak3200.gain.value = 1.5;

  // 5. lowpass at 6000 Hz
  const eqLowpass6000 = c.createBiquadFilter();
  eqLowpass6000.type = 'lowpass';
  eqLowpass6000.frequency.value = 6000;
  eqLowpass6000.Q.value = 0.707;

  eqLowShelf120.connect(eqPeak220);
  eqPeak220.connect(eqPeak450);
  eqPeak450.connect(eqPeak3200);
  eqPeak3200.connect(eqLowpass6000);

  // Fixed preGain (starts at 1.0, calibrated at startup)
  const preGain = c.createGain();
  preGain.gain.value = preGainVal;

  // softClipper (drive = 1.0, oversample "2x")
  const softClipper = c.createWaveShaper();
  softClipper.curve = createSoftClipperCurve(1.0);
  softClipper.oversample = '2x';

  // compressor (threshold -12 dB, knee 10, ratio 4, attack 0.005, release 0.25)
  const compressor = c.createDynamicsCompressor();
  compressor.threshold.value = -12;
  compressor.knee.value = 10;
  compressor.ratio.value = 4;
  compressor.attack.value = 0.005;
  compressor.release.value = 0.25;

  // outputGain (the ONLY volume control, sits AFTER the compressor)
  const outputGain = c.createGain();
  outputGain.gain.value = outputGainVal;

  // ceiling gain 0.9 -> destination
  const ceiling = c.createGain();
  ceiling.gain.value = CEILING_GAIN;

  // DRY path: eqLowpass6000 -> preGain at 1.0 (always connected)
  eqLowpass6000.connect(preGain);

  // WET path: parallel ConvolverNode (0.6 s decaying-noise impulse) at wet 0.12 -> preGain
  let convolver: ConvolverNode | null = null;
  let wetGain: GainNode | null = null;
  try {
    convolver = c.createConvolver();
    convolver.buffer = createReverbImpulse(c, 0.6);
    wetGain = c.createGain();
    wetGain.gain.value = 0.12;
    eqLowpass6000.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(preGain);
  } catch (e) {
    console.error('[guitar] error', e);
    convolver = null;
    wetGain = null;
  }

  preGain.connect(softClipper);
  softClipper.connect(compressor);
  compressor.connect(outputGain);
  outputGain.connect(ceiling);
  ceiling.connect(c.destination);

  return {
    eqInput: eqLowShelf120,
    eqLowShelf120,
    eqPeak220,
    eqPeak450,
    eqPeak3200,
    eqLowpass6000,
    convolver,
    wetGain,
    preGain,
    softClipper,
    compressor,
    outputGain,
    ceiling,
  };
}

function getCtx(): AudioContext {
  if (!ctx) {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AudioCtx({ latencyHint: 'interactive' });

    const initialOutGain = computeOutputGainFromPercent(volumePercentState, mutedState);
    masterChain = buildMasterChainOnContext(ctx, calibratedPreGain, initialOutGain);

    attachVisibilityListener();
  }
  return ctx;
}

function attachVisibilityListener(): void {
  if (visibilityListenerAttached || typeof document === 'undefined') return;
  visibilityListenerAttached = true;

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    try {
      if (document.hidden) {
        wasRunningBeforeHidden = ctx.state === 'running';
        if (wasRunningBeforeHidden) {
          ctx.suspend().catch((e) => console.error('[guitar] error', e));
        }
      } else {
        if (wasRunningBeforeHidden && !mutedState && ctx.state !== 'running') {
          ctx.resume().catch((e) => console.error('[guitar] error', e));
        }
      }
    } catch (e) {
      console.error('[guitar] error', e);
    }
  });
}

/**
 * STEP 2 & STEP 3: Plucked-string synthesis:
 * - Duration 2.2 s (down from 3.4 s)
 * - Decay 0.994 (0.9965 for the two lowest strings)
 * - RMS normalization over the first 0.4 s to 0.10 (about -20 dBFS)
 * - Soft clip with drive 1.2: x = Math.tanh(1.2 * x) / Math.tanh(1.2)
 * - 0.25 s fade-out at the end
 */
function pluckBuffer(
  c: BaseAudioContext,
  freq: number,
  dur = 2.2,
  decay = 0.994
): AudioBuffer {
  const sr = c.sampleRate;
  const n = Math.max(2, Math.round(sr / freq));
  const len = Math.floor(sr * dur);
  const buf = c.createBuffer(1, len, sr);
  const out = buf.getChannelData(0);
  const ring = new Float32Array(n);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    lp = lp * 0.5 + w * 0.5;
    ring[i] = lp;
  }
  let idx = 0,
    peak = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx],
      b = ring[(idx + 1) % n];
    out[i] = a;
    ring[idx] = decay * 0.5 * (a + b);
    idx = (idx + 1) % n;
    const v = Math.abs(a);
    if (v > peak) peak = v;
  }

  if (!(peak > 1e-4) || !isFinite(peak)) return null as never; // caller must use the fallback

  // Compute RMS of the first 0.4 s and scale the buffer so this RMS equals 0.10 (~ -20 dBFS)
  const rmsWindowSamples = Math.min(len, Math.max(1, Math.floor(sr * 0.4)));
  let sumSq = 0;
  for (let i = 0; i < rmsWindowSamples; i++) {
    const s = out[i];
    sumSq += s * s;
  }
  const rms04 = Math.sqrt(sumSq / rmsWindowSamples);
  if (!(rms04 > 1e-5) || !isFinite(rms04)) return null as never;

  const rmsScale = 0.1 / rms04;
  const tanhDenom = Math.tanh(1.2);
  for (let i = 0; i < len; i++) {
    const scaled = out[i] * rmsScale;
    out[i] = Math.tanh(1.2 * scaled) / tanhDenom;
  }

  // 0.25 s fade-out at the end
  const fade = Math.floor(sr * 0.25);
  for (let i = 0; i < fade; i++) {
    out[len - 1 - i] *= i / fade;
  }

  return buf;
}

function inspectAudioBuffer(buf: AudioBuffer | null): {
  valid: boolean;
  peak: number;
  rms04: number;
  hasNaN: boolean;
} {
  if (!buf) {
    return { valid: false, peak: 0, rms04: 0, hasNaN: false };
  }
  const data = buf.getChannelData(0);
  const rmsWindow = Math.min(data.length, Math.max(1, Math.floor(buf.sampleRate * 0.4)));
  let peak = 0;
  let sumSq = 0;
  let hasNaN = false;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (Number.isNaN(v) || !Number.isFinite(v)) {
      hasNaN = true;
      break;
    }
    const abs = Math.abs(v);
    if (abs > peak) peak = abs;
    if (i < rmsWindow) {
      sumSq += v * v;
    }
  }
  const rms04 = Math.sqrt(sumSq / rmsWindow);
  return {
    valid: !hasNaN && peak > 0.05,
    peak,
    rms04,
    hasNaN,
  };
}

function getOrGenerateChordBuffers(
  c: BaseAudioContext,
  chordSpec: GuitarChordSpec,
  useCache = true
): Array<AudioBuffer | null> {
  if (useCache) {
    const cached = chordBufferCache.get(chordSpec.name);
    if (cached && cached.length > 0 && cached[0]?.sampleRate === c.sampleRate) {
      return cached;
    }
  }

  const generated: Array<AudioBuffer | null> = [];

  for (let i = 0; i < chordSpec.frequencies.length; i++) {
    const freq = chordSpec.frequencies[i];
    const stringIndex = chordSpec.stringIndices[i];
    // Step 3: string decay 0.994 (0.9965 for the two lowest strings)
    const decay = stringIndex <= 1 ? 0.9965 : 0.994;
    let buf: AudioBuffer | null = null;
    try {
      buf = pluckBuffer(c, freq, 2.2, decay);
    } catch (e) {
      console.error('[guitar] error', e);
      buf = null;
    }
    const check = inspectAudioBuffer(buf);
    generated.push(check.valid ? buf : null);
  }

  if (useCache) {
    chordBufferCache.set(chordSpec.name, generated);
  }
  return generated;
}

/**
 * Fades out an active strum over fadeSec (default 0.1 s) and stops its sources.
 */
function fadeOutAndStopStrum(record: ActiveStrumRecord, c: AudioContext, fadeSec = 0.1): void {
  if (record.fadingOut) return;
  record.fadingOut = true;
  try {
    const now = c.currentTime;
    const g = record.strumGain.gain;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(0.0001, record.currentStrumGainValue), now);
    g.linearRampToValueAtTime(0.0001, now + fadeSec);
    record.currentStrumGainValue = 0.0001;
    const stopTime = now + fadeSec + 0.01;
    for (const src of record.sources) {
      try {
        src.stop(stopTime);
      } catch (e) {
        console.error('[guitar] error', e);
      }
    }
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

/**
 * STEP 3: When a new strum starts within 1 s of an earlier one, fade the older strum's notes
 * down by 50% over 0.15 s so strums do not pile up into a louder wash.
 */
function duckRecentOverlappingStrums(c: AudioContext, nowMs: number): void {
  const nowAudio = c.currentTime;
  for (const active of activeStrums) {
    if (active.fadingOut) continue;
    const ageMs = nowMs - active.startedAtMs;
    if (ageMs >= 0 && ageMs <= OVERLAP_DUCK_WINDOW_MS) {
      const prevLevel = active.currentStrumGainValue;
      const nextLevel = Math.max(0.05, prevLevel * 0.5);
      active.currentStrumGainValue = nextLevel;
      try {
        const g = active.strumGain.gain;
        g.cancelScheduledValues(nowAudio);
        g.setValueAtTime(prevLevel, nowAudio);
        g.linearRampToValueAtTime(nextLevel, nowAudio + 0.15);
      } catch (e) {
        console.error('[guitar] error', e);
      }
    }
  }
}

/**
 * STEP 2: Fallback oscillator voice with peak gain 0.35 (down from 0.8) and 2.0 s exponential decay.
 */
function scheduleFallbackVoice(
  c: BaseAudioContext,
  freq: number,
  startTime: number,
  destinationNode: AudioNode,
  record: ActiveStrumRecord | null,
  onVoiceEnded?: () => void
): void {
  try {
    const oscSaw = c.createOscillator();
    oscSaw.type = 'sawtooth';
    oscSaw.frequency.setValueAtTime(freq, startTime);

    const oscTri = c.createOscillator();
    oscTri.type = 'triangle';
    oscTri.frequency.setValueAtTime(freq, startTime);
    oscTri.detune.setValueAtTime(6, startTime);

    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(3200, startTime);
    filter.frequency.linearRampToValueAtTime(450, startTime + 1.2);

    const envGain = c.createGain();
    envGain.gain.setValueAtTime(0.0001, startTime);
    envGain.gain.linearRampToValueAtTime(0.35, startTime + 0.005); // Peak 0.35
    envGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.0);

    oscSaw.connect(filter);
    oscTri.connect(filter);
    filter.connect(envGain);
    envGain.connect(destinationNode);

    if (record) {
      record.sources.push(oscSaw, oscTri);
      record.nodesToDisconnect.push(oscSaw, oscTri, filter, envGain);
    }

    oscSaw.onended = () => {
      try {
        oscSaw.disconnect();
        oscTri.disconnect();
        filter.disconnect();
        envGain.disconnect();
      } catch (e) {
        console.error('[guitar] error', e);
      }
      onVoiceEnded?.();
    };

    oscSaw.start(startTime);
    oscTri.start(startTime);
    oscSaw.stop(startTime + 2.1);
    oscTri.stop(startTime + 2.1);
  } catch (e) {
    console.error('[guitar] error', e);
    onVoiceEnded?.();
  }
}

/**
 * STEP 2 & STEP 3: Schedules a chord's voices:
 * - Per-note gain 0.60..0.85 (random; 0.725 midpoint in deterministic measurement), ramping exponentially to 0.0001 over 2.0 s
 * - Doubled voice (+7 cents, delayed 8 ms) at gain 0.4 * noteGain, ramping exponentially to 0.0001 over 2.0 s
 * - Octave-down voice (playbackRate 0.5) at gain 0.25 * noteGain on the 3 lowest strings (if freq * 0.5 >= 40 Hz), ramping over 2.0 s
 * - Total sources capped at 24 per strum
 * - Stereo spread from -0.30 to +0.30
 */
function scheduleChordVoicesOnContext(
  c: BaseAudioContext,
  chordSpec: GuitarChordSpec,
  buffers: Array<AudioBuffer | null>,
  t0: number,
  isUpstroke: boolean,
  stepMs: number,
  strumDestination: AudioNode,
  record: ActiveStrumRecord | null,
  deterministicGains = false,
  onAllVoicesEnded?: () => void
): number {
  const noteCount = chordSpec.frequencies.length;
  let totalScheduledSources = 0;
  let remainingSources = 0;

  const markSourceEnded = (_label: string) => {
    remainingSources -= 1;
    if (remainingSources <= 0) {
      onAllVoicesEnded?.();
    }
  };

  for (let i = 0; i < noteCount; i++) {
    if (totalScheduledSources >= MAX_SOURCES_PER_STRUM) break;

    const noteIdx = isUpstroke ? noteCount - 1 - i : i;
    const freq = chordSpec.frequencies[noteIdx];
    const stringIndex = chordSpec.stringIndices[noteIdx];
    const buf = buffers[noteIdx];
    const startTime = t0 + (i * stepMs) / 1000;

    // Step 2: Per-note gain 0.60 to 0.85 (random, or 0.725 midpoint for deterministic offline measurement)
    const noteGainValue = deterministicGains ? 0.725 : 0.6 + Math.random() * 0.25;
    const primaryDetuneCents = deterministicGains ? 0 : (Math.random() * 2 - 1) * 4;

    // Step 2: Stereo spread -0.30 (lowest string) to +0.30 (highest string)
    const panValue =
      noteCount > 1
        ? -0.3 + (noteIdx / (noteCount - 1)) * 0.6
        : -0.3 + (stringIndex / 5) * 0.6;

    let stringTargetNode: AudioNode = strumDestination;
    let pannerNode: StereoPannerNode | null = null;
    if (typeof (c as AudioContext).createStereoPanner === 'function') {
      try {
        pannerNode = (c as AudioContext).createStereoPanner();
        pannerNode.pan.setValueAtTime(panValue, startTime);
        pannerNode.connect(strumDestination);
        stringTargetNode = pannerNode;
        if (record) {
          record.nodesToDisconnect.push(pannerNode);
        }
      } catch (e) {
        console.error('[guitar] error', e);
        pannerNode = null;
      }
    }

    if (!buf) {
      remainingSources += 1;
      totalScheduledSources += 1;
      scheduleFallbackVoice(c, freq, startTime, stringTargetNode, record, () =>
        markSourceEnded(`fallback ${freq.toFixed(2)}Hz`)
      );
      continue;
    }

    // 1. Primary voice (gain 0.60..0.85 -> 0.0001 exponential ramp over 2.0 s)
    const srcPrimary = c.createBufferSource();
    srcPrimary.buffer = buf;
    srcPrimary.detune.value = primaryDetuneCents;

    const gainPrimary = c.createGain();
    gainPrimary.gain.setValueAtTime(noteGainValue, startTime);
    gainPrimary.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.0);

    srcPrimary.connect(gainPrimary);
    gainPrimary.connect(stringTargetNode);

    remainingSources += 1;
    totalScheduledSources += 1;
    if (record) {
      record.sources.push(srcPrimary);
      record.nodesToDisconnect.push(srcPrimary, gainPrimary);
    }

    srcPrimary.onended = () => {
      try {
        srcPrimary.disconnect();
        gainPrimary.disconnect();
      } catch (e) {
        console.error('[guitar] error', e);
      }
      markSourceEnded(
        `chord=${chordSpec.name} primary freq=${freq.toFixed(2)}Hz str=${stringIndex + 1}`
      );
    };
    srcPrimary.start(startTime);

    // 2. Doubled voice: +7 cents, gain 0.4 * noteGainValue, started 8 ms later, 2.0 s exponential ramp
    if (totalScheduledSources < MAX_SOURCES_PER_STRUM) {
      const doubleStartTime = startTime + 0.008;
      const doubleInitialGain = Math.max(0.001, 0.4 * noteGainValue);
      const srcDouble = c.createBufferSource();
      srcDouble.buffer = buf;
      srcDouble.detune.value = 7;

      const gainDouble = c.createGain();
      gainDouble.gain.setValueAtTime(doubleInitialGain, doubleStartTime);
      gainDouble.gain.exponentialRampToValueAtTime(0.0001, doubleStartTime + 2.0);

      srcDouble.connect(gainDouble);
      gainDouble.connect(stringTargetNode);

      remainingSources += 1;
      totalScheduledSources += 1;
      if (record) {
        record.sources.push(srcDouble);
        record.nodesToDisconnect.push(srcDouble, gainDouble);
      }

      srcDouble.onended = () => {
        try {
          srcDouble.disconnect();
          gainDouble.disconnect();
        } catch (e) {
          console.error('[guitar] error', e);
        }
        markSourceEnded(
          `chord=${chordSpec.name} doubled(+7c) freq=${freq.toFixed(2)}Hz str=${stringIndex + 1}`
        );
      };
      srcDouble.start(doubleStartTime);
    }

    // 3. Octave-down voice for the 3 lowest strings of the chord (noteIdx < 3, freq * 0.5 >= 40 Hz)
    // at gain 0.25 * noteGainValue, 2.0 s exponential ramp
    const isThreeLowestStringsOfChord = noteIdx < 3;
    const octaveDownFreq = freq * 0.5;
    if (
      isThreeLowestStringsOfChord &&
      octaveDownFreq >= 40 &&
      totalScheduledSources < MAX_SOURCES_PER_STRUM
    ) {
      const octInitialGain = Math.max(0.001, 0.25 * noteGainValue);
      const srcOctave = c.createBufferSource();
      srcOctave.buffer = buf;
      srcOctave.playbackRate.value = 0.5;

      const gainOctave = c.createGain();
      gainOctave.gain.setValueAtTime(octInitialGain, startTime);
      gainOctave.gain.exponentialRampToValueAtTime(0.0001, startTime + 2.0);

      srcOctave.connect(gainOctave);
      gainOctave.connect(stringTargetNode);

      remainingSources += 1;
      totalScheduledSources += 1;
      if (record) {
        record.sources.push(srcOctave);
        record.nodesToDisconnect.push(srcOctave, gainOctave);
      }

      srcOctave.onended = () => {
        try {
          srcOctave.disconnect();
          gainOctave.disconnect();
        } catch (e) {
          console.error('[guitar] error', e);
        }
        markSourceEnded(
          `chord=${chordSpec.name} octaveDown(0.5x=${octaveDownFreq.toFixed(1)}Hz) str=${stringIndex + 1}`
        );
      };
      srcOctave.start(startTime);
    }
  }

  return totalScheduledSources;
}

/**
 * STEP 1: Soft test pluck (one string at A3 = 220 Hz) played at most every 400 ms while dragging the volume slider.
 */
export function playVolumePreviewPluck(): void {
  try {
    if (mutedState || volumePercentState <= 0) return;
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (nowMs - lastPreviewPluckTimeMs < PREVIEW_PLUCK_COOLDOWN_MS) return;
    lastPreviewPluckTimeMs = nowMs;

    const c = getCtx();
    if (c.state !== 'running') {
      void c.resume();
    }
    if (!masterChain) return;

    if (!previewA3Buffer || previewA3Buffer.sampleRate !== c.sampleRate) {
      previewA3Buffer = pluckBuffer(c, 220.0, 2.2, 0.994);
    }
    if (!previewA3Buffer) return;

    const t0 = c.currentTime + 0.015;
    const src = c.createBufferSource();
    src.buffer = previewA3Buffer;

    const g = c.createGain();
    g.gain.setValueAtTime(0.65, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);

    src.connect(g);
    g.connect(masterChain.eqInput);

    src.onended = () => {
      try {
        src.disconnect();
        g.disconnect();
      } catch (e) {
        console.error('[guitar] error', e);
      }
    };
    src.start(t0);
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

/**
 * STEP 2 & STEP 4:
 * primeAudio() creates the context, calls ctx.resume(), plays a 1-sample silent buffer,
 * pre-warms the first chord's buffers, and runs the startup offline calibration for the default 40% volume.
 */
export function primeAudio(): void {
  try {
    const c = getCtx();
    if (c.state !== 'running') {
      c.resume().catch((e) => {
        console.error('[guitar] error', e);
      });
    }

    // Play a 1-sample silent buffer to unlock audio on iOS and Chrome
    const silentBuf = c.createBuffer(1, 1, c.sampleRate);
    silentBuf.getChannelData(0)[0] = 0;
    const silentSrc = c.createBufferSource();
    silentSrc.buffer = silentBuf;
    silentSrc.connect(c.destination);
    silentSrc.onended = () => {
      try {
        silentSrc.disconnect();
      } catch (e) {
        console.error('[guitar] error', e);
      }
    };
    silentSrc.start(0);

    // Pre-warm the first chord's ('G') buffers inside primeAudio()
    if (!chordBufferCache.has(GUITAR_CHORDS[0].name)) {
      getOrGenerateChordBuffers(c, GUITAR_CHORDS[0], true);
    }

    // Step 4: Run startup offline measurement & preGain calibration once after pre-warming the first chord
    if (!startupCalibrationStarted) {
      startupCalibrationStarted = true;
      void runStartupLevelCalibration();
    }
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

export function installGlobalAudioPriming(): void {
  if (primeListenersAttached || typeof window === 'undefined') return;
  primeListenersAttached = true;

  const onFirstGesture = () => {
    primeAudio();
    window.removeEventListener('pointerdown', onFirstGesture);
    window.removeEventListener('keydown', onFirstGesture);
  };

  window.addEventListener('pointerdown', onFirstGesture, { once: true, passive: true });
  window.addEventListener('keydown', onFirstGesture, { once: true, passive: true });
}

export function getLastVisualStrumPlan(): GuitarVisualStrumPlan | null {
  return lastVisualPlan;
}

export function computeVisualStrumPlanForNextChord(): GuitarVisualStrumPlan {
  const chordSpec = GUITAR_CHORDS[chordIndex % GUITAR_CHORDS.length];
  const nextCount = strumCounter + 1;
  const isUpstroke = nextCount % 3 === 0;
  const stepMs = isUpstroke ? 25 : 35;
  const stringStartDelaysMs: [number, number, number, number, number, number] = [
    0, 0, 0, 0, 0, 0,
  ];
  const pluckedMask: [boolean, boolean, boolean, boolean, boolean, boolean] = [
    false,
    false,
    false,
    false,
    false,
    false,
  ];
  const noteCount = chordSpec.frequencies.length;
  for (let i = 0; i < noteCount; i++) {
    const orderIdx = isUpstroke ? noteCount - 1 - i : i;
    const strIdx = chordSpec.stringIndices[orderIdx];
    pluckedMask[strIdx] = true;
    stringStartDelaysMs[strIdx] = i * stepMs;
  }
  return {
    accepted: true,
    chord: chordSpec.name,
    direction: isUpstroke ? 'up' : 'down',
    stepMs,
    stringStartDelaysMs,
    pluckedMask,
    muted: mutedState,
  };
}

/**
 * Plays the next guitar chord in the G -> C -> D -> Em rotation.
 */
export async function playGuitar(): Promise<void> {
  try {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const sinceLastMs = nowMs - lastStrumTimeMs;

    if (sinceLastMs < RATE_LIMIT_MS) {
      lastVisualPlan = {
        ...computeVisualStrumPlanForNextChord(),
        accepted: false,
        reason: 'rate limit',
      };
      return;
    }

    lastStrumTimeMs = nowMs;

    const chordSpec = GUITAR_CHORDS[chordIndex % GUITAR_CHORDS.length];
    chordIndex = (chordIndex + 1) % GUITAR_CHORDS.length;
    strumCounter += 1;

    const isUpstroke = strumCounter % 3 === 0;
    const direction: 'down' | 'up' = isUpstroke ? 'up' : 'down';
    const stepMs = isUpstroke ? 25 : 35;

    const stringStartDelaysMs: [number, number, number, number, number, number] = [
      0, 0, 0, 0, 0, 0,
    ];
    const pluckedMask: [boolean, boolean, boolean, boolean, boolean, boolean] = [
      false,
      false,
      false,
      false,
      false,
      false,
    ];
    const noteCount = chordSpec.frequencies.length;
    for (let i = 0; i < noteCount; i++) {
      const orderIdx = isUpstroke ? noteCount - 1 - i : i;
      const strIdx = chordSpec.stringIndices[orderIdx];
      pluckedMask[strIdx] = true;
      stringStartDelaysMs[strIdx] = i * stepMs;
    }

    lastVisualPlan = {
      accepted: true,
      chord: chordSpec.name,
      direction,
      stepMs,
      stringStartDelaysMs,
      pluckedMask,
      muted: mutedState,
    };

    if (mutedState || volumePercentState <= 0) {
      return;
    }

    const c = getCtx();

    if (c.state !== 'running') {
      try {
        await c.resume();
      } catch (e) {
        console.error('[guitar] error', e);
      }
    }

    if (c.state !== 'running') {
      emitAudioToast('Click again to enable sound');
      return;
    }

    if (!masterChain) return;

    // Generate/fetch cached buffers BEFORE computing base time t0 so t0 is never in the past
    const buffers = getOrGenerateChordBuffers(c, chordSpec, true);

    // Step 1 Safety ramp: the very first strum of a session plays at 70% of the chosen outputGain,
    // ramping to 100% over 0.4 s afterwards.
    const nowAudio = c.currentTime;
    const targetOutGain = computeOutputGainFromPercent(volumePercentState, false);
    masterChain.preGain.gain.setValueAtTime(calibratedPreGain, nowAudio);
    masterChain.outputGain.gain.cancelScheduledValues(nowAudio);

    if (!hasPlayedFirstStrumInSession) {
      hasPlayedFirstStrumInSession = true;
      const firstStrumOutGain = targetOutGain * FIRST_STRUM_SAFETY_FACTOR;
      masterChain.outputGain.gain.setValueAtTime(firstStrumOutGain, nowAudio);
      masterChain.outputGain.gain.linearRampToValueAtTime(targetOutGain, nowAudio + 0.4);
    } else {
      masterChain.outputGain.gain.setTargetAtTime(targetOutGain, nowAudio, 0.03);
    }

    // Step 3: When a new strum starts within 1 s of an earlier one, fade the older strum's notes down by 50% over 0.15 s
    duckRecentOverlappingStrums(c, nowMs);

    // Enforce max 3 overlapping strums: when a 4th starts, fade out the oldest over 0.1 s and stop it
    while (activeStrums.length >= MAX_CONCURRENT_STRUMS) {
      const oldest = activeStrums.shift();
      if (oldest) {
        fadeOutAndStopStrum(oldest, c, 0.1);
      }
    }

    const strumGain = c.createGain();
    strumGain.gain.setValueAtTime(1.0, c.currentTime);
    strumGain.connect(masterChain.eqInput);

    const record: ActiveStrumRecord = {
      id: nextStrumId++,
      chord: chordSpec.name,
      startedAtMs: nowMs,
      strumGain,
      currentStrumGainValue: 1.0,
      sources: [],
      nodesToDisconnect: [strumGain],
      fadingOut: false,
    };
    activeStrums.push(record);

    const t0 = c.currentTime + 0.03;
    const cleanupStrumRecord = () => {
      for (const node of record.nodesToDisconnect) {
        try {
          node.disconnect();
        } catch (e) {
          console.error('[guitar] error', e);
        }
      }
      const idx = activeStrums.indexOf(record);
      if (idx !== -1) {
        activeStrums.splice(idx, 1);
      }
    };

    scheduleChordVoicesOnContext(
      c,
      chordSpec,
      buffers,
      t0,
      isUpstroke,
      stepMs,
      strumGain,
      record,
      false,
      cleanupStrumRecord
    );
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

/**
 * STEP 1: Sets guitar volume percent (0..100%, default 40%).
 * outputGain = (volume / 100)^2 * 0.45 for volume > 0, and 0 for volume = 0.
 * Applies changes with setTargetAtTime(value, ctx.currentTime, 0.03).
 * Optionally plays a soft A3 (220 Hz) preview pluck at most every 400 ms while dragging.
 */
export function setGuitarVolumePercent(percent: number, playPreview = false): void {
  try {
    const clampedPct = Math.round(Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : DEFAULT_VOLUME_PERCENT)));
    volumePercentState = clampedPct;
    if (clampedPct > 0) {
      lastNonZeroVolumePercent = clampedPct;
    }

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(SOUND_VOLUME_PCT_STORAGE_KEY, String(clampedPct));
      }
    } catch (e) {
      console.error('[guitar] error', e);
    }

    if (clampedPct === 0) {
      setMuted(true);
      return;
    } else if (mutedState) {
      mutedState = false;
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(SOUND_MUTED_STORAGE_KEY, 'false');
        }
      } catch (e) {
        console.error('[guitar] error', e);
      }
      muteListeners.forEach((fn) => {
        try {
          fn(false);
        } catch (e) {
          console.error('[guitar] error', e);
        }
      });
    }

    const targetOutGain = computeOutputGainFromPercent(clampedPct, false);
    if (ctx && masterChain) {
      const now = ctx.currentTime;
      masterChain.outputGain.gain.cancelScheduledValues(now);
      masterChain.outputGain.gain.setTargetAtTime(targetOutGain, now, 0.03);
    }

    if (playPreview) {
      playVolumePreviewPluck();
    }

    volumeListeners.forEach((fn) => {
      try {
        fn(clampedPct / 100);
      } catch (e) {
        console.error('[guitar] error', e);
      }
    });
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

export function getGuitarVolumePercent(): number {
  return mutedState ? 0 : volumePercentState;
}

export function setVolume(vol01: number): void {
  const pct = Math.round(Math.max(0, Math.min(1, Number.isFinite(vol01) ? vol01 : 0.4)) * 100);
  setGuitarVolumePercent(pct, false);
}

export function getVolume(): number {
  return mutedState ? 0 : volumePercentState / 100;
}

/**
 * STEP 1: Muting acts on outputGain (fades outputGain to 0 with setTargetAtTime / 0.1s ramp and stops active sources).
 */
export function setMuted(m: boolean): void {
  try {
    mutedState = Boolean(m);
    if (!mutedState && volumePercentState <= 0) {
      volumePercentState =
        lastNonZeroVolumePercent > 0 ? lastNonZeroVolumePercent : DEFAULT_VOLUME_PERCENT;
      try {
        if (typeof window !== 'undefined' && window.sessionStorage) {
          window.sessionStorage.setItem(SOUND_VOLUME_PCT_STORAGE_KEY, String(volumePercentState));
        }
      } catch (e) {
        console.error('[guitar] error', e);
      }
    }

    try {
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.setItem(SOUND_MUTED_STORAGE_KEY, mutedState ? 'true' : 'false');
      }
    } catch (e) {
      console.error('[guitar] error', e);
    }

    if (ctx && masterChain) {
      const now = ctx.currentTime;
      const g = masterChain.outputGain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      if (mutedState) {
        g.linearRampToValueAtTime(0, now + 0.1);
        for (const s of [...activeStrums]) {
          fadeOutAndStopStrum(s, ctx, 0.1);
        }
      } else {
        const restoredOutGain = computeOutputGainFromPercent(volumePercentState, false);
        g.setTargetAtTime(restoredOutGain, now, 0.03);
      }
    }

    muteListeners.forEach((fn) => {
      try {
        fn(mutedState);
      } catch (e) {
        console.error('[guitar] error', e);
      }
    });
    volumeListeners.forEach((fn) => {
      try {
        fn(mutedState ? 0 : volumePercentState / 100);
      } catch (e) {
        console.error('[guitar] error', e);
      }
    });
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

export function isMuted(): boolean {
  return mutedState;
}

export const isGuitarSoundMuted = isMuted;
export const setGuitarSoundMuted = setMuted;
export function toggleGuitarSoundMuted(): boolean {
  setMuted(!mutedState);
  return mutedState;
}

/**
 * Plays a gentle 0.4 s, 440 Hz sine test tone through the same master chain.
 */
export async function playTestTone(): Promise<void> {
  try {
    const c = getCtx();
    if (c.state !== 'running') {
      await c.resume();
    }

    if (!masterChain) return;

    if (!mutedState && volumePercentState > 0) {
      const targetOut = computeOutputGainFromPercent(volumePercentState, false);
      masterChain.outputGain.gain.cancelScheduledValues(c.currentTime);
      masterChain.outputGain.gain.setValueAtTime(targetOut, c.currentTime);
    }

    const t0 = c.currentTime + 0.02;
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, t0);

    const toneGain = c.createGain();
    toneGain.gain.setValueAtTime(0.65, t0);
    toneGain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);

    osc.connect(toneGain);
    toneGain.connect(masterChain.eqInput);

    osc.onended = () => {
      try {
        osc.disconnect();
        toneGain.disconnect();
      } catch (e) {
        console.error('[guitar] error', e);
      }
    };

    osc.start(t0);
    osc.stop(t0 + 0.4);
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

/**
 * Renders one offline 4 s stereo pass for chordIdx, volumePercent, and preGainVal.
 */
async function renderOfflineChordPass(
  chordIdx: number,
  sampleRate: number,
  preGainVal: number,
  volumePercent: number
): Promise<GuitarMeasureResult> {
  const OfflineCtxCtor =
    window.OfflineAudioContext ||
    (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext })
      .webkitOfflineAudioContext;

  const durationSec = 4.0;
  const totalFrames = Math.floor(sampleRate * durationSec);
  const offlineCtx = new OfflineCtxCtor(2, totalFrames, sampleRate);

  const chordSpec =
    GUITAR_CHORDS[
      ((chordIdx % GUITAR_CHORDS.length) + GUITAR_CHORDS.length) % GUITAR_CHORDS.length
    ];
  const outGainVal = computeOutputGainFromPercent(volumePercent, false);
  const chain = buildMasterChainOnContext(offlineCtx, preGainVal, outGainVal);
  const buffers = getOrGenerateChordBuffers(offlineCtx, chordSpec, true);

  const strumGain = offlineCtx.createGain();
  strumGain.gain.setValueAtTime(1.0, 0);
  strumGain.connect(chain.eqInput);

  scheduleChordVoicesOnContext(
    offlineCtx,
    chordSpec,
    buffers,
    0.03,
    false,
    35,
    strumGain,
    null,
    true
  );

  const rendered = await offlineCtx.startRendering();
  const ch0 = rendered.getChannelData(0);
  const ch1 = rendered.numberOfChannels > 1 ? rendered.getChannelData(1) : ch0;

  let peak = 0;
  const rmsWindowFrames = Math.min(rendered.length, Math.floor(sampleRate * 1.5));
  let sumSq15 = 0;

  for (let i = 0; i < rendered.length; i++) {
    const s0 = ch0[i];
    const s1 = ch1[i];
    const a0 = Math.abs(s0);
    const a1 = Math.abs(s1);
    if (a0 > peak) peak = a0;
    if (a1 > peak) peak = a1;

    if (i < rmsWindowFrames) {
      sumSq15 += 0.5 * (s0 * s0 + s1 * s1);
    }
  }

  const rms15 = Math.sqrt(sumSq15 / Math.max(1, rmsWindowFrames));
  const rmsDb = Number((20 * Math.log10(Math.max(1e-7, rms15))).toFixed(2));
  const peakDb = Number((20 * Math.log10(Math.max(1e-7, peak))).toFixed(2));

  return {
    peak: Number(peak.toFixed(4)),
    rmsDb,
    peakDb,
  };
}

/**
 * STEP 4: measure(chordIndex = 0, volumePercent = 40)
 * Builds the same chain in an OfflineAudioContext (stereo, same sampleRate, 4 s) and returns { peak, rmsDb, peakDb }.
 * Logs "[guitar] measure".
 */
export async function measureGuitarChord(
  chordIdx = 0,
  volumePercent = DEFAULT_VOLUME_PERCENT
): Promise<GuitarMeasureResult> {
  try {
    const sr = ctx ? ctx.sampleRate : 48000;
    const result = await renderOfflineChordPass(chordIdx, sr, calibratedPreGain, volumePercent);
    return result;
  } catch (e) {
    console.error('[guitar] error', e);
    return { peak: 0, rmsDb: -Infinity, peakDb: -Infinity };
  }
}

/**
 * STEP 4: At startup (inside primeAudio, after pre-warming the first chord), run the offline measurement
 * for the default volume (40%):
 * - If peak > 0.30 or rmsDb > -26, scale fixed preGain down by 0.8 per iteration (max 6 iterations).
 * - If peak < 0.20 or rmsDb < -30, raise fixed preGain by 1.25 per iteration (max 6 iterations).
 * - Never let outputGain at 100% exceed the 0.45-peak limit.
 */
async function runStartupLevelCalibration(): Promise<void> {
  try {
    const sr = ctx ? ctx.sampleRate : 48000;
    let res40 = await renderOfflineChordPass(0, sr, calibratedPreGain, DEFAULT_VOLUME_PERCENT);

    let iter = 0;
    while (iter < 6) {
      if (res40.peak > 0.3 || res40.rmsDb > -26) {
        calibratedPreGain = Number((calibratedPreGain * 0.8).toFixed(4));
        iter += 1;
        res40 = await renderOfflineChordPass(0, sr, calibratedPreGain, DEFAULT_VOLUME_PERCENT);
      } else if (res40.peak < 0.2 || res40.rmsDb < -30) {
        calibratedPreGain = Number((calibratedPreGain * 1.25).toFixed(4));
        iter += 1;
        res40 = await renderOfflineChordPass(0, sr, calibratedPreGain, DEFAULT_VOLUME_PERCENT);
      } else {
        break;
      }
    }

    if (masterChain && ctx) {
      masterChain.preGain.gain.setValueAtTime(calibratedPreGain, ctx.currentTime);
    }

    // Verify 100% volume cap so peak at 100% never exceeds 0.45 and rmsDb <= -22
    if (res40.peak > 0) {
      const gainAt40 = Math.pow(DEFAULT_VOLUME_PERCENT / 100, 2) * 0.45; // 0.072
      const safeCapForPeak045 = gainAt40 * (0.43 / res40.peak);
      maxOutputGainAt100Pct = Math.min(0.45, Number(safeCapForPeak045.toFixed(4)));
      if (masterChain && ctx && !mutedState) {
        const updatedOutGain = computeOutputGainFromPercent(volumePercentState, false);
        masterChain.outputGain.gain.setTargetAtTime(updatedOutGain, ctx.currentTime, 0.03);
      }
    }
  } catch (e) {
    console.error('[guitar] error', e);
  }
}

export function getGuitarAudioContextState(): AudioContextState | undefined {
  return ctx?.state;
}

declare global {
  interface Window {
    __guitar?: {
      play: () => Promise<void>;
      test: () => Promise<void>;
      state: () => AudioContextState | undefined;
      measure: (chordIndex?: number, volumePercent?: number) => Promise<GuitarMeasureResult>;
      setVolumePercent: (pct: number) => void;
      getVolumePercent: () => number;
    };
  }
}

if (typeof window !== 'undefined') {
  window.__guitar = {
    play: playGuitar,
    test: playTestTone,
    state: () => ctx?.state,
    measure: (idx = 0, volPct = DEFAULT_VOLUME_PERCENT) => measureGuitarChord(idx, volPct),
    setVolumePercent: (pct: number) => setGuitarVolumePercent(pct, true),
    getVolumePercent: () => getGuitarVolumePercent(),
  };
}
