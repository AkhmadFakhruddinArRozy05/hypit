/** Installed inside the scene renderer; decoded samples stay in the browser. */
export async function installBrowserVideo(moduleUrl, maxBytes) {
  const media = await import(moduleUrl);
  const sources = new Map();
  const cache = new Map();
  let resident = 0, samplesRead = 0, decoderStarts = 0, cacheHits = 0, peak = 0;
  const open = (url) => {
    let pending = sources.get(url);
    if (pending === undefined) {
      pending = (async () => {
        const input = new media.Input({ source: new media.UrlSource(url), formats: media.ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (track === null || !await track.canDecode()) {
          input.dispose();
          throw new Error(`Browser video decoder does not support ${url}`);
        }
        // Untagged SDR follows the FFmpeg source path's BT.601 matrix and sRGB transfer.
        const decoderConfig = track.getDecoderConfig.bind(track);
        track.getDecoderConfig = async () => {
          const config = await decoderConfig();
          if (!config) return config;
          return { ...config, colorSpace: {
            primaries: config.colorSpace?.primaries ?? "bt709",
            transfer: config.colorSpace?.transfer ?? "iec61966-2-1",
            matrix: config.colorSpace?.matrix ?? "smpte170m",
            fullRange: config.colorSpace?.fullRange ?? false,
          } };
        };
        return { input, sink: new media.VideoSampleSink(track, { hardwareAcceleration: "prefer-hardware" }),
          colorSpace: (await track.getDecoderConfig())?.colorSpace,
          firstTimestamp: await track.getFirstTimestamp(), width: track.displayWidth, height: track.displayHeight };
      })();
      sources.set(url, pending);
    }
    return pending;
  };
  const retain = (key, sample, protectedKey) => {
    const previous = cache.get(key);
    if (previous !== undefined) {
      sample.close();
      return;
    }
    const bytes = sample.allocationSize();
    while (resident + bytes > maxBytes) {
      const victim = [...cache.keys()].find(key => key !== protectedKey);
      if (victim === undefined) {
        if (key !== protectedKey) { sample.close(); return; }
        break;
      }
      const entry = cache.get(victim);
      entry.sample.close();
      resident -= entry.bytes;
      cache.delete(victim);
    }
    cache.set(key, { sample, bytes });
    resident += bytes;
    peak = Math.max(peak, resident);
  };
  const readSample = async (source, timestamp) => {
    if (!source.iterator || timestamp < source.current?.timestamp || timestamp - source.current?.timestamp > 2) {
      if (source.iterator) await source.iterator.return();
      source.current?.close(); source.next?.close();
      decoderStarts++;
      source.iterator = source.sink.samples(timestamp);
      source.current = (await source.iterator.next()).value;
      source.next = (await source.iterator.next()).value;
      if (source.current) samplesRead++;
      if (source.next) samplesRead++;
    }
    while (source.next && source.next.timestamp <= timestamp) {
      source.current?.close();
      source.current = source.next;
      source.next = (await source.iterator.next()).value;
      if (source.next) samplesRead++;
    }
    if (!source.current) throw new Error(`Browser video has no sample at ${timestamp}`);
    const sample = source.current;
    // Planar alpha samples need the source color tags before RGB conversion.
    if (/^I\d{3}A/.test(sample.format)) {
      const bytes = new Uint8Array(sample.allocationSize());
      const layout = await sample.copyTo(bytes);
      return new media.VideoSample(bytes, { format: sample.format, codedWidth: sample.codedWidth,
        codedHeight: sample.codedHeight, timestamp: sample.timestamp, duration: sample.duration,
        rotation: sample.rotation, flip: sample.flip, visibleRect: sample.visibleRect,
        displayWidth: sample.displayWidth, displayHeight: sample.displayHeight,
        colorSpace: source.colorSpace, layout });
    }
    return sample.clone();
  };
  const w = window;
  w.__hypitVideoStats = () => ({ samplesRead, decoderStarts, cacheHits, peak });
  w.__hypitDrawVideoSources = async (updates) => {
    const active = new Set(updates.map(update => update.id));
    const activeUrls = new Set(updates.map(update => update.url));
    for (const [url, pending] of sources) {
      if (activeUrls.has(url)) continue;
      const source = await pending;
      source.current?.close(); source.next?.close();
      await source.iterator?.return();
      source.input.dispose(); sources.delete(url);
    }
    for (const canvas of Array.from(document.querySelectorAll("[data-hypit-source-frame-canvas]"))) {
      if (!active.has(canvas.dataset.hypitSourceFrameCanvas) && canvas.style.display !== "none") {
        canvas.style.display = "none";
        canvas.width = canvas.height = 1;
      }
    }
    for (const update of updates) {
      const selection = update.sample;
      if (selection === undefined)
        throw new Error("Browser video sampling metadata is missing");
      const source = await open(update.url);
      const keyFor = (frame) => `${update.url}:${frame}`;
      const key = keyFor(selection.frame);
      if (!cache.has(key)) {
        // Reverse playback decodes a bounded forward interval, then reuses its samples.
        const count = selection.reverse ? Math.max(1, Math.min(64,
          Math.floor(maxBytes / Math.max(1, activeUrls.size) / (source.sampleBytes ?? source.width * source.height * 4)))) : 1;
        const start = selection.reverse ? Math.max(0, selection.frame - count + 1) : selection.frame;
        const length = selection.reverse ? selection.frame - start + 1 : count;
        const timestamps = Array.from({ length }, (_, index) => source.firstTimestamp
          + (start + index + 0.5) * selection.fps.den / selection.fps.num);
        for (let index = 0; index < timestamps.length; index++) {
          const sample = await readSample(source, timestamps[index]);
          source.sampleBytes = sample.allocationSize();
          retain(keyFor(start + index), sample, key);
        }
      } else cacheHits++;
      const entry = cache.get(key);
      if (entry === undefined)
        throw new Error("Browser video cache lost a requested sample");
      cache.delete(key);
      cache.set(key, entry);
      const video = document.getElementById(update.id);
      if (video === null)
        throw new Error(`HTML Program source element ${update.id} is missing`);
      let canvas = document.querySelector(`[data-hypit-source-frame-canvas="${CSS.escape(update.id)}"]`);
      if (canvas === null) {
        canvas = document.createElement("canvas");
        canvas.dataset.hypitSourceFrameCanvas = update.id;
        video.insertAdjacentElement("afterend", canvas);
      }
      canvas.className = video.className;
      canvas.style.cssText = video.style.cssText;
      canvas.style.visibility = video.dataset.hypitAuthoredVisibility ?? video.style.visibility;
      canvas.style.display = video.style.display;
      if (canvas.width !== source.width)
        canvas.width = source.width;
      if (canvas.height !== source.height)
        canvas.height = source.height;
      video.style.visibility = "hidden";
      const context = canvas.getContext("2d");
      if (context === null)
        throw new Error("Browser video canvas could not be created");
      context.clearRect(0, 0, canvas.width, canvas.height);
      entry.sample.draw(context, 0, 0, canvas.width, canvas.height);
    }
  };
  window.addEventListener("pagehide", () => {
    for (const entry of cache.values())
      entry.sample.close();
    cache.clear();
    for (const source of sources.values())
      void source.then(value => { value.current?.close(); value.next?.close(); void value.iterator?.return(); value.input.dispose(); });
  }, { once: true });
}
