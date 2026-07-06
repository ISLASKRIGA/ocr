import { FilterType } from '../types';

/**
 * Apply scanning enhancement filters to a canvas
 */
export function applyFilterToCanvas(
  srcCanvas: HTMLCanvasElement,
  filterType: FilterType
): HTMLCanvasElement {
  const destCanvas = document.createElement('canvas');
  destCanvas.width = srcCanvas.width;
  destCanvas.height = srcCanvas.height;
  const ctx = destCanvas.getContext('2d');
  if (!ctx) return srcCanvas;

  ctx.drawImage(srcCanvas, 0, 0);
  if (filterType === 'original') {
    return destCanvas;
  }

  const imgData = ctx.getImageData(0, 0, destCanvas.width, destCanvas.height);
  const data = imgData.data;
  const len = data.length;

  if (filterType === 'grayscale') {
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }
  } else if (filterType === 'color-scan' || filterType === 'bw') {
    const w = destCanvas.width;
    const h = destCanvas.height;

    // 1. Grid-based background estimation (flatfield correction)
    const blockW = 16;
    const blockH = 16;
    const bgW = Math.ceil(w / blockW);
    const bgH = Math.ceil(h / blockH);
    const bgR = new Float32Array(bgW * bgH);
    const bgG = new Float32Array(bgW * bgH);
    const bgB = new Float32Array(bgW * bgH);

    for (let by = 0; by < bgH; by++) {
      for (let bx = 0; bx < bgW; bx++) {
        let maxR = 120;
        let maxG = 120;
        let maxB = 120;

        const xStart = bx * blockW;
        const yStart = by * blockH;
        const xEnd = Math.min(w, xStart + blockW);
        const yEnd = Math.min(h, yStart + blockH);

        for (let y = yStart; y < yEnd; y += 2) {
          for (let x = xStart; x < xEnd; x += 2) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luma > (0.299 * maxR + 0.587 * maxG + 0.114 * maxB)) {
              maxR = r;
              maxG = g;
              maxB = b;
            }
          }
        }
        const bgIdx = by * bgW + bx;
        bgR[bgIdx] = Math.max(120, maxR);
        bgG[bgIdx] = Math.max(120, maxG);
        bgB[bgIdx] = Math.max(120, maxB);
      }
    }

    // 2. Smooth the background map to eliminate blocky boundaries (3x3 box blur)
    const smoothR = new Float32Array(bgW * bgH);
    const smoothG = new Float32Array(bgW * bgH);
    const smoothB = new Float32Array(bgW * bgH);
    for (let by = 0; by < bgH; by++) {
      for (let bx = 0; bx < bgW; bx++) {
        let sumR = 0, sumG = 0, sumB = 0, count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = by + dy;
          if (ny < 0 || ny >= bgH) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = bx + dx;
            if (nx < 0 || nx >= bgW) continue;
            const idx = ny * bgW + nx;
            sumR += bgR[idx];
            sumG += bgG[idx];
            sumB += bgB[idx];
            count++;
          }
        }
        const destIdx = by * bgW + bx;
        smoothR[destIdx] = sumR / count;
        smoothG[destIdx] = sumG / count;
        smoothB[destIdx] = sumB / count;
      }
    }

    // 3. Apply division normalization to whiten background and enhance foreground
    for (let y = 0; y < h; y++) {
      const gy = (y / blockH);
      const fy = Math.floor(gy);
      const cy = Math.min(bgH - 1, fy + 1);
      const ty = gy - fy;

      for (let x = 0; x < w; x++) {
        const gx = (x / blockW);
        const fx = Math.floor(gx);
        const cx = Math.min(bgW - 1, fx + 1);
        const tx = gx - fx;

        const idx_00 = fy * bgW + fx;
        const idx_10 = fy * bgW + cx;
        const idx_01 = cy * bgW + fx;
        const idx_11 = cy * bgW + cx;

        const r_bg = (1 - ty) * ((1 - tx) * smoothR[idx_00] + tx * smoothR[idx_10]) + ty * ((1 - tx) * smoothR[idx_01] + tx * smoothR[idx_11]);
        const g_bg = (1 - ty) * ((1 - tx) * smoothG[idx_00] + tx * smoothG[idx_10]) + ty * ((1 - tx) * smoothG[idx_01] + tx * smoothG[idx_11]);
        const b_bg = (1 - ty) * ((1 - tx) * smoothB[idx_00] + tx * smoothB[idx_10]) + ty * ((1 - tx) * smoothB[idx_01] + tx * smoothB[idx_11]);

        const pixelIdx = (y * w + x) * 4;
        const r = data[pixelIdx];
        const g = data[pixelIdx + 1];
        const b = data[pixelIdx + 2];

        // Flatfield division
        const nr = Math.min(255, (r / r_bg) * 255);
        const ng = Math.min(255, (g / g_bg) * 255);
        const nb = Math.min(255, (b / b_bg) * 255);

        const luma = 0.299 * nr + 0.587 * ng + 0.114 * nb;
        const maxC = Math.max(nr, ng, nb);
        const minC = Math.min(nr, ng, nb);
        const sat = maxC - minC;

        let finalR = nr;
        let finalG = ng;
        let finalB = nb;

        if (filterType === 'color-scan') {
          if (luma > 220) {
            finalR = 255;
            finalG = 255;
            finalB = 255;
          } else if (sat > 30) {
            // Preserve colored ink/stamps (e.g. blue pen, orange seals)
            finalR = Math.min(255, Math.max(0, (nr - 12) * 1.15));
            finalG = Math.min(255, Math.max(0, (ng - 12) * 1.15));
            finalB = Math.min(255, Math.max(0, (nb - 12) * 1.15));
          } else {
            // Crispen grey/black text
            const scale = Math.min(1.4, Math.max(1.15, (220 - luma) / 80));
            finalR = Math.min(255, Math.max(0, (nr - 40) * scale));
            finalG = Math.min(255, Math.max(0, (ng - 40) * scale));
            finalB = Math.min(255, Math.max(0, (nb - 40) * scale));
          }
        } else {
          // B&W Document mode: Convert normalized pixel to pure high-contrast grayscale
          const grayVal = 0.299 * nr + 0.587 * ng + 0.114 * nb;
          let finalGray = grayVal;
          if (grayVal > 210) {
            finalGray = 255;
          } else {
            const scale = Math.min(1.5, Math.max(1.2, (210 - grayVal) / 70));
            finalGray = Math.min(255, Math.max(0, (grayVal - 45) * scale));
          }
          finalR = finalGray;
          finalG = finalGray;
          finalB = finalGray;
        }

        data[pixelIdx] = finalR;
        data[pixelIdx + 1] = finalG;
        data[pixelIdx + 2] = finalB;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return destCanvas;
}
