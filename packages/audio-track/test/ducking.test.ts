import { assertAudioLevelAutomation } from "@hypit/composition";
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ATTACK_SEC,
  DEFAULT_DUCK_GAIN,
  DEFAULT_NOMINAL_GAIN,
  DEFAULT_RELEASE_SEC,
  DEFAULT_SAMPLE_RATE,
  computeDuckedGainAt,
  computeDuckedGainEnvelope,
  computeDuckedTimeEnvelope,
} from "../src/index.js";

test("audio ducking maintains nominal gain when no vocal intervals exist", () => {
  assert.equal(computeDuckedGainAt(0, []), DEFAULT_NOMINAL_GAIN);
  assert.equal(computeDuckedGainAt(5.5, []), DEFAULT_NOMINAL_GAIN);
  assert.equal(computeDuckedGainAt(10, []), DEFAULT_NOMINAL_GAIN);

  const envelope = computeDuckedGainEnvelope(10, []);
  assert(envelope.length >= 2);
  assert.equal(envelope[0]!.sample, 0);
  assert.equal(envelope[0]!.gain, DEFAULT_NOMINAL_GAIN);
  assert.equal(envelope.at(-1)!.sample, 10 * DEFAULT_SAMPLE_RATE);
  assert.equal(envelope.at(-1)!.gain, DEFAULT_NOMINAL_GAIN);
});

test("audio ducking calculates accurate gain during vocal, attack, and release phases", () => {
  const vocal = [{ startSec: 2.0, endSec: 4.0 }];

  // Way before vocal: nominal gain 1.0
  assert.equal(computeDuckedGainAt(1.0, vocal), DEFAULT_NOMINAL_GAIN);

  // Attack starts at startSec - attackSec (2.0 - 0.15 = 1.85)
  assert.equal(computeDuckedGainAt(1.85, vocal), DEFAULT_NOMINAL_GAIN);

  // Mid attack at 1.925: halfway between 1.0 and 0.15 = 0.575
  const midAttackGain = computeDuckedGainAt(1.925, vocal);
  assert(midAttackGain > DEFAULT_DUCK_GAIN && midAttackGain < DEFAULT_NOMINAL_GAIN);
  assert.equal(midAttackGain, 0.575);

  // During vocal: exactly ducked gain 0.15
  assert.equal(computeDuckedGainAt(2.0, vocal), DEFAULT_DUCK_GAIN);
  assert.equal(computeDuckedGainAt(3.0, vocal), DEFAULT_DUCK_GAIN);
  assert.equal(computeDuckedGainAt(4.0, vocal), DEFAULT_DUCK_GAIN);

  // Mid release at 4.20 (half of 0.40s release): halfway between 0.15 and 1.0 = 0.575
  const midReleaseGain = computeDuckedGainAt(4.20, vocal);
  assert(midReleaseGain > DEFAULT_DUCK_GAIN && midReleaseGain < DEFAULT_NOMINAL_GAIN);
  assert.equal(midReleaseGain, 0.575);

  // Release finishes at endSec + releaseSec (4.0 + 0.40 = 4.40)
  assert.equal(computeDuckedGainAt(4.40, vocal), DEFAULT_NOMINAL_GAIN);

  // After release: back to nominal
  assert.equal(computeDuckedGainAt(5.0, vocal), DEFAULT_NOMINAL_GAIN);
});

test("audio ducking handles overlapping / closely-spaced vocal intervals seamlessly", () => {
  // Interval 1: 1.0s to 2.0s. Interval 2 starts at 2.2s (during release of Interval 1)
  const intervals = [
    { startSec: 1.0, endSec: 2.0 },
    { startSec: 2.2, endSec: 3.5 },
  ];

  // At 2.1s (between the two), gain stays ducked or depressed, never bounces to 1.0
  const bridgeGain = computeDuckedGainAt(2.1, intervals);
  assert(bridgeGain < DEFAULT_NOMINAL_GAIN);
  assert(bridgeGain >= DEFAULT_DUCK_GAIN);

  // During second vocal, gain is at ducked level
  assert.equal(computeDuckedGainAt(2.5, intervals), DEFAULT_DUCK_GAIN);
});

test("computeDuckedGainEnvelope satisfies @hypit/composition level automation requirements", () => {
  const duration = 8.0;
  const intervals = [
    { startSec: 1.5, endSec: 3.0 },
    { startSec: 4.5, endSec: 6.0 },
  ];

  const envelope = computeDuckedGainEnvelope(duration, intervals);
  const totalSamples = Math.round(duration * DEFAULT_SAMPLE_RATE);

  // Check strictly increasing samples
  for (let i = 1; i < envelope.length; i++) {
    assert(
      envelope[i]!.sample > envelope[i - 1]!.sample,
      `Sample at index ${i} (${envelope[i]!.sample}) is not strictly greater than previous (${envelope[i - 1]!.sample})`,
    );
  }

  // Validate against @hypit/composition validator
  assertAudioLevelAutomation(
    { gainEnvelope: envelope },
    { startSample: 0, endSampleExclusive: totalSamples },
    totalSamples,
  );
});

test("computeDuckedTimeEnvelope handles edge cases gracefully", () => {
  // Negative duration
  const zeroEnv = computeDuckedTimeEnvelope(0, []);
  assert.equal(zeroEnv.length, 1);
  assert.equal(zeroEnv[0]!.timeSec, 0);

  // Invalid intervals (end <= start) are ignored
  const invalid = [{ startSec: 5.0, endSec: 4.0 }, { startSec: 2.0, endSec: 2.0 }];
  assert.equal(computeDuckedGainAt(3.0, invalid), DEFAULT_NOMINAL_GAIN);

  // Custom options
  const customOptions = {
    nominalGain: 0.8,
    duckedGain: 0.1,
    attackSec: 0.2,
    releaseSec: 0.5,
  };
  assert.equal(computeDuckedGainAt(0, [], customOptions), 0.8);
  assert.equal(computeDuckedGainAt(2.5, [{ startSec: 2.0, endSec: 3.0 }], customOptions), 0.1);
});
