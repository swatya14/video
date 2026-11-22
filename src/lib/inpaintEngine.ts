import type { WatermarkRegion } from "../types/watermark";

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0 || 1), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Computes mask alpha (0..1) inside a region with rounded corners and edge feathering.
 */
function computeMaskWeight(
  lx: number,
  ly: number,
  w: number,
  h: number,
  feather: number,
  rounded: boolean
): number {
  const halfW = w * 0.5;
  const halfH = h * 0.5;
  const px = Math.abs(lx - halfW);
  const py = Math.abs(ly - halfH);

  let signedDist: number;
  if (rounded) {
    const cornerRadius = Math.min(halfW, halfH) * 0.32;
    const qx = px - (halfW - cornerRadius);
    const qy = py - (halfH - cornerRadius);
    const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
    const inDist = Math.min(Math.max(qx, qy), 0);
    signedDist = outDist + inDist - cornerRadius;
  } else {
    signedDist = Math.max(px - halfW, py - halfH);
  }

  if (signedDist >= 0) return 0;
  const innerDist = -signedDist;
  const f = Math.max(1, feather);
  return smoothstep(0, f, innerDist);
}

/**
 * Deterministic lightweight spatial noise for natural film grain matching.
 */
function hashNoise(x: number, y: number, seed: number): number {
  let n = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  n = (n ^ (n >> 13)) * 1274126177;
  n = n ^ (n >> 16);
  return ((n & 0xff) / 255 - 0.5) * 2;
}

/**
 * Applies watermark removal directly onto a CanvasRenderingContext2D for all active regions.
 * Operates strictly on the local bounding box around each region so 1080p/4K frames run at 60fps.
 */
export function applyWatermarkRemoval(
  ctx: CanvasRenderingContext2D,
  frameWidth: number,
  frameHeight: number,
  regions: WatermarkRegion[],
  currentTime: number
): void {
  const frameSeed = Math.floor(currentTime * 30);

  for (const region of regions) {
    if (!region.enabled) continue;
    if (currentTime < region.startTime - 0.04 || currentTime > region.endTime + 0.04) {
      continue;
    }

    const rx = Math.round(region.x * frameWidth);
    const ry = Math.round(region.y * frameHeight);
    const rw = Math.max(6, Math.round(region.width * frameWidth));
    const rh = Math.max(6, Math.round(region.height * frameHeight));

    const bx = clamp(rx, 0, frameWidth - 2);
    const by = clamp(ry, 0, frameHeight - 2);
    const bw = clamp(rw, 2, frameWidth - bx);
    const bh = clamp(rh, 2, frameHeight - by);

    const strengthRatio = clamp(region.strength / 100, 0, 1);
    if (strengthRatio <= 0.001) continue;

    if (region.mode === "adaptive-blur") {
      applyAdaptiveBlur(ctx, bx, by, bw, bh, frameWidth, frameHeight, region, strengthRatio);
    } else if (region.mode === "texture-patch") {
      applyTexturePatch(ctx, bx, by, bw, bh, frameWidth, frameHeight, region, strengthRatio);
    } else {
      applyDelogoInpaint(
        ctx,
        bx,
        by,
        bw,
        bh,
        frameWidth,
        frameHeight,
        region,
        strengthRatio,
        region.mode === "corner-radial",
        frameSeed
      );
    }
  }
}

/**
 * FFmpeg-inspired Delogo & Corner-Aware Radial Bilinear Edge Interpolation.
 * Samples clean exterior border bands and interpolates smoothly across the masked region.
 */
function applyDelogoInpaint(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  frameW: number,
  frameH: number,
  region: WatermarkRegion,
  strengthRatio: number,
  cornerAware: boolean,
  frameSeed: number
): void {
  const sampleMargin = 4;
  const padL = Math.min(sampleMargin, bx);
  const padT = Math.min(sampleMargin, by);
  const padR = Math.min(sampleMargin, frameW - (bx + bw));
  const padB = Math.min(sampleMargin, frameH - (by + bh));

  const sx = bx - padL;
  const sy = by - padT;
  const sw = bw + padL + padR;
  const sh = bh + padT + padB;

  const imgData = ctx.getImageData(sx, sy, sw, sh);
  const src = new Uint8ClampedArray(imgData.data);
  const dst = imgData.data;

  // Detect whether each side is near the canvas edge (unreliable for corner watermarks)
  const edgeThreshold = Math.max(8, Math.round(Math.min(frameW, frameH) * 0.025));
  const hasTop = by > edgeThreshold;
  const hasBottom = by + bh < frameH - edgeThreshold;
  const hasLeft = bx > edgeThreshold;
  const hasRight = bx + bw < frameW - edgeThreshold;

  // Weight multiplier per side: corner-radial strongly favors interior clean edges
  const sideWeightTop = cornerAware ? (hasTop ? 1.0 : 0.08) : padT > 0 ? 1.0 : 0.05;
  const sideWeightBottom = cornerAware ? (hasBottom ? 1.0 : 0.08) : padB > 0 ? 1.0 : 0.05;
  const sideWeightLeft = cornerAware ? (hasLeft ? 1.0 : 0.08) : padL > 0 ? 1.0 : 0.05;
  const sideWeightRight = cornerAware ? (hasRight ? 1.0 : 0.08) : padR > 0 ? 1.0 : 0.05;

  // Precompute smoothed exterior border profiles for top, bottom, left, right
  const topStrip = new Float32Array(bw * 3);
  const botStrip = new Float32Array(bw * 3);
  const leftStrip = new Float32Array(bh * 3);
  const rightStrip = new Float32Array(bh * 3);

  let borderVarianceSum = 0;
  let borderSamples = 0;

  // Sample top & bottom strips (average across sample depth + 3px horizontal box filter)
  for (let x = 0; x < bw; x++) {
    let tr = 0, tg = 0, tb = 0, tc = 0;
    let br = 0, bg = 0, bb = 0, bc = 0;
    for (let dx = -2; dx <= 2; dx++) {
      const gx = clamp(padL + x + dx, 0, sw - 1);
      if (padT > 0) {
        const gy = Math.max(0, padT - Math.min(2, padT));
        const idx = (gy * sw + gx) * 4;
        tr += src[idx];
        tg += src[idx + 1];
        tb += src[idx + 2];
        tc++;
      }
      if (padB > 0) {
        const gy = Math.min(sh - 1, padT + bh + Math.min(1, padB - 1));
        const idx = (gy * sw + gx) * 4;
        br += src[idx];
        bg += src[idx + 1];
        bb += src[idx + 2];
        bc++;
      }
    }
    if (tc > 0) {
      topStrip[x * 3] = tr / tc;
      topStrip[x * 3 + 1] = tg / tc;
      topStrip[x * 3 + 2] = tb / tc;
      if (x > 0) {
        borderVarianceSum += Math.abs(topStrip[x * 3] - topStrip[(x - 1) * 3]);
        borderSamples++;
      }
    }
    if (bc > 0) {
      botStrip[x * 3] = br / bc;
      botStrip[x * 3 + 1] = bg / bc;
      botStrip[x * 3 + 2] = bb / bc;
    }
  }

  // Sample left & right strips
  for (let y = 0; y < bh; y++) {
    let lr = 0, lg = 0, lb = 0, lc = 0;
    let rr = 0, rg = 0, rb = 0, rc = 0;
    for (let dy = -2; dy <= 2; dy++) {
      const gy = clamp(padT + y + dy, 0, sh - 1);
      if (padL > 0) {
        const gx = Math.max(0, padL - Math.min(2, padL));
        const idx = (gy * sw + gx) * 4;
        lr += src[idx];
        lg += src[idx + 1];
        lb += src[idx + 2];
        lc++;
      }
      if (padR > 0) {
        const gx = Math.min(sw - 1, padL + bw + Math.min(1, padR - 1));
        const idx = (gy * sw + gx) * 4;
        rr += src[idx];
        rg += src[idx + 1];
        rb += src[idx + 2];
        rc++;
      }
    }
    if (lc > 0) {
      leftStrip[y * 3] = lr / lc;
      leftStrip[y * 3 + 1] = lg / lc;
      leftStrip[y * 3 + 2] = lb / lc;
      if (y > 0) {
        borderVarianceSum += Math.abs(leftStrip[y * 3] - leftStrip[(y - 1) * 3]);
        borderSamples++;
      }
    }
    if (rc > 0) {
      rightStrip[y * 3] = rr / rc;
      rightStrip[y * 3 + 1] = rg / rc;
      rightStrip[y * 3 + 2] = rb / rc;
    }
  }

  // Estimate natural subtle film grain amplitude from exterior pixels
  const avgDiff = borderSamples > 0 ? borderVarianceSum / borderSamples : 0;
  const grainAmp = region.grainMatch ? clamp(avgDiff * 0.65, 1.2, 6.5) : 0;

  const feather = clamp(region.feather, 0, Math.min(bw, bh) * 0.45);
  const rounded = region.shape === "rounded";
  const eps = 1.5;

  for (let y = 0; y < bh; y++) {
    const gy = padT + y;
    const distT = y + eps;
    const distB = bh - 1 - y + eps;

    // Power-law inverse distance weighting produces smoother gradients than linear
    const wT = padT > 0 ? sideWeightTop / (distT * Math.sqrt(distT)) : 0;
    const wB = padB > 0 ? sideWeightBottom / (distB * Math.sqrt(distB)) : 0;

    const lIdx = y * 3;
    const rIdx = y * 3;

    for (let x = 0; x < bw; x++) {
      const maskW = computeMaskWeight(x, y, bw, bh, feather, rounded) * strengthRatio;
      if (maskW <= 0.001) continue;

      const distL = x + eps;
      const distR = bw - 1 - x + eps;

      const wL = padL > 0 ? sideWeightLeft / (distL * Math.sqrt(distL)) : 0;
      const wR = padR > 0 ? sideWeightRight / (distR * Math.sqrt(distR)) : 0;

      const totalW = wT + wB + wL + wR;
      if (totalW <= 0) continue;

      const tIdx = x * 3;
      let ir =
        (topStrip[tIdx] * wT +
          botStrip[tIdx] * wB +
          leftStrip[lIdx] * wL +
          rightStrip[rIdx] * wR) /
        totalW;
      let ig =
        (topStrip[tIdx + 1] * wT +
          botStrip[tIdx + 1] * wB +
          leftStrip[lIdx + 1] * wL +
          rightStrip[rIdx + 1] * wR) /
        totalW;
      let ib =
        (topStrip[tIdx + 2] * wT +
          botStrip[tIdx + 2] * wB +
          leftStrip[lIdx + 2] * wL +
          rightStrip[rIdx + 2] * wR) /
        totalW;

      if (grainAmp > 0) {
        const n = hashNoise(bx + x, by + y, frameSeed) * grainAmp;
        ir += n;
        ig += n;
        ib += n;
      }

      const gx = padL + x;
      const pIdx = (gy * sw + gx) * 4;
      const invW = 1 - maskW;
      dst[pIdx] = clamp(src[pIdx] * invW + ir * maskW, 0, 255);
      dst[pIdx + 1] = clamp(src[pIdx + 1] * invW + ig * maskW, 0, 255);
      dst[pIdx + 2] = clamp(src[pIdx + 2] * invW + ib * maskW, 0, 255);
    }
  }

  ctx.putImageData(imgData, sx, sy);
}

/**
 * Directional Texture Patch Clone with luminance/color boundary matching.
 * Copies clean adjacent scenery from above/left/below/right and matches seam brightness.
 */
function applyTexturePatch(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  frameW: number,
  frameH: number,
  region: WatermarkRegion,
  strengthRatio: number
): void {
  let dir = region.patchDirection;
  const gap = 3;

  if (dir === "auto") {
    // Prefer picking clean interior texture away from frame edges
    const spaceAbove = by;
    const spaceBelow = frameH - (by + bh);
    const spaceLeft = bx;
    const spaceRight = frameW - (bx + bw);

    if (spaceAbove >= bh + gap && spaceAbove >= spaceBelow) {
      dir = "above";
    } else if (spaceLeft >= bw + gap && spaceLeft >= spaceRight) {
      dir = "left";
    } else if (spaceBelow >= bh + gap) {
      dir = "below";
    } else if (spaceRight >= bw + gap) {
      dir = "right";
    } else {
      dir = spaceAbove >= spaceLeft ? "above" : "left";
    }
  }

  let srcX = bx;
  let srcY = by;
  if (dir === "above") {
    srcY = clamp(by - bh - gap, 0, frameH - bh);
  } else if (dir === "below") {
    srcY = clamp(by + bh + gap, 0, frameH - bh);
  } else if (dir === "left") {
    srcX = clamp(bx - bw - gap, 0, frameW - bw);
  } else if (dir === "right") {
    srcX = clamp(bx + bw + gap, 0, frameW - bw);
  }

  const targetData = ctx.getImageData(bx, by, bw, bh);
  const patchData = ctx.getImageData(srcX, srcY, bw, bh);
  const dst = targetData.data;
  const pSrc = patchData.data;

  // Estimate seam color shift along the shared boundary so lighting gradients align seamlessly
  let dR = 0, dG = 0, dB = 0, count = 0;
  if (dir === "above" || dir === "below") {
    const tRow = dir === "above" ? 0 : bh - 1;
    const pRow = dir === "above" ? bh - 1 : 0;
    for (let x = 0; x < bw; x += 2) {
      const ti = (tRow * bw + x) * 4;
      const pi = (pRow * bw + x) * 4;
      dR += dst[ti] - pSrc[pi];
      dG += dst[ti + 1] - pSrc[pi + 1];
      dB += dst[ti + 2] - pSrc[pi + 2];
      count++;
    }
  } else {
    const tCol = dir === "left" ? 0 : bw - 1;
    const pCol = dir === "left" ? bw - 1 : 0;
    for (let y = 0; y < bh; y += 2) {
      const ti = (y * bw + tCol) * 4;
      const pi = (y * bw + pCol) * 4;
      dR += dst[ti] - pSrc[pi];
      dG += dst[ti + 1] - pSrc[pi + 1];
      dB += dst[ti + 2] - pSrc[pi + 2];
      count++;
    }
  }

  // Clamp color shift to prevent dark/bright artifacts if boundary touches watermark edge
  const shiftR = count > 0 ? clamp((dR / count) * 0.55, -28, 28) : 0;
  const shiftG = count > 0 ? clamp((dG / count) * 0.55, -28, 28) : 0;
  const shiftB = count > 0 ? clamp((dB / count) * 0.55, -28, 28) : 0;

  const feather = clamp(Math.max(4, region.feather), 2, Math.min(bw, bh) * 0.45);
  const rounded = region.shape === "rounded";

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const maskW = computeMaskWeight(x, y, bw, bh, feather, rounded) * strengthRatio;
      if (maskW <= 0.001) continue;

      const idx = (y * bw + x) * 4;
      const invW = 1 - maskW;
      const pr = clamp(pSrc[idx] + shiftR, 0, 255);
      const pg = clamp(pSrc[idx + 1] + shiftG, 0, 255);
      const pb = clamp(pSrc[idx + 2] + shiftB, 0, 255);

      dst[idx] = clamp(dst[idx] * invW + pr * maskW, 0, 255);
      dst[idx + 1] = clamp(dst[idx + 1] * invW + pg * maskW, 0, 255);
      dst[idx + 2] = clamp(dst[idx + 2] * invW + pb * maskW, 0, 255);
    }
  }

  ctx.putImageData(targetData, bx, by);
}

/**
 * Multi-pass feathered soft blur for high-motion complex regions.
 */
function applyAdaptiveBlur(
  ctx: CanvasRenderingContext2D,
  bx: number,
  by: number,
  bw: number,
  bh: number,
  frameW: number,
  frameH: number,
  region: WatermarkRegion,
  strengthRatio: number
): void {
  const radius = Math.max(3, Math.round(4 + (region.feather * 0.55 + strengthRatio * 6)));
  const pad = Math.min(radius + 4, 20);
  const sx = clamp(bx - pad, 0, frameW - 1);
  const sy = clamp(by - pad, 0, frameH - 1);
  const ex = clamp(bx + bw + pad, sx + 1, frameW);
  const ey = clamp(by + bh + pad, sy + 1, frameH);
  const sw = ex - sx;
  const sh = ey - sy;

  const origData = ctx.getImageData(sx, sy, sw, sh);
  const orig = new Uint8ClampedArray(origData.data);
  const bufA = new Uint8ClampedArray(origData.data);
  const bufB = new Uint8ClampedArray(origData.data.length);

  // Two-pass separable box blur approximates Gaussian quickly
  const r = clamp(Math.round(radius * 0.6), 2, 12);
  for (let pass = 0; pass < 2; pass++) {
    // Horizontal pass
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let rr = 0, gg = 0, bb = 0, cnt = 0;
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(sw - 1, x + r);
        for (let k = x0; k <= x1; k++) {
          const i = (y * sw + k) * 4;
          rr += bufA[i];
          gg += bufA[i + 1];
          bb += bufA[i + 2];
          cnt++;
        }
        const o = (y * sw + x) * 4;
        bufB[o] = rr / cnt;
        bufB[o + 1] = gg / cnt;
        bufB[o + 2] = bb / cnt;
        bufB[o + 3] = 255;
      }
    }
    // Vertical pass
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let rr = 0, gg = 0, bb = 0, cnt = 0;
        const y0 = Math.max(0, y - r);
        const y1 = Math.min(sh - 1, y + r);
        for (let k = y0; k <= y1; k++) {
          const i = (k * sw + x) * 4;
          rr += bufB[i];
          gg += bufB[i + 1];
          bb += bufB[i + 2];
          cnt++;
        }
        const o = (y * sw + x) * 4;
        bufA[o] = rr / cnt;
        bufA[o + 1] = gg / cnt;
        bufA[o + 2] = bb / cnt;
        bufA[o + 3] = 255;
      }
    }
  }

  const dst = origData.data;
  const offX = bx - sx;
  const offY = by - sy;
  const feather = clamp(region.feather, 2, Math.min(bw, bh) * 0.45);
  const rounded = region.shape === "rounded";

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const maskW = computeMaskWeight(x, y, bw, bh, feather, rounded) * strengthRatio;
      if (maskW <= 0.001) continue;
      const idx = ((offY + y) * sw + (offX + x)) * 4;
      const invW = 1 - maskW;
      dst[idx] = orig[idx] * invW + bufA[idx] * maskW;
      dst[idx + 1] = orig[idx + 1] * invW + bufA[idx + 1] * maskW;
      dst[idx + 2] = orig[idx + 2] * invW + bufA[idx + 2] * maskW;
    }
  }

  ctx.putImageData(origData, sx, sy);
}
