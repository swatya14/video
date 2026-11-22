import type { ExportQuality, WatermarkRegion } from "../types/watermark";
import { applyWatermarkRemoval } from "./inpaintEngine";
import {
  DEMO_VIDEO_DURATION,
  DEMO_VIDEO_HEIGHT,
  DEMO_VIDEO_WIDTH,
  renderDemoVideoFrame,
} from "./demoVideo";

export interface ExportProgress {
  percent: number;
  currentTime: number;
  duration: number;
  etaSeconds: number;
  phase: "preparing" | "rendering" | "finalizing";
}

export interface ExportResult {
  blob: Blob;
  url: string;
  mimeType: string;
  extension: string;
  fileName: string;
  sizeBytes: number;
}

export function detectBestMimeType(preferredFormat: "auto" | "mp4" | "webm"): {
  mimeType: string;
  extension: string;
} {
  const candidates =
    preferredFormat === "mp4"
      ? [
          { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
          { mimeType: "video/mp4", extension: "mp4" },
          { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
          { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
          { mimeType: "video/webm", extension: "webm" },
        ]
      : preferredFormat === "webm"
        ? [
            { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
            { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
            { mimeType: "video/webm", extension: "webm" },
          ]
        : [
            { mimeType: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", extension: "mp4" },
            { mimeType: "video/mp4", extension: "mp4" },
            { mimeType: "video/webm;codecs=vp9,opus", extension: "webm" },
            { mimeType: "video/webm;codecs=vp8,opus", extension: "webm" },
            { mimeType: "video/webm", extension: "webm" },
          ];

  if (typeof MediaRecorder !== "undefined") {
    for (const c of candidates) {
      if (MediaRecorder.isTypeSupported(c.mimeType)) {
        return c;
      }
    }
  }
  return { mimeType: "video/webm", extension: "webm" };
}

function getBitrate(quality: ExportQuality, width: number, height: number): number {
  const pixels = width * height;
  const scale = pixels > 1920 * 1080 ? 1.8 : pixels >= 1280 * 720 ? 1.0 : 0.65;
  switch (quality) {
    case "high":
      return Math.round(12_000_000 * scale);
    case "balanced":
      return Math.round(6_500_000 * scale);
    case "compact":
      return Math.round(3_200_000 * scale);
  }
}

export async function exportCleanedVideo(options: {
  sourceType: "file" | "demo";
  sourceUrl?: string;
  sourceName: string;
  width: number;
  height: number;
  duration: number;
  regions: WatermarkRegion[];
  quality: ExportQuality;
  format: "auto" | "mp4" | "webm";
  preserveAudio: boolean;
  onProgress: (progress: ExportProgress) => void;
  signal: AbortSignal;
}): Promise<ExportResult> {
  const {
    sourceType,
    sourceUrl,
    sourceName,
    regions,
    quality,
    format,
    preserveAudio,
    onProgress,
    signal,
  } = options;

  if (typeof MediaRecorder === "undefined") {
    throw new Error("Your browser does not support local MediaRecorder video export.");
  }

  onProgress({
    percent: 0,
    currentTime: 0,
    duration: options.duration,
    etaSeconds: options.duration,
    phase: "preparing",
  });

  const exportWidth = sourceType === "demo" ? DEMO_VIDEO_WIDTH : options.width;
  const exportHeight = sourceType === "demo" ? DEMO_VIDEO_HEIGHT : options.height;
  const totalDuration = sourceType === "demo" ? DEMO_VIDEO_DURATION : options.duration;

  const canvas = document.createElement("canvas");
  canvas.width = exportWidth;
  canvas.height = exportHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) {
    throw new Error("Unable to initialize 2D canvas context for video rendering.");
  }

  const { mimeType, extension } = detectBestMimeType(format);
  const videoBitsPerSecond = getBitrate(quality, exportWidth, exportHeight);

  const canvasStream = canvas.captureStream(30);
  const combinedStream = new MediaStream();
  canvasStream.getVideoTracks().forEach((track) => combinedStream.addTrack(track));

  let hiddenVideo: HTMLVideoElement | null = null;
  let audioCtx: AudioContext | null = null;

  if (sourceType === "file") {
    if (!sourceUrl) {
      throw new Error("Missing video source URL.");
    }
    hiddenVideo = document.createElement("video");
    hiddenVideo.src = sourceUrl;
    hiddenVideo.crossOrigin = "anonymous";
    hiddenVideo.playsInline = true;
    hiddenVideo.preload = "auto";
    hiddenVideo.muted = !preserveAudio;

    await new Promise<void>((resolve, reject) => {
      if (!hiddenVideo) return reject(new Error("Video element unavailable"));
      const onLoaded = () => {
        cleanup();
        resolve();
      };
      const onErr = () => {
        cleanup();
        reject(new Error("Failed to load video stream for export."));
      };
      const cleanup = () => {
        hiddenVideo?.removeEventListener("loadeddata", onLoaded);
        hiddenVideo?.removeEventListener("error", onErr);
      };
      hiddenVideo.addEventListener("loadeddata", onLoaded);
      hiddenVideo.addEventListener("error", onErr);
      hiddenVideo.load();
    });

    if (preserveAudio) {
      try {
        const AudioContextCtor =
          window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (AudioContextCtor) {
          audioCtx = new AudioContextCtor();
          const sourceNode = audioCtx.createMediaElementSource(hiddenVideo);
          const destNode = audioCtx.createMediaStreamDestination();
          sourceNode.connect(destNode);
          // Do not connect to audioCtx.destination so export runs silently without blasting speakers
          destNode.stream.getAudioTracks().forEach((track) => combinedStream.addTrack(track));
        }
      } catch {
        // Video may have no audio track; continue cleanly with video only
      }
    }
  }

  const chunks: BlobPart[] = [];
  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond,
  });

  recorder.ondataavailable = (ev) => {
    if (ev.data && ev.data.size > 0) {
      chunks.push(ev.data);
    }
  };

  const cleanupResources = () => {
    combinedStream.getTracks().forEach((t) => t.stop());
    if (hiddenVideo) {
      hiddenVideo.pause();
      hiddenVideo.removeAttribute("src");
      hiddenVideo.load();
    }
    if (audioCtx && audioCtx.state !== "closed") {
      audioCtx.close().catch(() => {});
    }
  };

  return new Promise<ExportResult>((resolve, reject) => {
    let rafId = 0;
    let finished = false;
    const renderStartWall = performance.now();

    const abortHandler = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      cleanupResources();
      reject(new DOMException("Export cancelled by user", "AbortError"));
    };

    signal.addEventListener("abort", abortHandler, { once: true });

    recorder.onstop = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      signal.removeEventListener("abort", abortHandler);
      cleanupResources();

      onProgress({
        percent: 100,
        currentTime: totalDuration,
        duration: totalDuration,
        etaSeconds: 0,
        phase: "finalizing",
      });

      const blob = new Blob(chunks, { type: mimeType });
      const url = URL.createObjectURL(blob);
      const baseName = sourceName.replace(/\.[^.]+$/, "");
      const fileName = `${baseName}_clean.${extension}`;

      resolve({
        blob,
        url,
        mimeType,
        extension,
        fileName,
        sizeBytes: blob.size,
      });
    };

    recorder.onerror = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(rafId);
      signal.removeEventListener("abort", abortHandler);
      cleanupResources();
      reject(new Error("Video encoding encountered a browser MediaRecorder error."));
    };

    recorder.start(250);

    if (sourceType === "demo") {
      const renderDemoLoop = () => {
        if (finished || signal.aborted) return;
        const elapsed = (performance.now() - renderStartWall) / 1000;
        const t = Math.min(elapsed, totalDuration);

        renderDemoVideoFrame(ctx, exportWidth, exportHeight, t);
        applyWatermarkRemoval(ctx, exportWidth, exportHeight, regions, t);

        const percent = Math.min(99, (t / totalDuration) * 100);
        onProgress({
          percent,
          currentTime: t,
          duration: totalDuration,
          etaSeconds: Math.max(0, totalDuration - t),
          phase: "rendering",
        });

        if (elapsed >= totalDuration) {
          recorder.stop();
          return;
        }
        rafId = requestAnimationFrame(renderDemoLoop);
      };
      rafId = requestAnimationFrame(renderDemoLoop);
    } else if (hiddenVideo) {
      hiddenVideo.currentTime = 0;

      const renderVideoLoop = () => {
        if (finished || signal.aborted || !hiddenVideo) return;

        if (hiddenVideo.readyState >= 2) {
          ctx.drawImage(hiddenVideo, 0, 0, exportWidth, exportHeight);
          applyWatermarkRemoval(
            ctx,
            exportWidth,
            exportHeight,
            regions,
            hiddenVideo.currentTime
          );
        }

        const t = hiddenVideo.currentTime;
        const percent = Math.min(99, (t / (totalDuration || 1)) * 100);
        onProgress({
          percent,
          currentTime: t,
          duration: totalDuration,
          etaSeconds: Math.max(0, totalDuration - t),
          phase: "rendering",
        });

        if (hiddenVideo.ended || t >= totalDuration - 0.03) {
          recorder.stop();
          return;
        }

        rafId = requestAnimationFrame(renderVideoLoop);
      };

      hiddenVideo.onended = () => {
        if (!finished && recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      hiddenVideo
        .play()
        .then(() => {
          rafId = requestAnimationFrame(renderVideoLoop);
        })
        .catch(() => {
          if (!finished) {
            finished = true;
            cleanupResources();
            reject(new Error("Browser blocked video playback during local export."));
          }
        });
    }
  });
}
