import React, { useCallback, useEffect, useRef, useState } from "react";
import { Download, Film, Plus, X } from "lucide-react";
import { TopBar } from "./components/TopBar";
import { VideoCanvasStage } from "./components/VideoCanvasStage";
import { TimelineBar, formatTimecode, type ViewMode } from "./components/TimelineBar";
import { InspectorPanel } from "./components/InspectorPanel";
import { ExportModal, formatBytes } from "./components/ExportModal";
import { GuideSections } from "./components/GuideSections";
import { applyWatermarkRemoval } from "./lib/inpaintEngine";
import {
  DEMO_VIDEO_DURATION,
  DEMO_VIDEO_HEIGHT,
  DEMO_VIDEO_WIDTH,
  renderDemoVideoFrame,
} from "./lib/demoVideo";
import { exportCleanedVideo, type ExportProgress } from "./lib/videoExporter";
import type {
  ExportQuality,
  ExportRecord,
  PresetDefinition,
  VideoQueueItem,
  WatermarkRegion,
} from "./types/watermark";

function createId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}_${Date.now().toString(36)}`;
}

function createDefaultRegion(
  duration: number,
  overrides?: Partial<WatermarkRegion>
): WatermarkRegion {
  return {
    id: createId("mask"),
    label: "Watermark Mask",
    x: 0.855,
    y: 0.885,
    width: 0.132,
    height: 0.095,
    mode: "corner-radial",
    shape: "rounded",
    feather: 8,
    strength: 100,
    patchDirection: "auto",
    grainMatch: true,
    enabled: true,
    startTime: 0,
    endTime: duration,
    ...overrides,
  };
}

function readVideoMetadata(
  objectUrl: string
): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const el = document.createElement("video");
    el.preload = "metadata";
    el.src = objectUrl;
    el.onloadedmetadata = () => {
      const width = el.videoWidth || 1280;
      const height = el.videoHeight || 720;
      const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 10;
      el.removeAttribute("src");
      el.load();
      resolve({ width, height, duration });
    };
    el.onerror = () => {
      reject(new Error("Could not read video file metadata. Please use MP4, WebM, or MOV."));
    };
  });
}

export default function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const exportAbortRef = useRef<AbortController | null>(null);

  const [queue, setQueue] = useState<VideoQueueItem[]>([]);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>("cleaned");
  const [splitPosition, setSplitPosition] = useState(0.5);
  const [showMaskOutlines, setShowMaskOutlines] = useState(true);

  const [isDetecting, setIsDetecting] = useState(false);
  const [detectNotice, setDetectNotice] = useState<{
    type: "info" | "error";
    message: string;
  } | null>(null);

  // Export state
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportQuality, setExportQuality] = useState<ExportQuality>("high");
  const [exportFormat, setExportFormat] = useState<"auto" | "mp4" | "webm">("auto");
  const [preserveAudio, setPreserveAudio] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [latestExport, setLatestExport] = useState<ExportRecord | null>(null);
  const [exportHistory, setExportHistory] = useState<ExportRecord[]>([]);

  const activeVideo = queue.find((v) => v.id === activeVideoId) ?? null;
  const regions = activeVideo?.regions ?? [];
  const selectedRegion =
    regions.find((r) => r.id === selectedRegionId) ?? regions[0] ?? null;

  // Keep refs of live playback values for 60fps requestAnimationFrame loop
  const demoClockRef = useRef<number>(0);
  const lastRafTimeRef = useRef<number>(0);

  const activeVideoRef = useRef<VideoQueueItem | null>(activeVideo);
  activeVideoRef.current = activeVideo;

  const viewModeRef = useRef<ViewMode>(viewMode);
  viewModeRef.current = viewMode;

  const splitPositionRef = useRef<number>(splitPosition);
  splitPositionRef.current = splitPosition;

  const isPlayingRef = useRef<boolean>(isPlaying);
  isPlayingRef.current = isPlaying;

  // Render a single frame to the preview canvas
  const renderCurrentFrame = useCallback((timeSec: number) => {
    const vidItem = activeVideoRef.current;
    const canvas = canvasRef.current;
    if (!vidItem || !canvas) return;

    const w = vidItem.width;
    const h = vidItem.height;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;

    const mode = viewModeRef.current;

    const drawBaseFrame = (targetCtx: CanvasRenderingContext2D) => {
      if (vidItem.sourceType === "demo") {
        renderDemoVideoFrame(targetCtx, w, h, timeSec);
        return true;
      }
      const videoEl = videoElRef.current;
      if (videoEl && videoEl.readyState >= 2) {
        targetCtx.drawImage(videoEl, 0, 0, w, h);
        return true;
      }
      return false;
    };

    if (mode === "original") {
      drawBaseFrame(ctx);
      return;
    }

    if (mode === "cleaned") {
      const ok = drawBaseFrame(ctx);
      if (ok) {
        applyWatermarkRemoval(ctx, w, h, vidItem.regions, timeSec);
      }
      return;
    }

    // Split mode: left side is Original, right side is Cleaned
    let off = offscreenCanvasRef.current;
    if (!off) {
      off = document.createElement("canvas");
      offscreenCanvasRef.current = off;
    }
    if (off.width !== w || off.height !== h) {
      off.width = w;
      off.height = h;
    }
    const offCtx = off.getContext("2d", { willReadFrequently: true });
    if (!offCtx) return;

    const ok = drawBaseFrame(offCtx);
    if (!ok) return;

    // Copy original to main canvas and apply removal across full frame
    ctx.drawImage(off, 0, 0);
    applyWatermarkRemoval(ctx, w, h, vidItem.regions, timeSec);

    // Overwrite left portion up to splitX with unmodified original
    const splitX = Math.round(splitPositionRef.current * w);
    if (splitX > 0) {
      ctx.drawImage(off, 0, 0, splitX, h, 0, 0, splitX, h);
    }
  }, []);

  // Re-render frame immediately whenever masks, viewMode, splitPosition, or currentTime changes
  useEffect(() => {
    if (!activeVideo) return;
    renderCurrentFrame(currentTime);
  }, [activeVideo, currentTime, viewMode, splitPosition, renderCurrentFrame]);

  // Continuous playback animation loop
  useEffect(() => {
    if (!activeVideo) return;
    let rafId = 0;

    const tick = (now: number) => {
      const vid = activeVideoRef.current;
      if (!vid) return;

      if (vid.sourceType === "demo") {
        if (isPlayingRef.current) {
          const dt = lastRafTimeRef.current ? (now - lastRafTimeRef.current) / 1000 : 0;
          lastRafTimeRef.current = now;
          demoClockRef.current = (demoClockRef.current + Math.min(dt, 0.1)) % DEMO_VIDEO_DURATION;
          setCurrentTime(demoClockRef.current);
          renderCurrentFrame(demoClockRef.current);
        } else {
          lastRafTimeRef.current = 0;
        }
      } else {
        const el = videoElRef.current;
        if (el && isPlayingRef.current) {
          setCurrentTime(el.currentTime);
          renderCurrentFrame(el.currentTime);
        }
      }

      if (isPlayingRef.current) {
        rafId = requestAnimationFrame(tick);
      }
    };

    if (isPlaying) {
      lastRafTimeRef.current = performance.now();
      rafId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [activeVideo?.id, isPlaying, renderCurrentFrame]);

  // Sync hidden HTMLVideoElement when switching active file video
  useEffect(() => {
    const el = videoElRef.current;
    if (!el) return;

    if (!activeVideo || activeVideo.sourceType !== "file" || !activeVideo.objectUrl) {
      el.pause();
      el.removeAttribute("src");
      el.load();
      return;
    }

    el.src = activeVideo.objectUrl;
    el.muted = isMuted;
    el.currentTime = 0;
    setCurrentTime(0);
    setIsPlaying(false);

    const handleLoadedData = () => {
      renderCurrentFrame(0);
    };
    const handleSeeked = () => {
      setCurrentTime(el.currentTime);
      renderCurrentFrame(el.currentTime);
    };
    const handleEnded = () => {
      setIsPlaying(false);
    };

    el.addEventListener("loadeddata", handleLoadedData);
    el.addEventListener("seeked", handleSeeked);
    el.addEventListener("ended", handleEnded);

    return () => {
      el.removeEventListener("loadeddata", handleLoadedData);
      el.removeEventListener("seeked", handleSeeked);
      el.removeEventListener("ended", handleEnded);
    };
  }, [activeVideo?.id, activeVideo?.objectUrl, activeVideo?.sourceType, renderCurrentFrame]);

  useEffect(() => {
    if (videoElRef.current) {
      videoElRef.current.muted = isMuted;
    }
  }, [isMuted]);

  const updateActiveVideoRegions = useCallback(
    (updater: (prev: WatermarkRegion[]) => WatermarkRegion[]) => {
      if (!activeVideoId) return;
      setQueue((prev) =>
        prev.map((item) =>
          item.id === activeVideoId ? { ...item, regions: updater(item.regions) } : item
        )
      );
    },
    [activeVideoId]
  );

  const handleTogglePlay = useCallback(() => {
    const vid = activeVideoRef.current;
    if (!vid) return;

    if (vid.sourceType === "demo") {
      setIsPlaying((p) => !p);
      return;
    }

    const el = videoElRef.current;
    if (!el) return;
    if (el.paused) {
      if (el.currentTime >= vid.duration - 0.05) {
        el.currentTime = 0;
      }
      el.play()
        .then(() => setIsPlaying(true))
        .catch(() => setIsPlaying(false));
    } else {
      el.pause();
      setIsPlaying(false);
    }
  }, []);

  const handleSeek = useCallback(
    (time: number) => {
      const vid = activeVideoRef.current;
      if (!vid) return;
      const clamped = Math.max(0, Math.min(vid.duration, time));
      if (vid.sourceType === "demo") {
        demoClockRef.current = clamped;
        setCurrentTime(clamped);
        renderCurrentFrame(clamped);
      } else if (videoElRef.current) {
        videoElRef.current.currentTime = clamped;
        setCurrentTime(clamped);
      }
    },
    [renderCurrentFrame]
  );

  const handleStepFrame = useCallback(
    (deltaSec: number) => {
      const vid = activeVideoRef.current;
      if (!vid) return;
      if (isPlayingRef.current) {
        if (vid.sourceType === "file") videoElRef.current?.pause();
        setIsPlaying(false);
      }
      handleSeek(currentTime + deltaSec);
    },
    [currentTime, handleSeek]
  );

  const handleIngestFiles = useCallback(async (fileList: FileList) => {
    const files = Array.from(fileList).filter((f) => f.type.startsWith("video/"));
    if (files.length === 0) {
      setDetectNotice({
        type: "error",
        message: "Please choose a valid video file (MP4, WebM, or MOV).",
      });
      return;
    }

    const newItems: VideoQueueItem[] = [];
    for (const file of files) {
      const objectUrl = URL.createObjectURL(file);
      try {
        const meta = await readVideoMetadata(objectUrl);
        const defaultMask = createDefaultRegion(meta.duration, {
          label: "Bottom-Right Sparkle",
        });
        newItems.push({
          id: createId("vid"),
          name: file.name,
          sourceType: "file",
          objectUrl,
          fileSize: file.size,
          width: meta.width,
          height: meta.height,
          duration: meta.duration,
          regions: [defaultMask],
        });
      } catch {
        URL.revokeObjectURL(objectUrl);
      }
    }

    if (newItems.length > 0) {
      setQueue((prev) => [...prev, ...newItems]);
      setActiveVideoId(newItems[0].id);
      setSelectedRegionId(newItems[0].regions[0].id);
      setViewMode("cleaned");
      setDetectNotice({
        type: "info",
        message: `Loaded ${newItems.length} ${
          newItems.length === 1 ? "video" : "videos"
        }. Adjust the box or click AI Auto-Detect.`,
      });
    }
  }, []);

  const handleLoadDemo = useCallback(() => {
    const existingDemo = queue.find((v) => v.sourceType === "demo");
    if (existingDemo) {
      setActiveVideoId(existingDemo.id);
      setSelectedRegionId(existingDemo.regions[0]?.id ?? null);
      demoClockRef.current = 0;
      setCurrentTime(0);
      setIsPlaying(true);
      return;
    }

    const demoMask = createDefaultRegion(DEMO_VIDEO_DURATION, {
      label: "Bottom-Right Sparkle",
      x: 0.885,
      y: 0.902,
      width: 0.105,
      height: 0.078,
      mode: "corner-radial",
      feather: 8,
    });

    const demoItem: VideoQueueItem = {
      id: createId("demo"),
      name: "coastal_twilight_sample.mp4",
      sourceType: "demo",
      width: DEMO_VIDEO_WIDTH,
      height: DEMO_VIDEO_HEIGHT,
      duration: DEMO_VIDEO_DURATION,
      regions: [demoMask],
    };

    setQueue((prev) => [...prev, demoItem]);
    setActiveVideoId(demoItem.id);
    setSelectedRegionId(demoMask.id);
    setViewMode("split");
    setSplitPosition(0.78);
    demoClockRef.current = 0;
    setCurrentTime(0);
    setIsPlaying(true);
    setDetectNotice({
      type: "info",
      message:
        "Sample clip loaded with Before / After split active. Drag the divider right across the corner sparkle to inspect removal.",
    });
  }, [queue]);

  const handleRemoveQueueItem = useCallback(
    (id: string) => {
      setQueue((prev) => {
        const target = prev.find((v) => v.id === id);
        if (target?.objectUrl) {
          URL.revokeObjectURL(target.objectUrl);
        }
        const remaining = prev.filter((v) => v.id !== id);
        if (activeVideoId === id) {
          const next = remaining[0] ?? null;
          setActiveVideoId(next?.id ?? null);
          setSelectedRegionId(next?.regions[0]?.id ?? null);
          setIsPlaying(false);
          setCurrentTime(0);
        }
        return remaining;
      });
    },
    [activeVideoId]
  );

  const handleCreateRegionFromRect = useCallback(
    (rect: { x: number; y: number; width: number; height: number }) => {
      if (!activeVideo) return;
      const newMask = createDefaultRegion(activeVideo.duration, {
        label: `Mask ${activeVideo.regions.length + 1}`,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        mode:
          rect.x < 0.05 ||
          rect.y < 0.05 ||
          rect.x + rect.width > 0.95 ||
          rect.y + rect.height > 0.95
            ? "corner-radial"
            : "delogo",
      });
      updateActiveVideoRegions((prev) => [...prev, newMask]);
      setSelectedRegionId(newMask.id);
    },
    [activeVideo, updateActiveVideoRegions]
  );

  const handleAddManualMask = useCallback(() => {
    if (!activeVideo) return;
    const offset = (activeVideo.regions.length % 4) * 0.03;
    const newMask = createDefaultRegion(activeVideo.duration, {
      label: `Mask ${activeVideo.regions.length + 1}`,
      x: Math.min(0.75, 0.38 + offset),
      y: Math.min(0.75, 0.42 + offset),
      width: 0.18,
      height: 0.1,
      mode: "delogo",
    });
    updateActiveVideoRegions((prev) => [...prev, newMask]);
    setSelectedRegionId(newMask.id);
  }, [activeVideo, updateActiveVideoRegions]);

  const handleApplyPreset = useCallback(
    (preset: PresetDefinition) => {
      if (!activeVideo) return;
      const newMask = createDefaultRegion(activeVideo.duration, {
        label: preset.name,
        x: preset.x,
        y: preset.y,
        width: preset.width,
        height: preset.height,
        mode: preset.mode,
      });
      updateActiveVideoRegions((prev) => [...prev, newMask]);
      setSelectedRegionId(newMask.id);
    },
    [activeVideo, updateActiveVideoRegions]
  );

  const handleUpdateRegion = useCallback(
    (id: string, patch: Partial<WatermarkRegion>) => {
      updateActiveVideoRegions((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...patch } : r))
      );
    },
    [updateActiveVideoRegions]
  );

  const handleDuplicateRegion = useCallback(
    (id: string) => {
      if (!activeVideo) return;
      const source = activeVideo.regions.find((r) => r.id === id);
      if (!source) return;
      const copy: WatermarkRegion = {
        ...source,
        id: createId("mask"),
        label: `${source.label} Copy`,
        x: Math.min(1 - source.width, source.x + 0.025),
        y: Math.max(0, source.y - 0.025),
      };
      updateActiveVideoRegions((prev) => [...prev, copy]);
      setSelectedRegionId(copy.id);
    },
    [activeVideo, updateActiveVideoRegions]
  );

  const handleDeleteRegion = useCallback(
    (id: string) => {
      updateActiveVideoRegions((prev) => {
        const next = prev.filter((r) => r.id !== id);
        if (selectedRegionId === id) {
          setSelectedRegionId(next[0]?.id ?? null);
        }
        return next;
      });
    },
    [selectedRegionId, updateActiveVideoRegions]
  );

  const handleClearRegions = useCallback(() => {
    updateActiveVideoRegions(() => []);
    setSelectedRegionId(null);
  }, [updateActiveVideoRegions]);

  // AI Auto-Detect current unmasked video frame via server-side Gemini endpoint
  const handleAutoDetect = useCallback(async () => {
    if (!activeVideo) return;
    setIsDetecting(true);
    setDetectNotice(null);

    try {
      const capCanvas = document.createElement("canvas");
      const maxDim = 960;
      const scale = Math.min(1, maxDim / Math.max(activeVideo.width, activeVideo.height));
      capCanvas.width = Math.max(64, Math.round(activeVideo.width * scale));
      capCanvas.height = Math.max(64, Math.round(activeVideo.height * scale));
      const capCtx = capCanvas.getContext("2d");
      if (!capCtx) throw new Error("Canvas context unavailable.");

      if (activeVideo.sourceType === "demo") {
        renderDemoVideoFrame(capCtx, capCanvas.width, capCanvas.height, currentTime);
      } else if (videoElRef.current && videoElRef.current.readyState >= 2) {
        capCtx.drawImage(videoElRef.current, 0, 0, capCanvas.width, capCanvas.height);
      } else {
        throw new Error("Video frame is still loading. Try again in a moment.");
      }

      const dataUrl = capCanvas.toDataURL("image/jpeg", 0.85);
      const res = await fetch("/api/detect-watermark", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: dataUrl, mimeType: "image/jpeg" }),
      });

      const payload = (await res.json()) as {
        regions?: Array<{
          label: string;
          x: number;
          y: number;
          width: number;
          height: number;
          suggestedMode?: WatermarkRegion["mode"];
        }>;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error || "Unable to analyze frame.");
      }

      const found = payload.regions ?? [];
      if (found.length === 0) {
        setDetectNotice({
          type: "info",
          message:
            "No watermark overlay was detected on this frame. Try another timestamp or draw a mask directly.",
        });
        return;
      }

      const created = found.map((r) =>
        createDefaultRegion(activeVideo.duration, {
          label: r.label,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          mode: r.suggestedMode ?? "corner-radial",
        })
      );

      updateActiveVideoRegions(() => created);
      setSelectedRegionId(created[0].id);
      setDetectNotice({
        type: "info",
        message: `Detected ${created.length} watermark ${
          created.length === 1 ? "region" : "regions"
        } on this frame.`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Auto-detection failed.";
      setDetectNotice({ type: "error", message: msg });
    } finally {
      setIsDetecting(false);
    }
  }, [activeVideo, currentTime, updateActiveVideoRegions]);

  // Export orchestration
  const handleStartExport = useCallback(async () => {
    if (!activeVideo) return;
    setIsPlaying(false);
    videoElRef.current?.pause();

    setExportError(null);
    setLatestExport(null);
    setIsExporting(true);

    const controller = new AbortController();
    exportAbortRef.current = controller;

    try {
      const result = await exportCleanedVideo({
        sourceType: activeVideo.sourceType,
        sourceUrl: activeVideo.objectUrl,
        sourceName: activeVideo.name,
        width: activeVideo.width,
        height: activeVideo.height,
        duration: activeVideo.duration,
        regions: activeVideo.regions,
        quality: exportQuality,
        format: exportFormat,
        preserveAudio,
        onProgress: (p) => setExportProgress(p),
        signal: controller.signal,
      });

      const record: ExportRecord = {
        id: createId("exp"),
        sourceName: activeVideo.name,
        fileName: result.fileName,
        url: result.url,
        sizeBytes: result.sizeBytes,
        mimeType: result.mimeType,
        resolution: `${activeVideo.width} × ${activeVideo.height}`,
        duration: activeVideo.duration,
        createdAt: Date.now(),
      };

      setLatestExport(record);
      setExportHistory((prev) => [record, ...prev]);

      // Trigger immediate browser download
      const anchor = document.createElement("a");
      anchor.href = record.url;
      anchor.download = record.fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setExportError("Export cancelled.");
      } else {
        setExportError(
          err instanceof Error ? err.message : "Video export failed."
        );
      }
    } finally {
      setIsExporting(false);
      exportAbortRef.current = null;
    }
  }, [activeVideo, exportFormat, exportQuality, preserveAudio]);

  const handleCancelExport = useCallback(() => {
    exportAbortRef.current?.abort();
  }, []);

  // Keyboard shortcuts for studio speed
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!activeVideo || isExportModalOpen) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        handleTogglePlay();
      } else if (e.key === "b" || e.key === "B") {
        e.preventDefault();
        setViewMode((prev) => (prev === "split" ? "cleaned" : "split"));
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedRegion) {
        e.preventDefault();
        handleDeleteRegion(selectedRegion.id);
      } else if (
        selectedRegion &&
        ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)
      ) {
        e.preventDefault();
        const stepPx = e.shiftKey ? 10 : 2;
        const dx =
          e.key === "ArrowLeft"
            ? -stepPx / activeVideo.width
            : e.key === "ArrowRight"
              ? stepPx / activeVideo.width
              : 0;
        const dy =
          e.key === "ArrowUp"
            ? -stepPx / activeVideo.height
            : e.key === "ArrowDown"
              ? stepPx / activeVideo.height
              : 0;
        handleUpdateRegion(selectedRegion.id, {
          x: Math.min(1 - selectedRegion.width, Math.max(0, selectedRegion.x + dx)),
          y: Math.min(1 - selectedRegion.height, Math.max(0, selectedRegion.y + dy)),
        });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    activeVideo,
    isExportModalOpen,
    selectedRegion,
    handleTogglePlay,
    handleDeleteRegion,
    handleUpdateRegion,
  ]);

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0D11] text-[#F3F5F8]">
      {/* Hidden native file input supporting unlimited multi-file selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            void handleIngestFiles(e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* Hidden backing video element for uploaded local files */}
      <video ref={videoElRef} playsInline preload="auto" className="hidden" />

      <TopBar
        hasVideo={Boolean(activeVideo)}
        onPrimaryAction={() => {
          if (activeVideo) {
            setLatestExport(null);
            setExportError(null);
            setIsExportModalOpen(true);
          } else {
            openFilePicker();
          }
        }}
      />

      {/* Main Studio Workspace */}
      <main id="workspace" className="flex-1 flex flex-col">
        {/* Compact Workspace Header & Unlimited Video Queue Strip */}
        <div className="border-b border-[#252A36] bg-[#0F1218]">
          <div className="max-w-[1440px] mx-auto px-6 py-3 flex flex-wrap items-center justify-between gap-4">
            {!activeVideo ? (
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                <h1 className="font-display text-lg font-semibold tracking-tight text-[#F3F5F8]">
                  Video Watermark Removal Studio
                </h1>
                <div className="text-xs text-[#9CA3B2] flex items-center gap-2">
                  <span>Free &amp; unlimited</span>
                  <span aria-hidden="true">·</span>
                  <span>No registration</span>
                  <span aria-hidden="true">·</span>
                  <span>100% in-browser rendering</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 overflow-x-auto max-w-full">
                {queue.map((item) => {
                  const isActive = item.id === activeVideo.id;
                  return (
                    <div
                      key={item.id}
                      onClick={() => {
                        setActiveVideoId(item.id);
                        setSelectedRegionId(item.regions[0]?.id ?? null);
                        setIsPlaying(false);
                        demoClockRef.current = 0;
                        setCurrentTime(0);
                      }}
                      className={`inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-lg border text-xs transition-colors cursor-pointer shrink-0 ${
                        isActive
                          ? "bg-[#1A1E28] border-[#3B82F6]/60 text-[#F3F5F8]"
                          : "bg-transparent border-[#252A36] text-[#9CA3B2] hover:text-[#F3F5F8] hover:bg-[#13161D]"
                      }`}
                    >
                      <Film className="w-3.5 h-3.5 text-[#6B7280] shrink-0" />
                      <span className="max-w-[180px] truncate font-medium">
                        {item.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRemoveQueueItem(item.id);
                        }}
                        aria-label={`Remove ${item.name} from queue`}
                        className="p-0.5 rounded hover:bg-[#252A36] text-[#6B7280] hover:text-[#F3F5F8] cursor-pointer"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}

                <button
                  type="button"
                  onClick={openFilePicker}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-[#2D3342] hover:border-[#3B82F6] text-xs text-[#9CA3B2] hover:text-[#F3F5F8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Video
                </button>
              </div>
            )}

            {/* Quiet Unboxed Active Video Metadata */}
            {activeVideo && (
              <div className="font-mono text-xs tabular-nums text-[#9CA3B2] flex items-center gap-2.5 whitespace-nowrap">
                <span>
                  {activeVideo.width} × {activeVideo.height}
                </span>
                <span aria-hidden="true" className="text-[#4B5563]">
                  ·
                </span>
                <span>{formatTimecode(activeVideo.duration)}</span>
                {activeVideo.fileSize ? (
                  <>
                    <span aria-hidden="true" className="text-[#4B5563]">
                      ·
                    </span>
                    <span>{formatBytes(activeVideo.fileSize)}</span>
                  </>
                ) : null}
              </div>
            )}
          </div>
        </div>

        {/* Two-Column Studio Body: Viewport + Inspector */}
        <div className="max-w-[1440px] w-full mx-auto flex-1 flex flex-col lg:flex-row border-x border-[#1C202B]">
          {/* Left Viewport + Timeline */}
          <div className="flex-1 min-w-0 flex flex-col">
            <VideoCanvasStage
              hasVideo={Boolean(activeVideo)}
              videoWidth={activeVideo?.width ?? 1280}
              videoHeight={activeVideo?.height ?? 720}
              currentTime={currentTime}
              canvasRef={canvasRef}
              regions={regions}
              selectedRegionId={selectedRegion?.id ?? null}
              showMaskOutlines={showMaskOutlines}
              viewMode={viewMode}
              splitPosition={splitPosition}
              onSplitPositionChange={setSplitPosition}
              onSelectRegion={setSelectedRegionId}
              onUpdateRegion={handleUpdateRegion}
              onCreateRegionFromRect={handleCreateRegionFromRect}
              onOpenFilePicker={openFilePicker}
              onLoadDemo={handleLoadDemo}
              onDropFiles={handleIngestFiles}
            />

            {activeVideo && (
              <TimelineBar
                currentTime={currentTime}
                duration={activeVideo.duration}
                isPlaying={isPlaying}
                isMuted={isMuted}
                hasAudioControl={activeVideo.sourceType === "file"}
                viewMode={viewMode}
                selectedRegion={selectedRegion}
                onTogglePlay={handleTogglePlay}
                onSeek={handleSeek}
                onStepFrame={handleStepFrame}
                onToggleMute={() => setIsMuted((m) => !m)}
                onViewModeChange={setViewMode}
              />
            )}
          </div>

          {/* Right Studio Inspector */}
          <InspectorPanel
            hasVideo={Boolean(activeVideo)}
            videoWidth={activeVideo?.width ?? 1280}
            videoHeight={activeVideo?.height ?? 720}
            duration={activeVideo?.duration ?? 0}
            currentTime={currentTime}
            regions={regions}
            selectedRegionId={selectedRegion?.id ?? null}
            showMaskOutlines={showMaskOutlines}
            isDetecting={isDetecting}
            detectNotice={detectNotice}
            onToggleMaskOutlines={() => setShowMaskOutlines((v) => !v)}
            onAutoDetect={handleAutoDetect}
            onAddManualMask={handleAddManualMask}
            onApplyPreset={handleApplyPreset}
            onSelectRegion={setSelectedRegionId}
            onUpdateRegion={handleUpdateRegion}
            onDuplicateRegion={handleDuplicateRegion}
            onDeleteRegion={handleDeleteRegion}
            onClearRegions={handleClearRegions}
            onOpenExport={() => {
              setLatestExport(null);
              setExportError(null);
              setIsExportModalOpen(true);
            }}
          />
        </div>

        {/* Session Export History Bar (appears only once user has rendered 1+ clean videos) */}
        {exportHistory.length > 0 && (
          <div className="border-t border-[#252A36] bg-[#0F1218]">
            <div className="max-w-[1440px] mx-auto px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-display text-sm font-semibold text-[#F3F5F8]">
                  Session Exports ({exportHistory.length})
                </h2>
                <span className="text-xs text-[#6B7280]">
                  Stored locally in this browser tab
                </span>
              </div>

              <div className="divide-y divide-[#1E232E] border border-[#252A36] rounded-lg bg-[#13161D]">
                {exportHistory.map((rec) => (
                  <div
                    key={rec.id}
                    className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-[#F3F5F8] truncate">
                        {rec.fileName}
                      </div>
                      <div className="font-mono text-[11px] tabular-nums text-[#6B7280] flex items-center gap-2">
                        <span>{rec.resolution}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatBytes(rec.sizeBytes)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{formatTimecode(rec.duration)}</span>
                      </div>
                    </div>

                    <a
                      href={rec.url}
                      download={rec.fileName}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#1A1E28] hover:bg-[#232836] border border-[#252A36] text-[#F3F5F8] font-medium transition-colors whitespace-nowrap"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Download
                    </a>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      <GuideSections />

      {/* Export Dialog */}
      {activeVideo && (
        <ExportModal
          isOpen={isExportModalOpen}
          sourceName={activeVideo.name}
          sourceType={activeVideo.sourceType}
          width={activeVideo.width}
          height={activeVideo.height}
          duration={activeVideo.duration}
          activeMaskCount={activeVideo.regions.filter((r) => r.enabled).length}
          quality={exportQuality}
          format={exportFormat}
          preserveAudio={preserveAudio}
          isExporting={isExporting}
          progress={exportProgress}
          error={exportError}
          completedRecord={latestExport}
          onQualityChange={setExportQuality}
          onFormatChange={setExportFormat}
          onPreserveAudioChange={setPreserveAudio}
          onStartExport={handleStartExport}
          onCancelExport={handleCancelExport}
          onClose={() => {
            if (!isExporting) {
              setIsExportModalOpen(false);
            }
          }}
        />
      )}
    </div>
  );
}
