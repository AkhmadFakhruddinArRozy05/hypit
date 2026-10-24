# @hypit/provider-html-local

Trusted local implementation of:

- `@hypit/html-program@1#rasterize-visual` → `TimelineVisual`;
- `@hypit/html-program@1#rasterize-frames` → ordered PNG BlobRefs.

The Provider stages a typed `HtmlProgram`, applies absolute integer frames through
`window.__hypitFrameProgram`, and supplies compiler-declared video samples from a
bounded FFmpeg decode store. It supports two video export configurations:

| Configuration | Capture and encoding |
| --- | --- |
| `chromePath`, or managed Chrome selection | Puppeteer PNG capture and ordered FFmpeg H.264 encoding |
| `electronPath` | Electron shared GPU textures, Canvas cropping, WebCodecs H.264 encoding, FFmpeg MP4 muxing |

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

For GPU export, `auto` uses the admitted worker ceiling, limited by the requested
frame span. PNG capture adjusts its active workers using measured throughput.
GPU export requires `browserGpu: "auto"` or `"hardware"`, even canvas dimensions,
shared-texture support and a supported WebCodecs H.264 configuration. Unsupported
configurations fail with a diagnostic.

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
  "workers": 8,
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
loop and rational-rate video sampling. Decoded samples are leased under
`maxDecodedSourceBytes`; their images replace compiler-owned native video pixels.

The GPU path renders each Program in a fixed-size same-origin iframe. A separate
32-bit frame identifier below the authored viewport identifies the accepted
texture. Only its 8 KiB identifier region is read back to the CPU. Canvas crops
that region before creating the encoder's `VideoFrame`. Each worker retains at
most one frame waiting for ordered encoding. `maxPendingFrameBytes` bounds pending
compressed output, with one chunk allowed to exceed the budget. Scene surfaces
remain alive through the encoder flush.

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
image decodes. GPU capture additionally waits for two animation-frame callbacks
before updating its texture identifier. Authored asynchronous drawing must finish
inside the Program's frame completion hooks. Child pages rendered in another
renderer process are rejected by GPU capture; the iframe container makes
`window.top` refer to the capture shell.

## Direct use

```ts
import { rasterizeHtmlProgram } from "@hypit/provider-html-local";

const visual = await rasterizeHtmlProgram(
  { program, range: { startFrame: 240, endFrameExclusive: 360 } },
  { resources, electronPath: "/absolute/path/to/electron", workers: 8 },
);
```

Omit `range` for the complete program. Audio is prepared and muxed by
`@hypit/media-local` and the author assembly.
