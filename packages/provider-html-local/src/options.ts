export type HtmlWorkers = number | "auto";
export type HtmlQuality = "draft" | "standard" | "high";
export type HtmlBrowserGpu = "auto" | "software" | "hardware";

export type HtmlExecutionOptions = import("./browser.js").BrowserOptions & {
  /** Electron 45+ executable for shared-texture video export. PNG requests use Chrome. */
  readonly electronPath?: string;
  readonly ffprobePath?: string;
  /** FFmpeg command for source extraction, PNG video encoding and GPU stream muxing. */
  readonly ffmpegPath?: string;
  /** Parallel capture workers inside one render, separate from Provider request concurrency. */
  readonly workers?: HtmlWorkers;
  /** Upper bound for auto's browser reservation; explicit workers remain fixed. */
  readonly maxWorkers?: number;
  readonly quality?: HtmlQuality;
  /** Browser rasterizer, default hardware. Use software for PNG capture without a usable GPU. */
  readonly browserGpu?: HtmlBrowserGpu;
  readonly processTimeoutMs?: number;
  readonly initializationTimeoutMs?: number;
  readonly frameTimeoutMs?: number;
  readonly maxProcessOutputBytes?: number;
  /** Artifact staging lifecycles in flight inside one render. */
  readonly artifactStagingConcurrency?: number;
  /** Pending PNG bytes, or compressed bytes awaiting writes during GPU export. */
  readonly maxPendingFrameBytes?: number;
  /** Bytes of decoded source PNGs resident in one render's reusable working set. */
  readonly maxDecodedSourceBytes?: number;
  readonly maxRenderedBytes?: number;
};
