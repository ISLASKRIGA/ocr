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
  } else if (filterType === 'bw') {
    // High-contrast document/text filter
    for (let i = 0; i < len; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const gray = 0.299 * r + 0.587 * g + 0.114 * b;
      
      // Whiten backgrounds, darken text
      let newVal = 0;
      if (gray > 165) {
        newVal = 255;
      } else if (gray < 95) {
        newVal = 0;
      } else {
        newVal = Math.round(((gray - 95) / 70) * 255);
      }

      data[i] = newVal;
      data[i + 1] = newVal;
      data[i + 2] = newVal;
    }
  } else if (filterType === 'color-scan') {
    // Enhances colors and whitens the paper background
    for (let i = 0; i < len; i += 4) {
      let r = data[i];
      let g = data[i + 1];
      let b = data[i + 2];

      const maxChannel = Math.max(r, g, b);
      const minChannel = Math.min(r, g, b);
      const diff = maxChannel - minChannel;

      // If bright enough and low saturation (variance), make it pure white paper
      if (maxChannel > 145 && diff < 30) {
        const factor = 255 / maxChannel;
        r = Math.min(255, Math.round(r * factor));
        g = Math.min(255, Math.round(g * factor));
        b = Math.min(255, Math.round(b * factor));
      } else {
        // Boost contrast and brightness for text readability
        r = Math.min(255, Math.max(0, Math.round((r - 20) * 1.25)));
        g = Math.min(255, Math.max(0, Math.round((g - 20) * 1.25)));
        b = Math.min(255, Math.max(0, Math.round((b - 20) * 1.25)));
      }

      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return destCanvas;
}
