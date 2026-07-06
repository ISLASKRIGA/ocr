import { Point } from '../types';

// Solves A * x = B for a 8x8 system
export function solveGaussian(A: number[][], B: number[]): number[] {
  const n = 8;
  const a = A.map(row => [...row]);
  const b = [...B];

  for (let i = 0; i < n; i++) {
    // Search for maximum in this column
    let maxEl = Math.abs(a[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(a[k][i]) > maxEl) {
        maxEl = Math.abs(a[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row
    if (maxRow !== i) {
      const tempRow = a[maxRow];
      a[maxRow] = a[i];
      a[i] = tempRow;
      const tempB = b[maxRow];
      b[maxRow] = b[i];
      b[i] = tempB;
    }

    // Check for singular matrix
    if (Math.abs(a[i][i]) < 1e-9) {
      return [1, 0, 0, 0, 1, 0, 0, 0];
    }

    // Make all rows below this one 0 in current column
    for (let k = i + 1; k < n; k++) {
      const c = -a[k][i] / a[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          a[k][j] = 0;
        } else {
          a[k][j] += c * a[i][j];
        }
      }
      b[k] += c * b[i];
    }
  }

  // Back substitution
  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = b[i] / a[i][i];
    for (let k = i - 1; k >= 0; k--) {
      b[k] -= a[k][i] * x[i];
    }
  }
  return x;
}

/**
 * Warp a 4-corner selected region from a source image into a flat destination rectangle.
 * Uses Bilinear Interpolation for smooth, crisp text and borders.
 */
export function warpImage(
  srcImg: HTMLImageElement | HTMLCanvasElement,
  srcPoints: Point[],
  destWidth: number,
  destHeight: number
): HTMLCanvasElement {
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = srcImg instanceof HTMLCanvasElement ? srcImg.width : (srcImg as HTMLImageElement).naturalWidth;
  srcCanvas.height = srcImg instanceof HTMLCanvasElement ? srcImg.height : (srcImg as HTMLImageElement).naturalHeight;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Could not get src canvas context');
  srcCtx.drawImage(srcImg, 0, 0);
  const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
  const srcWidth = srcCanvas.width;
  const srcHeight = srcCanvas.height;

  const destCanvas = document.createElement('canvas');
  destCanvas.width = destWidth;
  destCanvas.height = destHeight;
  const destCtx = destCanvas.getContext('2d');
  if (!destCtx) throw new Error('Could not get dest canvas context');
  const destData = destCtx.createImageData(destWidth, destHeight);

  // Target points corresponding to the 4 corners of the destination image
  const destPoints: Point[] = [
    { x: 0, y: 0 },
    { x: destWidth, y: 0 },
    { x: destWidth, y: destHeight },
    { x: 0, y: destHeight }
  ];

  const A: number[][] = [];
  const B: number[] = [];

  for (let i = 0; i < 4; i++) {
    const u = destPoints[i].x;
    const v = destPoints[i].y;
    const x = srcPoints[i].x;
    const y = srcPoints[i].y;

    A.push([u, v, 1, 0, 0, 0, -u * x, -v * x]);
    B.push(x);

    A.push([0, 0, 0, u, v, 1, -u * y, -v * y]);
    B.push(y);
  }

  const h = solveGaussian(A, B);
  const [h0, h1, h2, h3, h4, h5, h6, h7] = h;

  const srcPixels = srcData.data;
  const destPixels = destData.data;

  for (let v = 0; v < destHeight; v++) {
    for (let u = 0; u < destWidth; u++) {
      const denominator = h6 * u + h7 * v + 1;
      const srcX = (h0 * u + h1 * v + h2) / denominator;
      const srcY = (h3 * u + h4 * v + h5) / denominator;

      const xFloor = Math.floor(srcX);
      const yFloor = Math.floor(srcY);
      const xCeil = Math.min(srcWidth - 1, xFloor + 1);
      const yCeil = Math.min(srcHeight - 1, yFloor + 1);

      const dx = srcX - xFloor;
      const dy = srcY - yFloor;

      const destIdx = (v * destWidth + u) * 4;

      if (srcX >= 0 && srcX < srcWidth && srcY >= 0 && srcY < srcHeight) {
        const idx00 = (yFloor * srcWidth + xFloor) * 4;
        const idx10 = (yFloor * srcWidth + xCeil) * 4;
        const idx01 = (yCeil * srcWidth + xFloor) * 4;
        const idx11 = (yCeil * srcWidth + xCeil) * 4;

        for (let channel = 0; channel < 4; channel++) {
          const p00 = srcPixels[idx00 + channel];
          const p10 = srcPixels[idx10 + channel];
          const p01 = srcPixels[idx01 + channel];
          const p11 = srcPixels[idx11 + channel];

          const val = p00 * (1 - dx) * (1 - dy) +
                      p10 * dx * (1 - dy) +
                      p01 * (1 - dx) * dy +
                      p11 * dx * dy;

          destPixels[destIdx + channel] = Math.round(val);
        }
      } else {
        // Out of bounds, fill with clean white paper
        destPixels[destIdx] = 255;
        destPixels[destIdx + 1] = 255;
        destPixels[destIdx + 2] = 255;
        destPixels[destIdx + 3] = 255;
      }
    }
  }

  destCtx.putImageData(destData, 0, 0);
  return destCanvas;
}
