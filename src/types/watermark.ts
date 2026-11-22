export type InpaintMode =
  | "corner-radial"
  | "delogo"
  | "texture-patch"
  | "adaptive-blur";

export type PatchDirection = "auto" | "above" | "below" | "left" | "right";

export type MaskShape = "rounded" | "rectangle";

export interface WatermarkRegion {
  id: string;
  label: string;
  /** Normalized coordinates (0..1 relative to video dimensions) */
  x: number;
  y: number;
  width: number;
  height: number;
  mode: InpaintMode;
  shape: MaskShape;
  feather: number; // 0..24 px
  strength: number; // 0..100 %
  patchDirection: PatchDirection;
  grainMatch: boolean;
  enabled: boolean;
  /** Active time range in seconds */
  startTime: number;
  endTime: number;
}

export interface VideoQueueItem {
  id: string;
  name: string;
  sourceType: "file" | "demo";
  objectUrl?: string;
  fileSize?: number;
  width: number;
  height: number;
  duration: number;
  regions: WatermarkRegion[];
}

export type ExportQuality = "high" | "balanced" | "compact";

export interface ExportRecord {
  id: string;
  sourceName: string;
  fileName: string;
  url: string;
  sizeBytes: number;
  mimeType: string;
  resolution: string;
  duration: number;
  createdAt: number;
}

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  width: number;
  height: number;
  mode: InpaintMode;
}

export const CORNER_PRESETS: PresetDefinition[] = [
  {
    id: "gemini-bottom-right",
    name: "Bottom-Right Sparkle",
    description: "Gemini & Veo corner badge",
    x: 0.855,
    y: 0.885,
    width: 0.132,
    height: 0.095,
    mode: "corner-radial",
  },
  {
    id: "bottom-left",
    name: "Bottom-Left Logo",
    description: "Creator handle or bug",
    x: 0.018,
    y: 0.885,
    width: 0.16,
    height: 0.085,
    mode: "corner-radial",
  },
  {
    id: "top-right",
    name: "Top-Right Badge",
    description: "Broadcast & clip tag",
    x: 0.835,
    y: 0.025,
    width: 0.145,
    height: 0.08,
    mode: "corner-radial",
  },
  {
    id: "top-left",
    name: "Top-Left Stamp",
    description: "Camera date or channel",
    x: 0.018,
    y: 0.025,
    width: 0.165,
    height: 0.075,
    mode: "delogo",
  },
  {
    id: "lower-third",
    name: "Lower-Third Banner",
    description: "Subtitle or promo bar",
    x: 0.25,
    y: 0.88,
    width: 0.5,
    height: 0.085,
    mode: "delogo",
  },
];
