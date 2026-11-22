import React from "react";
import {
  Copy,
  Eye,
  EyeOff,
  Loader2,
  Plus,
  ScanSearch,
  Trash2,
} from "lucide-react";
import {
  CORNER_PRESETS,
  type InpaintMode,
  type PatchDirection,
  type PresetDefinition,
  type WatermarkRegion,
} from "../types/watermark";

interface InspectorPanelProps {
  hasVideo: boolean;
  videoWidth: number;
  videoHeight: number;
  duration: number;
  currentTime: number;
  regions: WatermarkRegion[];
  selectedRegionId: string | null;
  showMaskOutlines: boolean;
  isDetecting: boolean;
  detectNotice: { type: "info" | "error"; message: string } | null;
  onToggleMaskOutlines: () => void;
  onAutoDetect: () => void;
  onAddManualMask: () => void;
  onApplyPreset: (preset: PresetDefinition) => void;
  onSelectRegion: (id: string) => void;
  onUpdateRegion: (id: string, patch: Partial<WatermarkRegion>) => void;
  onDuplicateRegion: (id: string) => void;
  onDeleteRegion: (id: string) => void;
  onClearRegions: () => void;
  onOpenExport: () => void;
}

const MODE_OPTIONS: { id: InpaintMode; label: string; hint: string }[] = [
  { id: "corner-radial", label: "Corner Radial", hint: "Best for Gemini corner badges" },
  { id: "delogo", label: "Delogo Smooth", hint: "4-edge bilinear interpolation" },
  { id: "texture-patch", label: "Texture Patch", hint: "Clones adjacent clean scenery" },
  { id: "adaptive-blur", label: "Soft Blur", hint: "Multi-pass feathered blur" },
];

const PATCH_DIRS: { id: PatchDirection; label: string }[] = [
  { id: "auto", label: "Auto" },
  { id: "above", label: "Above" },
  { id: "left", label: "Left" },
  { id: "below", label: "Below" },
  { id: "right", label: "Right" },
];

export const InspectorPanel: React.FC<InspectorPanelProps> = ({
  hasVideo,
  videoWidth,
  videoHeight,
  duration,
  currentTime,
  regions,
  selectedRegionId,
  showMaskOutlines,
  isDetecting,
  detectNotice,
  onToggleMaskOutlines,
  onAutoDetect,
  onAddManualMask,
  onApplyPreset,
  onSelectRegion,
  onUpdateRegion,
  onDuplicateRegion,
  onDeleteRegion,
  onClearRegions,
  onOpenExport,
}) => {
  const selectedRegion =
    regions.find((r) => r.id === selectedRegionId) ?? regions[0] ?? null;

  return (
    <aside className="w-full lg:w-[320px] xl:w-[340px] shrink-0 bg-[#13161D] border-t lg:border-t-0 lg:border-l border-[#252A36] flex flex-col">
      {/* Detection & Quick Actions */}
      <div className="p-4 border-b border-[#252A36]">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-sm font-semibold text-[#F3F5F8]">
            Watermark Masks
          </h2>
          {hasVideo && (
            <button
              type="button"
              onClick={onToggleMaskOutlines}
              className="text-xs text-[#9CA3B2] hover:text-[#F3F5F8] transition-colors cursor-pointer"
            >
              {showMaskOutlines ? "Hide Boxes" : "Show Boxes"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            disabled={!hasVideo || isDetecting}
            onClick={onAutoDetect}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1E28] hover:bg-[#232836] disabled:opacity-45 disabled:cursor-not-allowed text-[#F3F5F8] border border-[#2B3140] transition-colors whitespace-nowrap cursor-pointer"
          >
            {isDetecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-[#3B82F6]" />
            ) : (
              <ScanSearch className="w-3.5 h-3.5 text-[#3B82F6]" />
            )}
            {isDetecting ? "Scanning..." : "AI Auto-Detect"}
          </button>

          <button
            type="button"
            disabled={!hasVideo}
            onClick={onAddManualMask}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-[#1A1E28] hover:bg-[#232836] disabled:opacity-45 disabled:cursor-not-allowed text-[#F3F5F8] border border-[#2B3140] transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-[#9CA3B2]" />
            Add Mask
          </button>
        </div>

        {detectNotice && (
          <p
            className={`mt-2.5 text-xs leading-relaxed ${
              detectNotice.type === "error" ? "text-[#F87171]" : "text-[#9CA3B2]"
            }`}
          >
            {detectNotice.message}
          </p>
        )}

        {/* Quick Corner Presets */}
        <div className="mt-4">
          <div className="text-xs font-medium text-[#9CA3B2] mb-2">
            One-Click Position Presets
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CORNER_PRESETS.map((preset, index) => (
              <button
                key={preset.id}
                type="button"
                disabled={!hasVideo}
                onClick={() => onApplyPreset(preset)}
                className={`text-left px-2.5 py-2 rounded-lg border border-[#252A36] bg-[#0F1218] hover:bg-[#1A1E28] hover:border-[#343B4D] disabled:opacity-45 disabled:cursor-not-allowed transition-colors cursor-pointer ${
                  index === 0 ? "col-span-2" : ""
                }`}
              >
                <div className="text-xs font-medium text-[#F3F5F8] truncate">
                  {preset.name}
                </div>
                <div className="text-[11px] text-[#6B7280] truncate">
                  {preset.description}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Region List */}
      <div className="p-4 border-b border-[#252A36]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-[#9CA3B2]">
            Active Regions ({regions.length})
          </span>
          {regions.length > 0 && (
            <button
              type="button"
              onClick={onClearRegions}
              className="text-xs text-[#9CA3B2] hover:text-[#F87171] transition-colors cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>

        {regions.length === 0 ? (
          <p className="text-xs text-[#6B7280] py-2 leading-relaxed">
            {hasVideo
              ? "Click and drag directly over a watermark on the video, or select a preset above."
              : "Load a video to add watermark removal regions."}
          </p>
        ) : (
          <div className="space-y-1 max-h-40 overflow-y-auto pr-0.5">
            {regions.map((region) => {
              const active = region.id === selectedRegion?.id;
              return (
                <div
                  key={region.id}
                  onClick={() => onSelectRegion(region.id)}
                  className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border transition-colors cursor-pointer ${
                    active
                      ? "bg-[#1A1E28] border-[#3B82F6]/70"
                      : "bg-transparent border-transparent hover:bg-[#171B24]"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-[#F3F5F8] truncate">
                      {region.label}
                    </div>
                    <div className="font-mono text-[11px] text-[#6B7280] tabular-nums">
                      {region.startTime.toFixed(1)}s – {region.endTime.toFixed(1)}s
                    </div>
                  </div>

                  <div
                    className="flex items-center gap-0.5 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateRegion(region.id, { enabled: !region.enabled })
                      }
                      aria-label={region.enabled ? "Disable mask" : "Enable mask"}
                      title={region.enabled ? "Disable mask" : "Enable mask"}
                      className="p-1.5 rounded text-[#9CA3B2] hover:text-[#F3F5F8] hover:bg-[#252A36] cursor-pointer"
                    >
                      {region.enabled ? (
                        <Eye className="w-3.5 h-3.5" />
                      ) : (
                        <EyeOff className="w-3.5 h-3.5 text-[#6B7280]" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDuplicateRegion(region.id)}
                      aria-label="Duplicate mask"
                      title="Duplicate mask"
                      className="p-1.5 rounded text-[#9CA3B2] hover:text-[#F3F5F8] hover:bg-[#252A36] cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteRegion(region.id)}
                      aria-label="Delete mask"
                      title="Delete mask"
                      className="p-1.5 rounded text-[#9CA3B2] hover:text-[#F87171] hover:bg-[#252A36] cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Selected Mask Fine-Tuning */}
      {hasVideo && selectedRegion && (
        <div className="p-4 flex-1 overflow-y-auto space-y-5">
          {/* Algorithm Selection */}
          <div>
            <label className="block text-xs font-medium text-[#9CA3B2] mb-2">
              Removal Algorithm
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {MODE_OPTIONS.map((opt) => {
                const active = selectedRegion.mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdateRegion(selectedRegion.id, { mode: opt.id })}
                    className={`text-left px-2.5 py-2 rounded-lg border text-xs transition-colors cursor-pointer ${
                      active
                        ? "bg-[#3B82F6]/15 border-[#3B82F6] text-[#F3F5F8]"
                        : "bg-[#0F1218] border-[#252A36] text-[#9CA3B2] hover:text-[#F3F5F8] hover:border-[#343B4D]"
                    }`}
                  >
                    <div className="font-medium truncate">{opt.label}</div>
                    <div className="text-[10px] text-[#6B7280] truncate mt-0.5">
                      {opt.hint}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Texture Patch Source Direction */}
          {selectedRegion.mode === "texture-patch" && (
            <div>
              <span className="block text-xs font-medium text-[#9CA3B2] mb-2">
                Sample Direction
              </span>
              <div className="grid grid-cols-5 gap-1 p-1 bg-[#0B0D11] border border-[#252A36] rounded-lg">
                {PATCH_DIRS.map((d) => {
                  const active = selectedRegion.patchDirection === d.id;
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() =>
                        onUpdateRegion(selectedRegion.id, { patchDirection: d.id })
                      }
                      className={`py-1 text-[11px] font-medium rounded transition-colors cursor-pointer ${
                        active
                          ? "bg-[#1A1E28] text-[#F3F5F8]"
                          : "text-[#9CA3B2] hover:text-[#F3F5F8]"
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edge Feather & Strength Sliders */}
          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="feather-slider" className="text-[#9CA3B2]">
                  Edge Feather
                </label>
                <span className="font-mono tabular-nums text-[#F3F5F8]">
                  {selectedRegion.feather}px
                </span>
              </div>
              <input
                id="feather-slider"
                type="range"
                min={0}
                max={24}
                step={1}
                value={selectedRegion.feather}
                onChange={(e) =>
                  onUpdateRegion(selectedRegion.id, { feather: Number(e.target.value) })
                }
                className="w-full studio-slider"
              />
            </div>

            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <label htmlFor="strength-slider" className="text-[#9CA3B2]">
                  Blend Strength
                </label>
                <span className="font-mono tabular-nums text-[#F3F5F8]">
                  {selectedRegion.strength}%
                </span>
              </div>
              <input
                id="strength-slider"
                type="range"
                min={10}
                max={100}
                step={1}
                value={selectedRegion.strength}
                onChange={(e) =>
                  onUpdateRegion(selectedRegion.id, { strength: Number(e.target.value) })
                }
                className="w-full studio-slider"
              />
            </div>
          </div>

          {/* Shape & Grain Controls */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex-1">
              <span className="block text-xs text-[#9CA3B2] mb-1.5">Mask Shape</span>
              <div className="grid grid-cols-2 gap-1 p-1 bg-[#0B0D11] border border-[#252A36] rounded-lg">
                {(["rounded", "rectangle"] as const).map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    onClick={() => onUpdateRegion(selectedRegion.id, { shape })}
                    className={`py-1 text-xs font-medium rounded capitalize transition-colors cursor-pointer ${
                      selectedRegion.shape === shape
                        ? "bg-[#1A1E28] text-[#F3F5F8]"
                        : "text-[#9CA3B2] hover:text-[#F3F5F8]"
                    }`}
                  >
                    {shape}
                  </button>
                ))}
              </div>
            </div>

            {(selectedRegion.mode === "corner-radial" ||
              selectedRegion.mode === "delogo") && (
              <div className="pt-5">
                <label className="inline-flex items-center gap-2 text-xs text-[#9CA3B2] cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selectedRegion.grainMatch}
                    onChange={(e) =>
                      onUpdateRegion(selectedRegion.id, {
                        grainMatch: e.target.checked,
                      })
                    }
                    className="rounded border-[#343B4D] bg-[#0B0D11] accent-[#3B82F6] w-3.5 h-3.5"
                  />
                  Grain Match
                </label>
              </div>
            )}
          </div>

          {/* Active Time Range for Moving Watermarks */}
          <div className="pt-3 border-t border-[#252A36]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[#9CA3B2]">
                Active Time Interval
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateRegion(selectedRegion.id, { startTime: 0, endTime: duration })
                }
                className="text-[11px] text-[#3B82F6] hover:underline cursor-pointer"
              >
                Full Clip
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex items-center justify-between text-[11px] text-[#6B7280] mb-1">
                  <span>Start (s)</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRegion(selectedRegion.id, {
                        startTime: Math.min(currentTime, selectedRegion.endTime),
                      })
                    }
                    className="text-[#9CA3B2] hover:text-[#F3F5F8] cursor-pointer"
                  >
                    Set Here
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={Number(selectedRegion.startTime.toFixed(2))}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(selectedRegion.endTime, Number(e.target.value) || 0));
                    onUpdateRegion(selectedRegion.id, { startTime: v });
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0D11] border border-[#252A36] font-mono text-xs tabular-nums text-[#F3F5F8] focus:outline-none focus:border-[#3B82F6]"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-[11px] text-[#6B7280] mb-1">
                  <span>End (s)</span>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRegion(selectedRegion.id, {
                        endTime: Math.max(currentTime, selectedRegion.startTime),
                      })
                    }
                    className="text-[#9CA3B2] hover:text-[#F3F5F8] cursor-pointer"
                  >
                    Set Here
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  max={duration}
                  step={0.1}
                  value={Number(selectedRegion.endTime.toFixed(2))}
                  onChange={(e) => {
                    const v = Math.min(
                      duration,
                      Math.max(selectedRegion.startTime, Number(e.target.value) || 0)
                    );
                    onUpdateRegion(selectedRegion.id, { endTime: v });
                  }}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-[#0B0D11] border border-[#252A36] font-mono text-xs tabular-nums text-[#F3F5F8] focus:outline-none focus:border-[#3B82F6]"
                />
              </div>
            </div>
          </div>

          {/* Pixel Coordinates Readout */}
          <div className="pt-3 border-t border-[#252A36] flex items-center justify-between font-mono text-[11px] tabular-nums text-[#6B7280]">
            <span>
              X {Math.round(selectedRegion.x * videoWidth)} · Y{" "}
              {Math.round(selectedRegion.y * videoHeight)}
            </span>
            <span>
              {Math.round(selectedRegion.width * videoWidth)} ×{" "}
              {Math.round(selectedRegion.height * videoHeight)} px
            </span>
          </div>
        </div>
      )}

      {/* Bottom Sticky Export Footer inside Inspector */}
      {hasVideo && (
        <div className="p-4 border-t border-[#252A36] bg-[#10131A] mt-auto">
          <button
            type="button"
            onClick={onOpenExport}
            className="w-full py-2.5 px-4 text-sm font-medium text-white bg-[#3B82F6] hover:bg-[#2563EB] rounded-lg transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
          >
            Export Clean Video
          </button>
          <p className="mt-2 text-center text-[11px] text-[#6B7280]">
            Free unlimited exports · Original resolution
          </p>
        </div>
      )}
    </aside>
  );
};
