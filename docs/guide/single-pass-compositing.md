---
title: Single-Pass In-Browser Compositing
description: Deterministic single-pass video rasterization eliminating WebM VP9 Alpha overhead.
---

# Single-Pass In-Browser Compositing

Single-Pass In-Browser Compositing is an architectural efficiency pattern in Hypit and Clipper OS that replaces traditional two-pass transparent overlay compositing with a unified, direct browser rasterization pass.

## Architecture Comparison

### Traditional Two-Pass Pipeline (Legacy WebM Alpha)
1. **Pass 1 (Base Cut)**: FFmpeg renders a 9:16 base cut MP4 (`base_cut.mp4`).
2. **Pass 2 (Overlay Render)**: Headless Chromium renders animated kinetic titles/subtitles into a transparent WebM video with VP9 Alpha channel (`yuva420p`).
3. **Pass 3 (Burn-In Composite)**: FFmpeg merges Pass 1 and Pass 2 via filter `[0:v][1:v]overlay=0:0:format=auto` and re-encodes to final H.264 MP4.

*Limitations*: Heavy CPU/GPU encoding overhead during VP9 alpha rendering, potential color drift, and duplicate re-encoding cycles.

### Single-Pass In-Browser Pipeline
1. **Unified DOM Layering**:
   - Base video resides directly within a native HTML5 `<video>` element (`z-index: 1`, covering the 1080x1920 canvas).
   - Motion typography, captions, badges, and kinetic highlights sit in overlay layers (`z-index: 10+`).
2. **Single Rasterization Pass**:
   - Headless Chromium rasterizes the entire composited DOM (video playback + animated layers) directly into the final MP4.
3. **Hardware Acceleration Adapter**:
   - macOS (Apple Silicon): Hardware accelerated encoding via VideoToolbox (`-hwaccel videotoolbox -c:v h264_videotoolbox -b:v 6000k -allow_sw 1`).
   - Linux (Cloud Runners): Deterministic CPU software fallback via libx264 (`-c:v libx264 -preset veryfast -crf 18`).
   - Notice: VideoToolbox rejects `-crf`, so constant bitrate (`-b:v 6000k`) is enforced under hardware acceleration.

## DOM Structure Example

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #root {
      width: 1080px;
      height: 1920px;
      background: #000;
      overflow: hidden;
    }
    .base-video {
      position: absolute;
      inset: 0;
      width: 1080px;
      height: 1920px;
      object-fit: cover;
      z-index: 1;
    }
    .caption-overlay {
      position: absolute;
      inset: 0;
      z-index: 10;
      pointer-events: none;
    }
  </style>
</head>
<body>
  <div id="root" data-composition-id="single-pass-clip" data-duration="30.0" data-width="1080" data-height="1920" data-fps="30">
    <video class="base-video" src="file:///path/to/master.mp4" muted autoplay playsinline></video>
    <div class="caption-overlay">
      <!-- Kinetic captions & motion elements rendered by GSAP / Hypit -->
    </div>
  </div>
</body>
</html>
```

## Contract Compliance & Audit Isolation

- **Gate 4 SHA-256 Binding**: Every rendered output generates an immutable `<output>.mp4.receipt.json` strictly binding the 1080p master source SHA-256 and final artifact hash.
- **Proxy Isolation**: Low-resolution 360p proxies used for scene-change detection or OCR never leak into the production manifest or receipt.
