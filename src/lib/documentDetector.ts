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

  // Scan a ray from start point to target point to find the first significant gradient peak
  function scanRay(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { x: number; y: number; strength: number } | null {
    const dx = endX - startX;
    const dy = endY - startY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));

    // 1. Collect points along the ray
    const pts: { x: number; y: number; grad: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      // Search window: 2% to 85% along the ray length
      if (t < 0.02 || t > 0.85) continue;

      const px = Math.round(startX + dx * t);
      const py = Math.round(startY + dy * t);

      if (px < 1 || px >= width - 1 || py < 1 || py >= height - 1) continue;

      const idx = py * width + px;
      pts.push({ x: px, y: py, grad: gradient[idx] });
    }

    if (pts.length < 5) return null;

    // 2. Smooth the gradient signal to filter high-frequency noise
    const smoothGrads = new Float32Array(pts.length);
    let globalMax = 0;
    for (let j = 0; j < pts.length; j++) {
      let sum = 0;
      let count = 0;
      for (let k = -2; k <= 2; k++) {
        const idx = j + k;
        if (idx >= 0 && idx < pts.length) {
          sum += pts[idx].grad;
          count++;
        }
      }
      const smoothed = sum / count;
      smoothGrads[j] = smoothed;
      if (smoothed > globalMax) {
        globalMax = smoothed;
      }
    }

    if (globalMax < 12) return null; // Very faint or no gradients found

    // 3. Scan from the outside-in to find the first significant peak
    // A peak is a local maximum above a dynamic threshold (e.g. 28% of globalMax)
    const threshold = Math.max(16, globalMax * 0.28);
    for (let j = 1; j < pts.length - 1; j++) {
      const g = smoothGrads[j];
      if (g >= threshold) {
        // Check local peak condition (must be greater or equal to immediate neighbors)
        if (g >= smoothGrads[j - 1] && g >= smoothGrads[j + 1]) {
          return { x: pts[j].x, y: pts[j].y, strength: g };
        }
      }
    }

    // Fallback: if no peak is found but we have a globalMax, return the global max point
    let bestIdx = 0;
    let bestVal = -1;
    for (let j = 0; j < pts.length; j++) {
      if (smoothGrads[j] > bestVal) {
        bestVal = smoothGrads[j];
        bestIdx = j;
      }
    }
    if (bestVal > 15) {
      return { x: pts[bestIdx].x, y: pts[bestIdx].y, strength: bestVal };
    }

    return null;
  }

  // Find a corner by selecting the candidate that is closest to the image corner
  function findCorner(
    startPoints: { x: number; y: number }[],
    target: { x: number; y: number },
    type: 'tl' | 'tr' | 'br' | 'bl'
  ): Point {
    const candidates: { x: number; y: number; strength: number }[] = [];

    for (const start of startPoints) {
      const result = scanRay(start.x, start.y, target.x, target.y);
      if (result) {
        candidates.push(result);
      }
    }

    // If no candidate was found on any ray, return the first start point as fallback
    if (candidates.length === 0) {
      return { x: startPoints[0].x / width, y: startPoints[0].y / height };
    }

    // Sort candidates to find the one closest to the corner of the image:
    // - tl: minimizes x^2 + y^2 (closest to 0,0)
    // - tr: minimizes (width - x)^2 + y^2 (closest to width, 0)
    // - br: minimizes (width - x)^2 + (height - y)^2 (closest to width, height)
    // - bl: minimizes x^2 + (height - y)^2 (closest to 0, height)
    candidates.sort((a, b) => {
      let scoreA = 0;
      let scoreB = 0;
      if (type === 'tl') {
        scoreA = a.x * a.x + a.y * a.y;
        scoreB = b.x * b.x + b.y * b.y;
      } else if (type === 'tr') {
        const dxA = width - a.x;
        const dxB = width - b.x;
        scoreA = dxA * dxA + a.y * a.y;
        scoreB = dxB * dxB + b.y * b.y;
      } else if (type === 'br') {
        const dxA = width - a.x;
        const dxB = width - b.x;
        const dyA = height - a.y;
        const dyB = height - b.y;
        scoreA = dxA * dxA + dyA * dyA;
        scoreB = dxB * dxB + dyB * dyB;
      } else if (type === 'bl') {
        const dyA = height - a.y;
        const dyB = height - b.y;
        scoreA = a.x * a.x + dyA * dyA;
        scoreB = b.x * b.x + dyB * dyB;
      }
      return scoreA - scoreB; // Ascending sort: closest is first
    });

    const best = candidates[0];
    return { x: best.x / width, y: best.y / height };
  }

  // Define starting outer-coordinate clusters for finding corners
  const tlPoints = [
    { x: 5, y: 5 },
    { x: 5, y: Math.round(height * 0.12) },
    { x: Math.round(width * 0.12), y: 5 },
    { x: 5, y: Math.round(height * 0.24) },
    { x: Math.round(width * 0.24), y: 5 },
    { x: Math.round(width * 0.06), y: Math.round(height * 0.06) },
    { x: Math.round(width * 0.15), y: Math.round(height * 0.15) },
  ];

  const trPoints = [
    { x: width - 5, y: 5 },
    { x: width - 5, y: Math.round(height * 0.12) },
    { x: Math.round(width * 0.88), y: 5 },
    { x: width - 5, y: Math.round(height * 0.24) },
    { x: Math.round(width * 0.76), y: 5 },
    { x: Math.round(width * 0.94), y: Math.round(height * 0.06) },
    { x: Math.round(width * 0.85), y: Math.round(height * 0.15) },
  ];

  const brPoints = [
    { x: width - 5, y: height - 5 },
    { x: width - 5, y: Math.round(height * 0.88) },
    { x: Math.round(width * 0.88), y: height - 5 },
    { x: width - 5, y: Math.round(height * 0.76) },
    { x: Math.round(width * 0.76), y: height - 5 },
    { x: Math.round(width * 0.94), y: Math.round(height * 0.94) },
    { x: Math.round(width * 0.85), y: Math.round(height * 0.85) },
  ];

  const blPoints = [
    { x: 5, y: height - 5 },
    { x: 5, y: Math.round(height * 0.88) },
    { x: Math.round(width * 0.12), y: height - 5 },
    { x: 5, y: Math.round(height * 0.76) },
    { x: Math.round(width * 0.24), y: height - 5 },
    { x: Math.round(width * 0.06), y: Math.round(height * 0.94) },
    { x: Math.round(width * 0.15), y: Math.round(height * 0.85) },
  ];

  const tl = findCorner(tlPoints, center, 'tl');
  const tr = findCorner(trPoints, center, 'tr');
  const br = findCorner(brPoints, center, 'br');
  const bl = findCorner(blPoints, center, 'bl');

  // Robustly order the corners in a clockwise direction starting from Top-Left
  const orderedCorners = orderCorners([tl, tr, br, bl]);

  // Quick sanity checks to avoid overlapping/collapsed shapes
  const minDistance = 0.20;
  const isTooClose =
    Math.hypot(orderedCorners[0].x - orderedCorners[1].x, orderedCorners[0].y - orderedCorners[1].y) < minDistance ||
    Math.hypot(orderedCorners[1].x - orderedCorners[2].x, orderedCorners[1].y - orderedCorners[2].y) < minDistance ||
    Math.hypot(orderedCorners[2].x - orderedCorners[3].x, orderedCorners[2].y - orderedCorners[3].y) < minDistance ||
    Math.hypot(orderedCorners[3].x - orderedCorners[0].x, orderedCorners[3].y - orderedCorners[0].y) < minDistance;

  if (isTooClose) {
    return getDefaultCorners();
  }

  // Slightly expand corners outward (2.5%) to ensure the entire page area is preserved safely
  return expandCorners(orderedCorners, 0.025);
}

/**
 * Orders 4 points of a quadrilateral in clockwise order starting from Top-Left:
 * [Top-Left, Top-Right, Bottom-Right, Bottom-Left]
 */
export function orderCorners(pts: Point[]): Point[] {
  if (pts.length !== 4) return pts;

  // Calculate centroid (center of mass) of the 4 points
  const cx = pts.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / 4;

  // Map each point to its polar angle relative to the centroid
  const withAngles = pts.map(p => ({
    p,
    angle: Math.atan2(p.y - cy, p.x - cx),
  }));

  // Sort by angle ascending to get [TL, TR, BR, BL]
  withAngles.sort((a, b) => a.angle - b.angle);

  return withAngles.map(item => item.p);
}

/**
 * Returns default beautifully framed corners that align with the on-screen green guide box.
 */
export function getDefaultCorners(): Point[] {
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
