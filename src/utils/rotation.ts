/**
 * Rotates an HTMLImageElement or HTMLCanvasElement by 90 degrees clockwise
 * and returns a new HTMLCanvasElement with the rotated contents.
 */
export function rotateCanvas90(src: HTMLImageElement | HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const w = src instanceof HTMLImageElement ? src.naturalWidth : src.width;
  const h = src instanceof HTMLImageElement ? src.naturalHeight : src.height;

  // Rotating 90 degrees swaps width and height
  canvas.width = h;
  canvas.height = w;

  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Move origin to the center of the destination canvas, rotate, and draw
  ctx.translate(h / 2, w / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, -w / 2, -h / 2);

  return canvas;
}

/**
 * Automatically detects the skew angle of the text in a canvas and returns a corrected canvas.
 * Works by finding the angle between -12 and +12 degrees that maximizes the variance of the horizontal projection profile.
 * Fill margins with solid white paper color to integrate seamlessly.
 */
export function deskewCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const w = canvas.width;
  const h = canvas.height;

  // Downsample to a small resolution for speed
  const sampleW = 150;
  const sampleH = 200;
  const sampleCanvas = document.createElement('canvas');
  sampleCanvas.width = sampleW;
  sampleCanvas.height = sampleH;
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) return canvas;

  sampleCtx.drawImage(canvas, 0, 0, sampleW, sampleH);
  let imgData;
  try {
    imgData = sampleCtx.getImageData(0, 0, sampleW, sampleH);
  } catch (e) {
    return canvas; // Fail-safe (CORS)
  }

  const data = imgData.data;
  // Convert to grayscale & threshold to find text line densities (dark pixels on light background)
  const binary = new Uint8Array(sampleW * sampleH);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const gray = 0.299 * r + 0.587 * g + 0.114 * b;
    // We want dark text pixels as 1, white/light page as 0
    binary[i / 4] = gray < 135 ? 1 : 0;
  }

  // Find the angle between -12 and +12 degrees that maximizes row-projection variance
  let bestAngleDeg = 0;
  let maxVariance = -1;

  // Scan angles from -12 to +12 degrees in steps of 0.5 degrees
  for (let angleDeg = -12; angleDeg <= 12; angleDeg += 0.5) {
    const angleRad = (angleDeg * Math.PI) / 180;
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    // Horizontal projection profile (sum of dark pixels in each row)
    const profile = new Float32Array(sampleH);

    for (let y = 0; y < sampleH; y++) {
      for (let x = 0; x < sampleW; x++) {
        if (binary[y * sampleW + x] === 1) {
          // Find where this pixel projects onto the rotated Y-axis
          const dx = x - sampleW / 2;
          const dy = y - sampleH / 2;
          const rotatedY = Math.round(sampleH / 2 + (dy * cosA - dx * sinA));
          if (rotatedY >= 0 && rotatedY < sampleH) {
            profile[rotatedY]++;
          }
        }
      }
    }

    // Calculate variance of the projection profile
    let sum = 0;
    for (let i = 0; i < sampleH; i++) sum += profile[i];
    const mean = sum / sampleH;

    let varianceSum = 0;
    for (let i = 0; i < sampleH; i++) {
      const diff = profile[i] - mean;
      varianceSum += diff * diff;
    }
    const variance = varianceSum / sampleH;

    if (variance > maxVariance) {
      maxVariance = variance;
      bestAngleDeg = angleDeg;
    }
  }

  // If the detected skew is very small, or too extreme to be trusted, don't rotate
  if (Math.abs(bestAngleDeg) < 0.25 || Math.abs(bestAngleDeg) > 11) {
    return canvas;
  }

  // Rotate the original canvas by -bestAngleDeg to straighten it
  const destCanvas = document.createElement('canvas');
  destCanvas.width = w;
  destCanvas.height = h;
  const destCtx = destCanvas.getContext('2d');
  if (!destCtx) return canvas;

  // Fill with clean white background
  destCtx.fillStyle = '#ffffff';
  destCtx.fillRect(0, 0, w, h);

  destCtx.translate(w / 2, h / 2);
  destCtx.rotate((-bestAngleDeg * Math.PI) / 180);
  destCtx.drawImage(canvas, -w / 2, -h / 2);

  return destCanvas;
}
