import React from "react";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { WatermarkRegion } from "../types/watermark";

export type ViewMode = "cleaned" | "split" | "original";

interface TimelineBarProps {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  isMuted: boolean;
  hasAudioControl: boolean;
  viewMode: ViewMode;
  selectedRegion: WatermarkRegion | null;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onStepFrame: (deltaSec: number) => void;
  onToggleMute: () => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export function formatTimecode(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return "00:00.00";
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const centis = Math.floor((sec - Math.floor(sec)) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(
    centis
  ).padStart(2, "0")}`;
}

export const TimelineBar: React.FC<TimelineBarProps> = ({
  currentTime,
  duration,
  isPlaying,
  isMuted,
  hasAudioControl,
  viewMode,
  selectedRegion,
  onTogglePlay,
  onSeek,
  onStepFrame,
  onToggleMute,
  onViewModeChange,
}) => {
  const safeDuration = Math.max(0.01, duration);
  const progressPct = Math.min(100, Math.max(0, (currentTime / safeDuration) * 100));

  const regionStartPct = selectedRegion
    ? Math.min(100, Math.max(0, (selectedRegion.startTime / safeDuration) * 100))
    : 0;
  const regionEndPct = selectedRegion
    ? Math.min(100, Math.max(0, (selectedRegion.endTime / safeDuration) * 100))
    : 100;

  const handleTrackPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const updateFromClientX = (clientX: number) => {
      const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
      onSeek(ratio * safeDuration);
    };
    updateFromClientX(e.clientX);

    const onMove = (moveEv: PointerEvent) => updateFromClientX(moveEv.clientX);
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="bg-[#13161D] border-t border-[#252A36] px-4 py-3 flex flex-col gap-3">
      {/* Interactive Scrubber with Selected Mask Active Range */}
      <div
        role="slider"
        aria-label="Video playback timeline"
        aria-valuemin={0}
        aria-valuemax={Number(safeDuration.toFixed(2))}
        aria-valuenow={Number(currentTime.toFixed(2))}
        tabIndex={0}
        onPointerDown={handleTrackPointerDown}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onStepFrame(-0.25);
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onStepFrame(0.25);
          }
        }}
        className="relative h-6 flex items-center cursor-pointer select-none group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] rounded"
      >
        <div className="w-full h-1.5 bg-[#252A36] rounded-full relative overflow-hidden">
          {selectedRegion && (
            <div
              className="absolute top-0 bottom-0 bg-[#3B82F6]/30"
              style={{
                left: `${regionStartPct}%`,
                width: `${Math.max(0, regionEndPct - regionStartPct)}%`,
              }}
            />
          )}
          <div
            className="absolute top-0 bottom-0 left-0 bg-[#3B82F6]"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full bg-[#F3F5F8] border-2 border-[#3B82F6] shadow-sm transition-transform group-hover:scale-110"
          style={{ left: `${progressPct}%` }}
        />
      </div>

      {/* Transport Controls & View Mode Segmented Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? "Pause video" : "Play video"}
            className="w-9 h-9 flex items-center justify-center rounded-lg bg-[#1A1E28] hover:bg-[#232836] text-[#F3F5F8] border border-[#252A36] transition-colors cursor-pointer"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(-1 / 30)}
            aria-label="Step back one frame"
            title="Previous frame"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#1A1E28] text-[#9CA3B2] hover:text-[#F3F5F8] transition-colors cursor-pointer"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => onStepFrame(1 / 30)}
            aria-label="Step forward one frame"
            title="Next frame"
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#1A1E28] text-[#9CA3B2] hover:text-[#F3F5F8] transition-colors cursor-pointer"
          >
            <SkipForward className="w-4 h-4" />
          </button>

          {hasAudioControl && (
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={isMuted ? "Unmute audio" : "Mute audio"}
              title={isMuted ? "Unmute" : "Mute"}
              className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-[#1A1E28] text-[#9CA3B2] hover:text-[#F3F5F8] transition-colors cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          )}

          <div className="ml-2 font-mono text-xs tabular-nums text-[#F3F5F8] whitespace-nowrap">
            <span>{formatTimecode(currentTime)}</span>
            <span className="text-[#6B7280] mx-1.5">/</span>
            <span className="text-[#9CA3B2]">{formatTimecode(duration)}</span>
          </div>
        </div>

        {/* Interactive View Mode Segmented Control */}
        <div
          role="group"
          aria-label="Preview mode"
          className="inline-flex items-center p-1 bg-[#0B0D11] border border-[#252A36] rounded-lg"
        >
          {(
            [
              { id: "cleaned", label: "Cleaned" },
              { id: "split", label: "Before / After" },
              { id: "original", label: "Original" },
            ] as const
          ).map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onViewModeChange(tab.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? "bg-[#1A1E28] text-[#F3F5F8] shadow-xs"
                    : "text-[#9CA3B2] hover:text-[#F3F5F8]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
