// Records the canvas to a WebM clip via captureStream + MediaRecorder.
// Captures whatever is animating in realtime for `durationMs`, then downloads.
export function recordWebm(
  canvas: HTMLCanvasElement,
  durationMs: number,
  fps = 30,
  filename = "geist-pixel.webm",
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof MediaRecorder === "undefined" || !canvas.captureStream) {
      reject(new Error("Video recording not supported in this browser"));
      return;
    }
    const mime = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]
      .find((m) => MediaRecorder.isTypeSupported(m));
    if (!mime) {
      reject(new Error("No supported WebM codec"));
      return;
    }

    const stream = canvas.captureStream(fps);
    const rec = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onerror = () => reject(new Error("Recording failed"));
    rec.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    };

    rec.start();
    setTimeout(() => rec.stop(), durationMs);
  });
}
