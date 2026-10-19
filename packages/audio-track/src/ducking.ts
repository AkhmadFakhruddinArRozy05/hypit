import type { AudioGainPoint } from "@hypit/composition";

/**
 * Audio Ducking Helper for @hypit/audio-track.
 * Calculates BGM volume reduction envelope (-16dB / ~0.15 gain) during vocal speech intervals,
 * with standard 0.15s attack and 0.40s release transitions.
 */

export const DEFAULT_NOMINAL_GAIN = 1.0;
export const DEFAULT_DUCK_GAIN = 0.15; // -16.48 dB (standard speech ducking level)
export const DEFAULT_ATTACK_SEC = 0.15; // 150ms attack
export const DEFAULT_RELEASE_SEC = 0.40; // 400ms release
export const DEFAULT_SAMPLE_RATE = 48000; // Standard 48 kHz program clock

export type VocalInterval = {
  readonly startSec: number;
  readonly endSec: number;
};

export type DuckingOptions = {
  /** Nominal resting BGM gain when no vocal is active. Default: 1.0. */
  readonly nominalGain?: number;
  /** Ducked BGM gain when vocal is active. Default: 0.15 (-16dB). */
  readonly duckedGain?: number;
  /** Attack time in seconds: transition duration from nominalGain down to duckedGain. Default: 0.15s. */
  readonly attackSec?: number;
  /** Release time in seconds: transition duration from duckedGain back up to nominalGain. Default: 0.40s. */
  readonly releaseSec?: number;
  /** Audio clock sample rate for converting to sample frames. Default: 48000 Hz. */
  readonly sampleRate?: number;
};

export type DuckingTimePoint = {
  readonly timeSec: number;
  readonly gain: number;
};

/**
 * Computes instantaneous ducked gain at any specific time coordinate.
 */
export function computeDuckedGainAt(
  timeSec: number,
  intervals: readonly VocalInterval[],
  options?: DuckingOptions,
): number {
  const nominalGain = options?.nominalGain ?? DEFAULT_NOMINAL_GAIN;
  const duckedGain = options?.duckedGain ?? DEFAULT_DUCK_GAIN;
  const attackSec = options?.attackSec ?? DEFAULT_ATTACK_SEC;
  const releaseSec = options?.releaseSec ?? DEFAULT_RELEASE_SEC;

  if (timeSec < 0) return nominalGain;
  if (!Array.isArray(intervals) || intervals.length === 0) return nominalGain;

  let currentGain = nominalGain;

  for (const interval of intervals) {
    if (interval.endSec <= interval.startSec) continue;

    const start = interval.startSec;
    const end = interval.endSec;
    const attackStart = Math.max(0, start - attackSec);
    const releaseEnd = end + releaseSec;

    let intervalGain = nominalGain;

    if (timeSec < attackStart || timeSec > releaseEnd) {
      intervalGain = nominalGain;
    } else if (timeSec >= start && timeSec <= end) {
      intervalGain = duckedGain;
    } else if (timeSec >= attackStart && timeSec < start) {
      // Attack phase: ramp down from nominalGain to duckedGain
      const progress = attackSec > 0 ? (timeSec - attackStart) / attackSec : 1;
      intervalGain = nominalGain - (nominalGain - duckedGain) * Math.min(1, Math.max(0, progress));
    } else if (timeSec > end && timeSec <= releaseEnd) {
      // Release phase: ramp up from duckedGain to nominalGain
      const progress = releaseSec > 0 ? (timeSec - end) / releaseSec : 1;
      intervalGain = duckedGain + (nominalGain - duckedGain) * Math.min(1, Math.max(0, progress));
    }

    if (intervalGain < currentGain) {
      currentGain = intervalGain;
    }
  }

  return Math.round(currentGain * 10000) / 10000;
}

/**
 * Computes ducked gain keyframes in seconds for the entire timeline.
 */
export function computeDuckedTimeEnvelope(
  durationSec: number,
  intervals: readonly VocalInterval[],
  options?: DuckingOptions,
): readonly DuckingTimePoint[] {
  if (durationSec <= 0) return [{ timeSec: 0, gain: options?.nominalGain ?? DEFAULT_NOMINAL_GAIN }];

  const attackSec = options?.attackSec ?? DEFAULT_ATTACK_SEC;
  const releaseSec = options?.releaseSec ?? DEFAULT_RELEASE_SEC;

  const rawTimes = new Set<number>([0, durationSec]);

  if (Array.isArray(intervals)) {
    for (const interval of intervals) {
      if (interval.endSec <= interval.startSec) continue;
      const s = Math.max(0, Math.min(durationSec, interval.startSec));
      const e = Math.max(0, Math.min(durationSec, interval.endSec));
      const att = Math.max(0, Math.min(durationSec, interval.startSec - attackSec));
      const rel = Math.max(0, Math.min(durationSec, interval.endSec + releaseSec));

      rawTimes.add(att);
      rawTimes.add(s);
      rawTimes.add(e);
      rawTimes.add(rel);
    }
  }

  const sortedTimes = Array.from(rawTimes).sort((a, b) => a - b);
  return sortedTimes.map((timeSec) => ({
    timeSec,
    gain: computeDuckedGainAt(timeSec, intervals, options),
  }));
}

/**
 * Generates an AudioGainPoint envelope measured on the 48 kHz program sample clock.
 * Conforms to @hypit/composition AudioGainPoint specification (strictly increasing sample indices).
 */
export function computeDuckedGainEnvelope(
  durationSec: number,
  intervals: readonly VocalInterval[],
  options?: DuckingOptions,
): readonly AudioGainPoint[] {
  const sampleRate = options?.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const timePoints = computeDuckedTimeEnvelope(durationSec, intervals, options);

  const samplePoints: AudioGainPoint[] = [];
  const totalSamples = Math.round(durationSec * sampleRate);

  for (const tp of timePoints) {
    const sample = Math.min(totalSamples, Math.max(0, Math.round(tp.timeSec * sampleRate)));
    const previous = samplePoints.at(-1);

    if (previous !== undefined && previous.sample === sample) {
      // Merge collision on same integer sample frame: prioritize deeper ducking (lower gain)
      samplePoints[samplePoints.length - 1] = {
        sample,
        gain: Math.min(previous.gain, tp.gain),
      };
    } else {
      samplePoints.push({ sample, gain: tp.gain });
    }
  }

  if (samplePoints.length === 0 || samplePoints[0]!.sample !== 0) {
    samplePoints.unshift({
      sample: 0,
      gain: computeDuckedGainAt(0, intervals, options),
    });
  }

  if (samplePoints.at(-1)!.sample !== totalSamples) {
    samplePoints.push({
      sample: totalSamples,
      gain: computeDuckedGainAt(durationSec, intervals, options),
    });
  }

  return samplePoints;
}
