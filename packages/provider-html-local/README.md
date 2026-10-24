# @hypit/provider-html-local

Trusted local implementation of:

- `@hypit/html-program@1#rasterize-visual` → `TimelineVisual`;
- `@hypit/html-program@1#rasterize-frames` → ordered PNG BlobRefs.

The Provider stages a typed `HtmlProgram`, applies absolute integer frames through
`window.__hypitFrameProgram`, and supplies compiler-declared video samples.
It supports two video export configurations:

| Configuration | Source video | Capture and encoding |
| --- | --- | --- |
| `chromePath`, or managed Chrome selection | Bounded FFmpeg PNG decode store | Puppeteer PNG capture and ordered FFmpeg H.264 encoding |
| `electronPath` | Mediabunny demuxing, WebCodecs decoding, Canvas video layers | Electron shared GPU textures, Canvas cropping, WebCodecs H.264 encoding, FFmpeg MP4 muxing |

PNG frame requests use the selected Chrome browser. Filesystem staging, source
probing and decoded-frame leases belong to this Provider.

## Runtime configuration

The Endpoint facet is `rasterize`. Runtime configuration owns execution policy:

- `workers`: fixed worker count or `auto`;
- `maxWorkers`: automatic ceiling;
- `defaultConcurrency`: whole requests admitted in this Endpoint pool;
- `browserCapacity`: worker slots reserved across admitted requests;
- `chromePath`, or exact `browserVersion` plus `browserCacheDirectory`;
- `electronPath`: an installed Electron 45+ distribution executable, enabling GPU video export;
- `ffmpegPath` and `ffprobePath`;
- optional process/stage deadlines and byte budgets.

For GPU export with declared video sources, `auto` uses one scene worker, sharing
its source decoders and cache across the timeline. Pure motion graphics use
parallel scenes up to the admitted worker ceiling. An explicit worker count
enables that many scenes, limited by the requested frame span. PNG capture adjusts its
active workers using measured throughput.
GPU export requires `browserGpu: "auto"` or `"hardware"`, even canvas dimensions,
shared-texture support, browser support for each source codec and a supported
WebCodecs H.264 configuration. Unsupported configurations fail with a diagnostic.

The Chrome recommendation is stored as `hypit.htmlBrowser.version`. Managed Chrome
defaults to `~/.cache/hypit/html-rasterizer/chrome`; its ManagedProgram state is
stored below `.hypit-html-browser-program`. Browser installation occurs through
explicit Runtime preparation:

```sh
hypit programs prepare --runtime ./hypit.runtime.json --endpoint html.local
```

`chromePath` selects a user-managed Chrome executable; `browserVersion` selects
one exact managed Chrome for Testing version. These selections are mutually
exclusive. `electronPath` is configured separately and is checked during Runtime
inspection. Relative executable paths in Runtime configuration resolve against
the Runtime data root.

Example `html.local` Endpoint configuration:

```json
{
  "electronPath": "/absolute/path/to/electron",
  "workers": "auto",
  "quality": "standard"
}
```

On macOS the executable is inside `Electron.app/Contents/MacOS/Electron`; on
Windows it is `electron.exe`; on Linux it is `electron`. Electron's shared-texture
API is experimental. The integration has been exercised on macOS / Apple Silicon;
Windows and Linux require validation on their target GPU and driver combinations.
Linux additionally needs the display environment required by Electron.

## Frames and encoding

A continuous request retains original absolute frame identities. A sparse PNG
request accepts strictly increasing, non-contiguous frames. Workers can start at
any requested frame. The compiler's `frameSources` plan determines reverse, hold,
loop and rational-rate video sampling. PNG capture leases decoded images under
`maxDecodedSourceBytes` and places them over compiler-owned video elements.

GPU capture decodes source video inside each scene renderer. Chromium selects
hardware or software decoding according to source support. Forward sampling
reuses a decoder; reverse sampling decodes bounded forward intervals into a
sample cache. Holds and loops reuse cached samples. Canvas layers retain the
video elements' styles and placement. Inactive sources release their decoders.
`maxDecodedSourceBytes` is divided across workers and bounds retained sample
bytes, allowing one oversized sample per worker. Decoder queues, demuxer caches
and compositor surfaces require additional memory. Worker count also multiplies
source decoding; more workers can reduce throughput for video-heavy projects.

Source color tags are preserved. Untagged SDR uses a BT.601 matrix and sRGB
transfer. Planar alpha samples retain source color metadata through an in-memory
copy before Canvas composition. Mediabunny 1.62.1 is distributed under
[MPL-2.0](https://github.com/Vanilagy/mediabunny/blob/main/LICENSE).

The GPU path renders each Program in a fixed-size same-origin iframe. A separate
32-bit frame identifier below the authored viewport identifies the accepted
texture. Only its 8 KiB identifier region is read back to the CPU. Canvas crops
that region before creating an immutable `VideoFrame` snapshot. Scenes can
prepare subsequent frames while a shared queue feeds snapshots to the encoder
in timeline order. Admission reserves space for the next required frame to
prevent later frames from blocking it.

`maxPendingFrameBytes` controls admission using queued snapshot pixels and pending
compressed output. One oversized snapshot can enter an empty queue. Encoding
already in progress can produce compressed chunks above that admission threshold;
native encoder buffers and compositor surfaces require additional memory. Each
worker releases source decoders and samples when its capture completes. Scene
surfaces remain alive through the encoder flush.

WebCodecs uses H.264 High with `quality` latency and a hardware preference.
At 1920 × 1080 / 30 fps, `quality` selects target bitrates of 6 Mbps (`draft`),
12 Mbps (`standard`), or 24 Mbps (`high`). Targets scale with pixel count and frame
rate, with a 64 Kbps minimum. Actual hardware encoder availability is determined
by Chromium. FFmpeg assigns the requested rational frame time base and muxes the
encoded stream. PNG video export uses x264 CRF 28, 23, or 18 respectively.
These settings do not imply identical rate control or picture quality.

For PNG video capture, `maxPendingFrameBytes` bounds the ordered PNG queue.
`maxRenderedBytes` limits the final MP4 or total requested PNG bytes; GPU capture
also checks compressed bytes as they arrive. Output validation decodes every frame
and verifies dimensions, codec, exact frame rate and frame count before storage.

## Lifecycle and page readiness

Each request owns its temporary directory, localhost server, browser processes,
decoded-frame store and encoder. Cancellation and failure stop that execution and
release its resources. Process-tree cleanup is best effort after abnormal exits;
hard OS termination requires containment supplied by the deployment.

Frame preparation waits for page frame listeners, declared fonts and dynamic
image decodes. GPU capture updates its texture identifier after preparation and
accepts a shared surface only when its identifier matches. The authored page and
identifier participate in the same local frame-tree rendering update.
Authored asynchronous drawing must finish
inside the Program's frame completion hooks. Child pages rendered in another
renderer process are rejected by GPU capture; the iframe container makes
`window.top` refer to the capture shell.

## Direct use

```ts
import { rasterizeHtmlProgram } from "@hypit/provider-html-local";

const visual = await rasterizeHtmlProgram(
  { program, range: { startFrame: 240, endFrameExclusive: 360 } },
  { resources, electronPath: "/absolute/path/to/electron", workers: "auto" },
);
```

Omit `range` for the complete program. Audio is prepared and muxed by
`@hypit/media-local` and the author assembly.
