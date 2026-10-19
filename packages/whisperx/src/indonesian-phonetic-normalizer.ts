/**
 * Indonesian Phonetic & Slang Normalizer for WhisperX Transcriptions.
 * Corrects common Whisper misalignments, slang, and brand terms in Indonesian creator content.
 */

export type PhoneticReplacementRule = {
  readonly pattern: RegExp;
  readonly replacement: string;
};

export const INDONESIAN_PHONETIC_REPLACEMENTS: readonly PhoneticReplacementRule[] = [
  { pattern: /\bbadiat\s*nya\b/gi, replacement: "body age-nya" },
  { pattern: /\bbadiatnya\b/gi, replacement: "body age-nya" },
  { pattern: /\bbody\s+edge\b/gi, replacement: "body age" },
  { pattern: /\bnutriflexs?\b/gi, replacement: "Nutriflakes" },
  { pattern: /\bnutriflek\b/gi, replacement: "Nutriflakes" },
  { pattern: /\bgula\s+rem\b/gi, replacement: "gula aren" },
  { pattern: /\bgula\s+aren\s+nya\b/gi, replacement: "gula aren-nya" },
  { pattern: /\bcr\s+seven\b/gi, replacement: "CR7" },
  { pattern: /\bce\s+er\s+seven\b/gi, replacement: "CR7" },
  { pattern: /\bcr\s+tujuh\b/gi, replacement: "CR7" },
  { pattern: /\bdegan\b/gi, replacement: "degen" },
  { pattern: /\bdejen\b/gi, replacement: "degen" },
  { pattern: /\bthe\s+gen\b/gi, replacement: "degen" },
  { pattern: /\bmemekoin\b/gi, replacement: "meme coin" },
  { pattern: /\bmeme\s+koin\b/gi, replacement: "meme coin" },
  { pattern: /\bmimi\s+koin\b/gi, replacement: "meme coin" },
  { pattern: /\biron\s+man\b/gi, replacement: "Ironman 70.3" },
  { pattern: /\bairon\s+men\b/gi, replacement: "Ironman 70.3" },
  { pattern: /\bklaud\s+kusion\b/gi, replacement: "Cloud Cushion" },
  { pattern: /\bcloud\s+kusyen\b/gi, replacement: "Cloud Cushion" },
  { pattern: /\bsamuel\s+kris\b/gi, replacement: "Samuel Christ" },
  { pattern: /\bsamuel\s+chris\b/gi, replacement: "Samuel Christ" },
  { pattern: /\bbefan\b/gi, replacement: "Bevan" },
  { pattern: /\bbevan\s+pramudita\b/gi, replacement: "Bevan Pramudito" },
  { pattern: /\bj\s+e\s+i\b/gi, replacement: "JEI" },
  { pattern: /\bje\s+i\b/gi, replacement: "JEI" },
  { pattern: /\bjey\b/gi, replacement: "JEI" },
  { pattern: /\bjuan\s+sen\b/gi, replacement: "Juansen" },
  { pattern: /\bjuwan\s+sen\b/gi, replacement: "Juansen" },
  { pattern: /\bjuansen\b/gi, replacement: "Juansen" },
  { pattern: /\bporto\b/gi, replacement: "portofolio" },
];

/**
 * Normalizes Indonesian phonetic transcriptions and replaces slang/brand hallucinations.
 */
export function normalizeIndonesianPhonetic(text: string): string {
  if (typeof text !== "string") return "";
  let normalized = text;
  for (const { pattern, replacement } of INDONESIAN_PHONETIC_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }
  return normalized.replace(/\s+/g, " ").trim();
}
