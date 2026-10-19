import assert from "node:assert/strict";
import test from "node:test";

import {
  INDONESIAN_PHONETIC_REPLACEMENTS,
  normalizeIndonesianPhonetic,
} from "../src/index.js";

test("normalizeIndonesianPhonetic replaces known Indonesian phonetic hallucinations accurately", () => {
  const cases: Array<[string, string]> = [
    [
      "badiatnya cristiano ronaldo itu 20 an dan nutriflex mengandung gula rem",
      "body age-nya cristiano ronaldo itu 20 an dan Nutriflakes mengandung gula aren",
    ],
    [
      "badiat nya cr seven adalah 20",
      "body age-nya CR7 adalah 20",
    ],
    [
      "cr tujuh minum nutriflek dengan gula aren nya manis",
      "CR7 minum Nutriflakes dengan gula aren-nya manis",
    ],
    [
      "dia beli memekoin dan degan di pasar",
      "dia beli meme coin dan degen di pasar",
    ],
    [
      "latihan buat iron man bareng samuel kris dan befan",
      "latihan buat Ironman 70.3 bareng Samuel Christ dan Bevan",
    ],
    [
      "podcast j e i bersama juan sen membahas porto saham",
      "podcast JEI bersama Juansen membahas portofolio saham",
    ],
    [
      "sepatu klaud kusion bevan pramudita",
      "sepatu Cloud Cushion Bevan Pramudito",
    ],
    [
      "ce er seven dan the gen beli meme koin",
      "CR7 dan degen beli meme coin",
    ],
  ];

  for (const [input, expected] of cases) {
    const actual = normalizeIndonesianPhonetic(input);
    assert.equal(actual, expected, `Failed for input: "${input}"`);
  }
});

test("normalizeIndonesianPhonetic handles edge cases gracefully", () => {
  // Empty or whitespace
  assert.equal(normalizeIndonesianPhonetic(""), "");
  assert.equal(normalizeIndonesianPhonetic("   "), "");

  // Multiple spaces and padding
  assert.equal(
    normalizeIndonesianPhonetic("  badiatnya    cr seven   porto  "),
    "body age-nya CR7 portofolio",
  );

  // Case insensitivity
  assert.equal(
    normalizeIndonesianPhonetic("BADIATNYA CR SEVEN NUTRIFLEX GULA REM"),
    "body age-nya CR7 Nutriflakes gula aren",
  );

  // Boundary safety: words containing 'porto' as substring like 'portofolio' shouldn't be altered
  assert.equal(
    normalizeIndonesianPhonetic("portofolio saya bagus"),
    "portofolio saya bagus",
  );

  // Non-string input
  // @ts-expect-error test non-string runtime safety
  assert.equal(normalizeIndonesianPhonetic(null), "");
  // @ts-expect-error test non-string runtime safety
  assert.equal(normalizeIndonesianPhonetic(undefined), "");
});

test("INDONESIAN_PHONETIC_REPLACEMENTS contains non-empty rules with valid regexes", () => {
  assert(INDONESIAN_PHONETIC_REPLACEMENTS.length >= 20);
  for (const rule of INDONESIAN_PHONETIC_REPLACEMENTS) {
    assert(rule.pattern instanceof RegExp);
    assert(typeof rule.replacement === "string");
    assert(rule.replacement.length > 0);
  }
});
