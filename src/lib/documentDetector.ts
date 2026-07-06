import { Point } from '../types';

/**
 * Grayscales the image, calculates gradients, and scans diagonals inward to detect
 * the 4 corners of a sheet of paper.
 */
export function detectDocumentCorners(img: HTMLImageElement): Point[] {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return getDefaultCorners();

  // Resize to a consistent small resolution for super fast computer vision processing
  const width = 300;
  const height = 400;
  canvas.width = width;
  canvas.height = height;

  ctx.drawImage(img, 0, 0, width, height);
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (e) {
    // Fail-safe for cross-origin canvases
    return getDefaultCorners();
  }
  const data = imageData.data;

  // Convert to grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // Rec. 601 luma coefficients
    gray[i / 4] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }

  // Calculate pixel gradients (Sobel-like)
  const gradient = new Float32Array(width * height);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx = -gray[idx - 1 - width] + gray[idx + 1 - width]
                 - 2 * gray[idx - 1] + 2 * gray[idx + 1]
                 - gray[idx - 1 + width] + gray[idx + 1 + width];
      const gy = -gray[idx - width - 1] - 2 * gray[idx - width] - gray[idx - width + 1]
                 + gray[idx + width - 1] + 2 * gray[idx + width] + gray[idx + width + 1];
      gradient[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  const center = { x: width / 2, y: height / 2 };

  // Scan a ray from start point to target point to find the strongest gradient peak
  function scanRay(startX: number, startY: number, endX: number, endY: number): { x: number; y: number; strength: number } | null {
    const dx = endX - startX;
    const dy = endY - startY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));

    let bestX = startX;
    let bestY = startY;
    let maxGrad = -1;

    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      // Search window: 4% to 85% along the ray length
      if (t < 0.04 || t > 0.85) continue;

      const px = Math.round(startX + dx * t);
      const py = Math.round(startY + dy * t);

      if (px < 1 || px >= width - 1 || py < 1 || py >= height - 1) continue;

      const idx = py * width + px;
      const grad = gradient[idx];

      if (grad > maxGrad) {
        maxGrad = grad;
        bestX = px;
        bestY = py;
      }
    }

    if (maxGrad > 15) { // Minimum threshold for valid edge
      return { x: bestX, y: bestY, strength: maxGrad };
    }
    return null;
  }

  // Average multi-ray search for a single corner region to filter noise
  function findCorner(
    startPoints: { x: number; y: number }[],
    target: { x: number; y: number }
  ): Point {
    let sumX = 0;
    let sumY = 0;
    let count = 0;

    for (const start of startPoints) {
      const result = scanRay(start.x, start.y, target.x, target.y);
      if (result) {
        sumX += result.x;
        sumY += result.y;
        count++;
      }
    }

    if (count > 0) {
      return { x: (sumX / count) / width, y: (sumY / count) / height };
    }
    return { x: startPoints[0].x / width, y: startPoints[0].y / height };
  }

  // Define starting outer-coordinate clusters for finding corners
  const tlPoints = [
    { x: 10, y: 10 },
    { x: 10, y: height * 0.18 },
    { x: width * 0.18, y: 10 },
    { x: width * 0.06, y: height * 0.06 },
  ];
  const trPoints = [
    { x: width - 10, y: 10 },
    { x: width - 10, y: height * 0.18 },
    { x: width * 0.82, y: 10 },
    { x: width - width * 0.06, y: height * 0.06 },
  ];
  const brPoints = [
    { x: width - 10, y: height - 10 },
    { x: width - 10, y: height * 0.82 },
    { x: width * 0.82, y: height - 10 },
    { x: width - width * 0.06, y: height - height * 0.06 },
  ];
  const blPoints = [
    { x: 10, y: height - 10 },
    { x: 10, y: height * 0.82 },
    { x: width * 0.18, y: height - 10 },
    { x: width * 0.06, y: height - height * 0.06 },
  ];

  const tl = findCorner(tlPoints, center);
  const tr = findCorner(trPoints, center);
  const br = findCorner(brPoints, center);
  const bl = findCorner(blPoints, center);

  // Quick sanity checks to avoid overlapping/collapsed shapes
  const minDistance = 0.20;
  const isTooClose =
    Math.hypot(tl.x - tr.x, tl.y - tr.y) < minDistance ||
    Math.hypot(tr.x - br.x, tr.y - br.y) < minDistance ||
    Math.hypot(br.x - bl.x, br.y - bl.y) < minDistance ||
    Math.hypot(bl.x - tl.x, bl.y - tl.y) < minDistance;

  if (isTooClose) {
    return getDefaultCorners();
  }

  // Slightly expand corners outward (2.5%) to ensure the entire page area is preserved safely
  return expandCorners([tl, tr, br, bl], 0.025);
}

/**
 * Returns default beautifully framed corners that align with the on-screen green guide box.
 */
export function getDefaultCorners(): Point[] {
  // Center is y = 0.44, h = 0.72. Top = 0.08, Bottom = 0.80.
  // W = 0.72 / 1.414 = 0.509. Left = 0.2455, Right = 0.7545.
  return [
    { x: 0.24, y: 0.08 }, // TL
    { x: 0.76, y: 0.08 }, // TR
    { x: 0.76, y: 0.80 }, // BR
    { x: 0.24, y: 0.80 }, // BL
  ];
}

function expandCorners(pts: Point[], factor: number): Point[] {
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / 4;

  return pts.map(p => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return {
      x: Math.max(0, Math.min(1, cx + dx * (1 + factor))),
      y: Math.max(0, Math.min(1, cy + dy * (1 + factor))),
    };
  });
}
