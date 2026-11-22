/**
 * Procedural HD 1280x720 animated coastal twilight clip with a crisp bottom-right
 * Gemini-style 4-point sparkle watermark so users can test real-time watermark removal
 * and full export immediately with zero file upload needed.
 */

export const DEMO_VIDEO_WIDTH = 1280;
export const DEMO_VIDEO_HEIGHT = 720;
export const DEMO_VIDEO_DURATION = 10; // seconds

export function renderDemoVideoFrame(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  timeSec: number
): void {
  const t = timeSec % DEMO_VIDEO_DURATION;
  const phase = (t / DEMO_VIDEO_DURATION) * Math.PI * 2;
  const horizonY = height * 0.56;

  // 1. Deep coastal dusk sky gradient
  const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, "#0C1628");
  skyGrad.addColorStop(0.42, "#1A2B48");
  skyGrad.addColorStop(0.76, "#4A435C");
  skyGrad.addColorStop(0.94, "#B56A58");
  skyGrad.addColorStop(1, "#E19A6E");
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, width, horizonY + 2);

  // 2. Setting sun glow near horizon
  const sunX = width * (0.36 + Math.sin(phase * 0.5) * 0.02);
  const sunY = horizonY - height * 0.03;
  const sunGlow = ctx.createRadialGradient(
    sunX,
    sunY,
    height * 0.01,
    sunX,
    sunY,
    height * 0.34
  );
  sunGlow.addColorStop(0, "rgba(255, 224, 178, 0.85)");
  sunGlow.addColorStop(0.25, "rgba(241, 160, 108, 0.42)");
  sunGlow.addColorStop(0.65, "rgba(181, 98, 92, 0.12)");
  sunGlow.addColorStop(1, "rgba(181, 98, 92, 0)");
  ctx.fillStyle = sunGlow;
  ctx.fillRect(0, 0, width, horizonY + 40);

  // 3. Soft drifting twilight clouds
  ctx.save();
  for (let i = 0; i < 6; i++) {
    const cx =
      ((width * (0.14 * i + 0.08) + t * (10 + i * 2.4)) % (width + 320)) - 160;
    const cy = height * (0.13 + (i % 3) * 0.095);
    const rx = width * (0.12 + (i % 2) * 0.06);
    const ry = height * (0.022 + (i % 3) * 0.008);
    const cloudGrad = ctx.createRadialGradient(cx, cy, ry * 0.2, cx, cy, rx);
    cloudGrad.addColorStop(0, "rgba(240, 186, 154, 0.20)");
    cloudGrad.addColorStop(0.55, "rgba(148, 126, 156, 0.12)");
    cloudGrad.addColorStop(1, "rgba(26, 43, 72, 0)");
    ctx.fillStyle = cloudGrad;
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // 4. Distant mountain ridge silhouette
  ctx.fillStyle = "#172033";
  ctx.beginPath();
  ctx.moveTo(0, horizonY);
  const peaks = [
    [0, 0.52],
    [0.08, 0.46],
    [0.18, 0.5],
    [0.29, 0.44],
    [0.41, 0.51],
    [0.54, 0.47],
    [0.67, 0.41],
    [0.79, 0.48],
    [0.9, 0.43],
    [1.0, 0.49],
  ];
  for (const [px, py] of peaks) {
    ctx.lineTo(px * width, py * height);
  }
  ctx.lineTo(width, horizonY);
  ctx.closePath();
  ctx.fill();

  // 5. Ocean water reflection body
  const waterGrad = ctx.createLinearGradient(0, horizonY, 0, height);
  waterGrad.addColorStop(0, "#35374D");
  waterGrad.addColorStop(0.22, "#1E2A40");
  waterGrad.addColorStop(0.65, "#111B2E");
  waterGrad.addColorStop(1, "#0B1220");
  ctx.fillStyle = waterGrad;
  ctx.fillRect(0, horizonY, width, height - horizonY);

  // 6. Animated water ripples & sunset shimmer path
  const rippleCount = 34;
  for (let i = 0; i < rippleCount; i++) {
    const frac = i / rippleCount;
    const y = horizonY + Math.pow(frac, 1.35) * (height - horizonY);
    const waveDrift = Math.sin(phase * 2 + i * 0.75) * (16 + frac * 28);
    const spread = width * (0.04 + frac * 0.17);
    const shimmerW = spread * (0.55 + 0.45 * Math.sin(phase * 3 + i * 1.4));
    const alpha = (1 - frac * 0.65) * 0.32;

    ctx.fillStyle = `rgba(244, 179, 127, ${alpha.toFixed(3)})`;
    ctx.fillRect(
      sunX + waveDrift - shimmerW * 0.5,
      y,
      shimmerW,
      Math.max(1.2, frac * 3.2)
    );

    // Subtle cool ambient swell lines across full frame width
    const swellX = ((i * 197 + t * (24 + frac * 36)) % (width + 200)) - 100;
    ctx.fillStyle = `rgba(116, 152, 206, ${(0.08 * (1 - frac * 0.4)).toFixed(3)})`;
    ctx.fillRect(swellX, y + 3, 90 + frac * 140, Math.max(1, frac * 2));
  }

  // 7. Gentle passing sailboat silhouette for genuine motion continuity
  const boatX = width * (0.62 + Math.sin(phase * 0.5) * 0.045);
  const boatY = horizonY + height * 0.045;
  ctx.fillStyle = "#0B111E";
  ctx.beginPath();
  ctx.moveTo(boatX - 24, boatY);
  ctx.lineTo(boatX + 26, boatY);
  ctx.lineTo(boatX + 18, boatY + 7);
  ctx.lineTo(boatX - 18, boatY + 7);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(boatX, boatY - 34);
  ctx.lineTo(boatX + 17, boatY - 2);
  ctx.lineTo(boatX, boatY - 2);
  ctx.closePath();
  ctx.fill();

  // 8. Simulated Corner Watermark (Gemini-style 4-point sparkle + clean wordmark)
  drawCornerWatermark(ctx, width, height);
}

function drawCornerWatermark(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  const scale = width / 1280;
  const cx = width - 118 * scale;
  const cy = height - 42 * scale;
  const rOuter = 15 * scale;
  const rInner = 4.2 * scale;

  ctx.save();

  // Subtle soft glow behind mark
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 8 * scale;

  // 4-point Gemini-style sparkle icon
  ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const angle = (i * Math.PI) / 4;
    const r = i % 2 === 0 ? rOuter : rInner;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Subtle accompanying corner watermark text
  ctx.font = `600 ${Math.round(18 * scale)}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.84)";
  ctx.textBaseline = "middle";
  ctx.fillText("Gemini", cx + 22 * scale, cy + 1 * scale);

  ctx.restore();
}
