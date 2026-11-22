import "dotenv/config";
import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === "production";

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "MY_GEMINI_API_KEY") {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

interface DetectedRegionRaw {
  label: string;
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  suggestedMode?: string;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "12mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/detect-watermark", async (req, res) => {
    try {
      const { imageBase64, mimeType } = req.body ?? {};
      if (typeof imageBase64 !== "string" || imageBase64.length < 100) {
        return res.status(400).json({ error: "A valid video frame image is required." });
      }

      const ai = getGeminiClient();
      if (!ai) {
        return res.status(503).json({
          error:
            "AI auto-detection requires a configured Gemini API key in Settings > Secrets. You can still draw masks manually or apply any corner preset for free.",
        });
      }

      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9.+-]+;base64,/, "");
      const safeMime =
        typeof mimeType === "string" && /^image\/(jpeg|jpg|png|webp)$/.test(mimeType)
          ? mimeType
          : "image/jpeg";

      const response = await ai.models.generateContent({
        model: "gemini-4-hydrogen",
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: safeMime,
                data: cleanBase64,
              },
            },
            {
              text: [
                "Inspect this video frame and locate every visible watermark, corner sparkle icon (such as Gemini or Veo four-point star badges), channel logo, overlaid brand text, or broadcast timestamp.",
                "Return tight bounding boxes with a slight ~6-unit margin around each watermark in normalized 0 to 1000 coordinates (ymin, xmin, ymax, xmax).",
                "Ignore natural scene content (buildings, sky, people, reflections). If no watermark or overlay is present, return an empty array.",
                "For suggestedMode, pick 'corner-radial' for corner sparkles/logos near frame edges, 'texture-patch' for marks over detailed scenery, or 'delogo' for semi-transparent text over smooth gradients.",
              ].join(" "),
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              regions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    label: {
                      type: Type.STRING,
                      description: "Short label describing the detected watermark, e.g. 'Bottom-Right Sparkle'.",
                    },
                    ymin: { type: Type.NUMBER, description: "Top edge in 0-1000 scale" },
                    xmin: { type: Type.NUMBER, description: "Left edge in 0-1000 scale" },
                    ymax: { type: Type.NUMBER, description: "Bottom edge in 0-1000 scale" },
                    xmax: { type: Type.NUMBER, description: "Right edge in 0-1000 scale" },
                    suggestedMode: {
                      type: Type.STRING,
                      description: "One of: corner-radial, delogo, texture-patch, adaptive-blur",
                    },
                  },
                  required: ["label", "ymin", "xmin", "ymax", "xmax"],
                },
              },
            },
            required: ["regions"],
          },
        },
      });

      const rawText = (response.text ?? '{"regions":[]}').trim();
      const parsed = JSON.parse(rawText) as { regions?: DetectedRegionRaw[] };
      const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];

      const normalized = rawRegions
        .map((r) => {
          const x1 = Math.max(0, Math.min(1000, Number(r.xmin) || 0)) / 1000;
          const y1 = Math.max(0, Math.min(1000, Number(r.ymin) || 0)) / 1000;
          const x2 = Math.max(0, Math.min(1000, Number(r.xmax) || 0)) / 1000;
          const y2 = Math.max(0, Math.min(1000, Number(r.ymax) || 0)) / 1000;
          const width = Math.max(0.015, x2 - x1);
          const height = Math.max(0.015, y2 - y1);
          const validModes = ["corner-radial", "delogo", "texture-patch", "adaptive-blur"];
          const mode =
            typeof r.suggestedMode === "string" && validModes.includes(r.suggestedMode)
              ? r.suggestedMode
              : "corner-radial";
          return {
            label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : "Detected Watermark",
            x: x1,
            y: y1,
            width: Math.min(1 - x1, width),
            height: Math.min(1 - y1, height),
            suggestedMode: mode,
          };
        })
        .filter((r) => r.width > 0.01 && r.height > 0.01 && r.width < 0.7 && r.height < 0.7);

      return res.json({ regions: normalized });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to analyze frame for watermarks.";
      return res.status(500).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      const indexFile = path.join(distPath, "index.html");
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send("Build artifacts not found.");
      }
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ClearFrame server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
