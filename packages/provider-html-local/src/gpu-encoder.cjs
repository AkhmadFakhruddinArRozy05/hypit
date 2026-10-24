const { ipcRenderer, sharedTexture, contextBridge } = require("electron");

let encoder, options, canvas, context, failure;
let nextOrdinal = 0, pendingBytes = 0;
const turns = new Map(), output = new Set(), capacity = new Set();
const notify = () => { for (const wake of capacity) wake(); capacity.clear(); };
function check() { if (failure) throw failure; }
function fail(error) {
  if (failure) return;
  failure = error;
  for (const turn of turns.values()) turn.reject(error);
  turns.clear(); notify();
  ipcRenderer.send("hypit-capture-error", String(error.stack ?? error));
}

ipcRenderer.on("hypit-configure", async (_event, input) => {
  try {
    options = input;
    const config = { codec: "avc1.640034", width: input.width, height: input.height, bitrate: input.bitrate,
      framerate: input.fps, latencyMode: "quality", hardwareAcceleration: "prefer-hardware", avc: { format: "annexb" } };
    if (!(await VideoEncoder.isConfigSupported(config)).supported) {
      throw Error("The selected Electron/GPU does not support the requested H.264 encoding configuration");
    }
    canvas = new OffscreenCanvas(input.width, input.height);
    context = canvas.getContext("2d", { alpha: false, colorSpace: "srgb" });
    if (!context) throw Error("GPU encoder canvas is unavailable");
    context.imageSmoothingEnabled = false;
    encoder = new VideoEncoder({ error: fail, output(chunk) {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes); pendingBytes += bytes.length;
      const sent = ipcRenderer.invoke("hypit-encoded", bytes, chunk.timestamp).catch(fail).finally(() => {
        pendingBytes -= bytes.length; output.delete(sent); notify();
      });
      output.add(sent);
    } });
    encoder.configure(config);
    ipcRenderer.send("hypit-configured");
  } catch (error) { fail(error); }
});

sharedTexture.setSharedTextureReceiver(async ({ importedSharedTexture: imported }, request) => {
  let source, frame;
  try {
    check();
    source = imported.getVideoFrame();
    if (!["BGRA", "BGRX", "RGBA", "RGBX"].includes(source.format)) {
      throw Error(`Unsupported shared texture pixel format: ${source.format}`);
    }
    if (source.displayWidth !== Math.max(options.width, 256) || source.displayHeight !== options.height + 8) {
      ipcRenderer.send("hypit-observed", request.token, false); return;
    }
    // Read only the renderer-owned identifier, then crop it from the GPU image.
    const rect = { x: 0, y: options.height, width: 256, height: 8 };
    const bytes = new Uint8Array(source.allocationSize({ rect }));
    const [plane] = await source.copyTo(bytes, { rect });
    let token = 0, valid = true;
    for (let bit = 0; bit < 32; bit++) {
      const x = (bit * 8 + 4) * 4;
      const top = bytes[plane.offset + 2 * plane.stride + x], bottom = bytes[plane.offset + 6 * plane.stride + x];
      if (top > 224 && bottom < 32) token += 2 ** bit;
      else if (!(top < 32 && bottom > 224)) valid = false;
    }
    if (!valid || token !== request.token) {
      ipcRenderer.send("hypit-observed", request.token, false); return;
    }
    if (request.ordinal !== nextOrdinal) {
      await new Promise((resolve, reject) => turns.set(request.ordinal, { resolve, reject }));
    }
    check();
    while (pendingBytes > options.maxPendingBytes) { await new Promise(resolve => capacity.add(resolve)); check(); }
    context.drawImage(source, 0, 0, options.width, options.height, 0, 0, options.width, options.height);
    const timestamp = Math.round(request.ordinal * 1e6 / options.fps);
    const end = Math.round((request.ordinal + 1) * 1e6 / options.fps);
    frame = new VideoFrame(canvas, { timestamp, duration: end - timestamp });
    encoder.encode(frame, { keyFrame: request.ordinal % Math.max(1, Math.round(options.fps * 2)) === 0 });
    frame.close(); frame = undefined;
    while (encoder.encodeQueueSize > 8) {
      await new Promise(resolve => encoder.addEventListener("dequeue", resolve, { once: true })); check();
    }
    nextOrdinal++;
    turns.get(nextOrdinal)?.resolve(); turns.delete(nextOrdinal);
    ipcRenderer.send("hypit-observed", request.token, true);
  } catch (error) { fail(error); }
  finally { frame?.close(); source?.close(); imported.release(); }
});

contextBridge.exposeInMainWorld("__hypitFinishEncoding", async () => {
  check(); await encoder.flush(); await Promise.all(output); check(); encoder.close(); return nextOrdinal;
});
window.addEventListener("DOMContentLoaded", () => ipcRenderer.send("hypit-encoder-ready"));
