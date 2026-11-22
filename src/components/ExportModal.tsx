import React from "react";
import { Check, Download, Loader2, X } from "lucide-react";
import type { ExportQuality, ExportRecord } from "../types/watermark";
import type { ExportProgress } from "../lib/videoExporter";
import { formatTimecode } from "./TimelineBar";

interface ExportModalProps {
  isOpen: boolean;
  sourceName: string;
  sourceType: "file" | "demo";
  width: number;
  height: number;
  duration: number;
  activeMaskCount: number;
  quality: ExportQuality;
  format: "auto" | "mp4" | "webm";
  preserveAudio: boolean;
  isExporting: boolean;
  progress: ExportProgress | null;
  error: string | null;
  completedRecord: ExportRecord | null;
  onQualityChange: (q: ExportQuality) => void;
  onFormatChange: (f: "auto" | "mp4" | "webm") => void;
  onPreserveAudioChange: (v: boolean) => void;
  onStartExport: () => void;
  onCancelExport: () => void;
  onClose: () => void;
}

export function formatBytes(bytes: number): string {
  if (!bytes || bytes < 1024) return `${bytes || 0} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  isOpen,
  sourceName,
  sourceType,
  width,
  height,
  duration,
  activeMaskCount,
  quality,
  format,
  preserveAudio,
  isExporting,
  progress,
  error,
  completedRecord,
  onQualityChange,
  onFormatChange,
  onPreserveAudioChange,
  onStartExport,
  onCancelExport,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-xl bg-[#13161D] border border-[#252A36] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#252A36] flex items-center justify-between">
          <h2
            id="export-modal-title"
            className="font-display text-base font-semibold text-[#F3F5F8]"
          >
            Export Clean Video
          </h2>
          {!isExporting && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close export dialog"
              className="p-1.5 rounded-lg text-[#9CA3B2] hover:text-[#F3F5F8] hover:bg-[#1A1E28] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Body */}
        <div className="p-5 space-y-5">
          {/* Source Summary */}
          <div className="text-xs text-[#9CA3B2] space-y-1">
            <div className="font-medium text-[#F3F5F8] truncate">{sourceName}</div>
            <div className="font-mono tabular-nums flex flex-wrap items-center gap-2 text-[#6B7280]">
              <span>
                {width} × {height}
              </span>
              <span aria-hidden="true">·</span>
              <span>{formatTimecode(duration)}</span>
              <span aria-hidden="true">·</span>
              <span>
                {activeMaskCount} active {activeMaskCount === 1 ? "mask" : "masks"}
              </span>
            </div>
          </div>

          {!isExporting && !completedRecord && (
            <>
              {/* Bitrate / Quality */}
              <div>
                <span className="block text-xs font-medium text-[#9CA3B2] mb-2">
                  Export Quality
                </span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: "high", label: "High", sub: "12 Mbps" },
                      { id: "balanced", label: "Balanced", sub: "6.5 Mbps" },
                      { id: "compact", label: "Compact", sub: "3.2 Mbps" },
                    ] as const
                  ).map((opt) => {
                    const active = quality === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => onQualityChange(opt.id)}
                        className={`px-3 py-2 rounded-lg border text-left transition-colors cursor-pointer ${
                          active
                            ? "bg-[#3B82F6]/15 border-[#3B82F6] text-[#F3F5F8]"
                            : "bg-[#0B0D11] border-[#252A36] text-[#9CA3B2] hover:text-[#F3F5F8]"
                        }`}
                      >
                        <div className="text-xs font-medium">{opt.label}</div>
                        <div className="font-mono text-[10px] text-[#6B7280] tabular-nums">
                          {opt.sub}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Container Format */}
              <div>
                <span className="block text-xs font-medium text-[#9CA3B2] mb-2">
                  Container Format
                </span>
                <div className="grid grid-cols-3 gap-1 p-1 bg-[#0B0D11] border border-[#252A36] rounded-lg">
                  {(
                    [
                      { id: "auto", label: "Auto" },
                      { id: "mp4", label: "MP4" },
                      { id: "webm", label: "WebM" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onFormatChange(opt.id)}
                      className={`py-1.5 text-xs font-medium rounded transition-colors cursor-pointer ${
                        format === opt.id
                          ? "bg-[#1A1E28] text-[#F3F5F8]"
                          : "text-[#9CA3B2] hover:text-[#F3F5F8]"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Audio Passthrough */}
              {sourceType === "file" && (
                <label className="flex items-center justify-between gap-3 py-1 cursor-pointer select-none">
                  <div>
                    <div className="text-xs font-medium text-[#F3F5F8]">
                      Preserve Original Audio
                    </div>
                    <div className="text-[11px] text-[#6B7280]">
                      Captures the source audio track directly into your exported video
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={preserveAudio}
                    onChange={(e) => onPreserveAudioChange(e.target.checked)}
                    className="w-4 h-4 accent-[#3B82F6] rounded"
                  />
                </label>
              )}
            </>
          )}

          {/* Active Render Progress */}
          {isExporting && progress && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-2 text-[#F3F5F8] font-medium">
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3B82F6]" />
                  {progress.phase === "preparing"
                    ? "Preparing video stream..."
                    : progress.phase === "finalizing"
                      ? "Finalizing video file..."
                      : "Rendering cleaned frames locally..."}
                </span>
                <span className="font-mono tabular-nums text-[#F3F5F8]">
                  {Math.round(progress.percent)}%
                </span>
              </div>

              <div className="w-full h-2 rounded-full bg-[#252A36] overflow-hidden">
                <div
                  className="h-full bg-[#3B82F6] transition-[width] duration-150"
                  style={{ width: `${Math.min(100, Math.max(2, progress.percent))}%` }}
                />
              </div>

              <div className="flex items-center justify-between font-mono text-[11px] tabular-nums text-[#6B7280]">
                <span>
                  {formatTimecode(progress.currentTime)} /{" "}
                  {formatTimecode(progress.duration)}
                </span>
                <span>~{Math.ceil(progress.etaSeconds)}s remaining</span>
              </div>
            </div>
          )}

          {/* Completed Export State */}
          {!isExporting && completedRecord && (
            <div className="p-4 rounded-lg bg-[#0F1218] border border-[#252A36] space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-[#22C55E]">
                <Check className="w-4 h-4" />
                Video rendered cleanly
              </div>
              <div className="text-xs text-[#9CA3B2] break-all">
                {completedRecord.fileName}
              </div>
              <div className="font-mono text-[11px] tabular-nums text-[#6B7280] flex items-center gap-2">
                <span>{formatBytes(completedRecord.sizeBytes)}</span>
                <span aria-hidden="true">·</span>
                <span>{completedRecord.resolution}</span>
                <span aria-hidden="true">·</span>
                <span>No watermark added</span>
              </div>
              <a
                href={completedRecord.url}
                download={completedRecord.fileName}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg transition-colors"
              >
                <Download className="w-4 h-4" />
                Download Clean Video
              </a>
            </div>
          )}

          {error && (
            <p className="text-xs text-[#F87171] leading-relaxed">{error}</p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-[#252A36] bg-[#0F1218] flex items-center justify-end gap-2.5">
          {isExporting ? (
            <button
              type="button"
              onClick={onCancelExport}
              className="px-4 py-2 text-xs font-medium text-[#F87171] hover:bg-[#1A1E28] border border-[#252A36] rounded-lg transition-colors cursor-pointer"
            >
              Cancel Export
            </button>
          ) : completedRecord ? (
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#F3F5F8] bg-[#1A1E28] hover:bg-[#232836] border border-[#252A36] rounded-lg transition-colors cursor-pointer"
            >
              Done
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-[#9CA3B2] hover:text-[#F3F5F8] rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onStartExport}
                className="px-4 py-2 text-xs font-medium text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg transition-colors whitespace-nowrap cursor-pointer"
              >
                Start Local Render
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
