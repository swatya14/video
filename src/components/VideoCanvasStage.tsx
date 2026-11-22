import React, { useEffect, useRef, useState } from "react";
import { Film, MoveHorizontal, Upload } from "lucide-react";
import type { WatermarkRegion } from "../types/watermark";
import type { ViewMode } from "./TimelineBar";

interface VideoCanvasStageProps {
  hasVideo: boolean;
  videoWidth: number;
  videoHeight: number;
  currentTime: number;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  regions: WatermarkRegion[];
  selectedRegionId: string | null;
  showMaskOutlines: boolean;
  viewMode: ViewMode;
  splitPosition: number; // 0..1
  onSplitPositionChange: (pos: number) => void;
  onSelectRegion: (id: string | null) => void;
  onUpdateRegion: (id: string, patch: Partial<WatermarkRegion>) => void;
  onCreateRegionFromRect: (rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
  onOpenFilePicker: () => void;
  onLoadDemo: () => void;
  onDropFiles: (files: FileList) => void;
}

type DragAction =
  | { type: "draw"; startX: number; startY: number; curX: number; curY: number }
  | {
      type: "move";
      regionId: string;
      startClientX: number;
      startClientY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    }
  | {
      type: "resize";
      regionId: string;
      handle: "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
      startClientX: number;
      startClientY: number;
      origX: number;
      origY: number;
      origW: number;
      origH: number;
    }
  | { type: "split" };

export const VideoCanvasStage: React.FC<VideoCanvasStageProps> = ({
  hasVideo,
  videoWidth,
  videoHeight,
  currentTime,
  canvasRef,
  regions,
  selectedRegionId,
  showMaskOutlines,
  viewMode,
  splitPosition,
  onSplitPositionChange,
  onSelectRegion,
  onUpdateRegion,
  onCreateRegionFromRect,
  onOpenFilePicker,
  onLoadDemo,
  onDropFiles,
}) => {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [dragAction, setDragAction] = useState<DragAction | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  const getNormalizedPoint = (clientX: number, clientY: number) => {
    const el = overlayRef.current;
    if (!el) return { nx: 0, ny: 0 };
    const rect = el.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { nx, ny };
  };

  useEffect(() => {
    if (!dragAction) return;

    const handleMove = (e: PointerEvent) => {
      const el = overlayRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      if (dragAction.type === "split") {
        const ratio = Math.min(0.96, Math.max(0.04, (e.clientX - rect.left) / rect.width));
        onSplitPositionChange(ratio);
        return;
      }

      if (dragAction.type === "draw") {
        const { nx, ny } = getNormalizedPoint(e.clientX, e.clientY);
        setDragAction((prev) =>
          prev && prev.type === "draw" ? { ...prev, curX: nx, curY: ny } : prev
        );
        return;
      }

      const dx = (e.clientX - dragAction.startClientX) / rect.width;
      const dy = (e.clientY - dragAction.startClientY) / rect.height;

      if (dragAction.type === "move") {
        const newX = Math.min(1 - dragAction.origW, Math.max(0, dragAction.origX + dx));
        const newY = Math.min(1 - dragAction.origH, Math.max(0, dragAction.origY + dy));
        onUpdateRegion(dragAction.regionId, { x: newX, y: newY });
        return;
      }

      if (dragAction.type === "resize") {
        const minSize = 0.02;
        let x = dragAction.origX;
        let y = dragAction.origY;
        let w = dragAction.origW;
        let h = dragAction.origH;
        const right = dragAction.origX + dragAction.origW;
        const bottom = dragAction.origY + dragAction.origH;

        if (dragAction.handle.includes("w")) {
          const clampedX = Math.min(right - minSize, Math.max(0, dragAction.origX + dx));
          w = right - clampedX;
          x = clampedX;
        }
        if (dragAction.handle.includes("e")) {
          w = Math.min(1 - x, Math.max(minSize, dragAction.origW + dx));
        }
        if (dragAction.handle.includes("n")) {
          const clampedY = Math.min(bottom - minSize, Math.max(0, dragAction.origY + dy));
          h = bottom - clampedY;
          y = clampedY;
        }
        if (dragAction.handle.includes("s")) {
          h = Math.min(1 - y, Math.max(minSize, dragAction.origH + dy));
        }
        onUpdateRegion(dragAction.regionId, { x, y, width: w, height: h });
      }
    };

    const handleUp = () => {
      if (dragAction.type === "draw") {
        const x = Math.min(dragAction.startX, dragAction.curX);
        const y = Math.min(dragAction.startY, dragAction.curY);
        const width = Math.abs(dragAction.curX - dragAction.startX);
        const height = Math.abs(dragAction.curY - dragAction.startY);
        if (width >= 0.015 && height >= 0.015) {
          onCreateRegionFromRect({ x, y, width, height });
        }
      }
      setDragAction(null);
    };

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
  }, [dragAction, onCreateRegionFromRect, onSplitPositionChange, onUpdateRegion]);

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onDropFiles(e.dataTransfer.files);
    }
  };

  if (!hasVideo) {
    return (
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDraggingFile(true);
        }}
        onDragLeave={() => setIsDraggingFile(false)}
        onDrop={handleDrop}
        className={`relative flex-1 min-h-[460px] lg:min-h-[540px] flex flex-col items-center justify-center p-8 text-center transition-colors ${
          isDraggingFile ? "bg-[#3B82F6]/10" : "bg-[#080A0E]"
        }`}
      >
        <div
          className={`w-full max-w-xl rounded-xl border border-dashed p-10 transition-colors ${
            isDraggingFile
              ? "border-[#3B82F6] bg-[#13161D]"
              : "border-[#2D3342] bg-[#0F1218]"
          }`}
        >
          <div className="mx-auto mb-5 w-12 h-12 rounded-xl bg-[#1A1E28] border border-[#252A36] flex items-center justify-center text-[#9CA3B2]">
            <Upload className="w-5 h-5" />
          </div>

          <h2 className="font-display text-2xl font-semibold tracking-tight text-[#F3F5F8] text-balance">
            Drop a video to remove watermarks locally
          </h2>

          <p className="mt-2.5 text-sm text-[#9CA3B2] max-w-md mx-auto leading-relaxed">
            Erase Gemini corner sparkles, logos, and text overlays directly in your browser.
            Unlimited exports, full native resolution, zero registration.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onOpenFilePicker}
              className="px-5 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
            >
              Select Video File
            </button>

            <button
              type="button"
              onClick={onLoadDemo}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-[#F3F5F8] bg-[#1A1E28] hover:bg-[#232836] border border-[#252A36] rounded-lg transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
            >
              <Film className="w-4 h-4 text-[#9CA3B2]" />
              Try Sample Video
            </button>
          </div>

          <div className="mt-7 pt-5 border-t border-[#1E232E] flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-xs text-[#6B7280]">
            <span>MP4, WebM, MOV</span>
            <span aria-hidden="true">·</span>
            <span>No file size limit</span>
            <span aria-hidden="true">·</span>
            <span>Audio preserved</span>
            <span aria-hidden="true">·</span>
            <span>No account required</span>
          </div>
        </div>
      </div>
    );
  }

  const draftRect =
    dragAction?.type === "draw"
      ? {
          x: Math.min(dragAction.startX, dragAction.curX),
          y: Math.min(dragAction.startY, dragAction.curY),
          width: Math.abs(dragAction.curX - dragAction.startX),
          height: Math.abs(dragAction.curY - dragAction.startY),
        }
      : null;

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDraggingFile(true);
      }}
      onDragLeave={() => setIsDraggingFile(false)}
      onDrop={handleDrop}
      className="relative flex-1 min-h-[420px] lg:min-h-[520px] bg-[#080A0E] flex items-center justify-center p-4 sm:p-6 overflow-hidden select-none"
    >
      {isDraggingFile && (
        <div className="absolute inset-3 z-40 rounded-xl border-2 border-dashed border-[#3B82F6] bg-[#0B0D11]/85 flex items-center justify-center pointer-events-none">
          <span className="font-display text-base font-medium text-[#F3F5F8]">
            Drop video to add to your unlimited queue
          </span>
        </div>
      )}

      {/* Aspect-ratio locked canvas + interactive mask overlay */}
      <div
        ref={overlayRef}
        onPointerDown={(e) => {
          if (e.button !== 0) return;
          const { nx, ny } = getNormalizedPoint(e.clientX, e.clientY);
          onSelectRegion(null);
          setDragAction({ type: "draw", startX: nx, startY: ny, curX: nx, curY: ny });
        }}
        className="relative max-w-full max-h-[64vh] shadow-2xl border border-[#252A36] bg-black cursor-crosshair overflow-hidden"
        style={{
          aspectRatio: `${videoWidth} / ${videoHeight}`,
          width: videoWidth >= videoHeight ? "100%" : "auto",
          height: videoWidth >= videoHeight ? "auto" : "100%",
        }}
      >
        <canvas
          ref={canvasRef}
          width={videoWidth}
          height={videoHeight}
          className="block w-full h-full object-contain pointer-events-none"
        />

        {/* Before / After Split Curtain */}
        {viewMode === "split" && (
          <div
            className="absolute inset-y-0 z-20 pointer-events-none"
            style={{ left: `${splitPosition * 100}%` }}
          >
            <div className="w-px h-full bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.8)]" />
            <button
              type="button"
              aria-label="Drag before and after comparison slider"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDragAction({ type: "split" });
              }}
              className="pointer-events-auto absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-[#13161D] border border-white/80 text-white flex items-center justify-center shadow-lg cursor-ew-resize hover:bg-[#3B82F6] hover:border-[#3B82F6] transition-colors"
            >
              <MoveHorizontal className="w-4 h-4" />
            </button>
            <div className="absolute top-3 right-3 px-2 py-0.5 rounded bg-black/75 text-[11px] font-medium text-white whitespace-nowrap">
              Original
            </div>
            <div className="absolute top-3 left-3 px-2 py-0.5 rounded bg-[#3B82F6]/90 text-[11px] font-medium text-white whitespace-nowrap">
              Cleaned
            </div>
          </div>
        )}

        {/* Interactive Mask Boxes */}
        {showMaskOutlines &&
          regions.map((region) => {
            const isSelected = region.id === selectedRegionId;
            const isActiveAtTime =
              currentTime >= region.startTime - 0.04 &&
              currentTime <= region.endTime + 0.04;

            return (
              <div
                key={region.id}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelectRegion(region.id);
                  setDragAction({
                    type: "move",
                    regionId: region.id,
                    startClientX: e.clientX,
                    startClientY: e.clientY,
                    origX: region.x,
                    origY: region.y,
                    origW: region.width,
                    origH: region.height,
                  });
                }}
                className={`absolute z-10 cursor-move transition-opacity ${
                  !region.enabled
                    ? "opacity-35 border border-dashed border-[#6B7280]"
                    : isSelected
                      ? "border-[1.5px] border-[#3B82F6] bg-[#3B82F6]/10"
                      : isActiveAtTime
                        ? "border border-dashed border-white/65 hover:border-[#3B82F6]"
                        : "border border-dashed border-white/25 opacity-50"
                }`}
                style={{
                  left: `${region.x * 100}%`,
                  top: `${region.y * 100}%`,
                  width: `${region.width * 100}%`,
                  height: `${region.height * 100}%`,
                  borderRadius: region.shape === "rounded" ? "6px" : "0px",
                }}
              >
                {/* Compact top label for selected box */}
                {isSelected && (
                  <div className="absolute -top-6 left-0 px-1.5 py-0.5 rounded bg-[#3B82F6] text-[10px] font-mono font-medium text-white whitespace-nowrap pointer-events-none tabular-nums">
                    {region.label} · {Math.round(region.width * videoWidth)}×
                    {Math.round(region.height * videoHeight)}
                  </div>
                )}

                {/* 8 Resize Handles when selected */}
                {isSelected &&
                  (
                    [
                      { h: "nw", cls: "-top-1.5 -left-1.5 cursor-nwse-resize" },
                      { h: "n", cls: "-top-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
                      { h: "ne", cls: "-top-1.5 -right-1.5 cursor-nesw-resize" },
                      { h: "e", cls: "top-1/2 -translate-y-1/2 -right-1.5 cursor-ew-resize" },
                      { h: "se", cls: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
                      { h: "s", cls: "-bottom-1.5 left-1/2 -translate-x-1/2 cursor-ns-resize" },
                      { h: "sw", cls: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
                      { h: "w", cls: "top-1/2 -translate-y-1/2 -left-1.5 cursor-ew-resize" },
                    ] as const
                  ).map(({ h, cls }) => (
                    <div
                      key={h}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setDragAction({
                          type: "resize",
                          regionId: region.id,
                          handle: h,
                          startClientX: e.clientX,
                          startClientY: e.clientY,
                          origX: region.x,
                          origY: region.y,
                          origW: region.width,
                          origH: region.height,
                        });
                      }}
                      className={`absolute w-3 h-3 rounded-xs bg-white border border-[#3B82F6] ${cls}`}
                    />
                  ))}
              </div>
            );
          })}

        {/* Active Click-and-Drag Drawing Preview */}
        {draftRect && draftRect.width > 0.005 && draftRect.height > 0.005 && (
          <div
            className="absolute z-20 border-[1.5px] border-[#3B82F6] bg-[#3B82F6]/15 pointer-events-none"
            style={{
              left: `${draftRect.x * 100}%`,
              top: `${draftRect.y * 100}%`,
              width: `${draftRect.width * 100}%`,
              height: `${draftRect.height * 100}%`,
            }}
          />
        )}
      </div>
    </div>
  );
};
