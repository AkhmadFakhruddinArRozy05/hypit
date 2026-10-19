export { audioTrackComponent } from "./component.js";
export { createAudioTrackFragment, programAudioTrackFragment } from "./fragment.js";
export type { AudioTrackFragmentItem } from "./fragment.js";
export { audioClipSpecSchema, audioSourceTimeSchema, audioTrackDependency, audioTrackHeaderSchema, audioTrackManifest, audioTrackMarkupSurfaces, audioTrackModuleRef, audioTrackProducers, audioTrackProgramSchema, audioTrackSetSchema, audioTrackTypes } from "./manifest.js";
export { decodeAudioSourceTimeRelation, decodeAudioSourceTimeSurface, decodeAudioTrackSurface, audioClipDefaults } from "./surface.js";
export { appendAudioClip, assertAudioClipSpec, assertAudioTrackHeader, assertAudioTrackProgram, assertAudioTrackSet, createAudioTrackSet, finalizeAudioTrack, renderAudioTrack, sealAudioClipSpec, sealAudioTrackHeader, sealAudioTrackProgram } from "./program.js";
export { assertAudioSourceTimeSpec, defaultAudioSourceTimeSpec, resolveAudioSourceTime } from "./source-time.js";
export {
  DEFAULT_NOMINAL_GAIN,
  DEFAULT_DUCK_GAIN,
  DEFAULT_ATTACK_SEC,
  DEFAULT_RELEASE_SEC,
  DEFAULT_SAMPLE_RATE,
  computeDuckedGainAt,
  computeDuckedTimeEnvelope,
  computeDuckedGainEnvelope,
} from "./ducking.js";
export type {
  VocalInterval,
  DuckingOptions,
  DuckingTimePoint,
} from "./ducking.js";
export type * from "./types.js";
