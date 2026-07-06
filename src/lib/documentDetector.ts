import { Point } from '../types';

/**
 * Helper to compute area of quadrilateral using Shoelace formula
 */
export function getQuadArea(pts: Point[]): number {
  if (pts.length !== 4) return 0;
  const [p1, p2, p3, p4] = pts;
  return 0.5 * Math.abs(
    (p1.x * p2.y - p1.y * p2.x) +
    (p2.x * p3.y - p2.y * p3.x) +
    (p3.x * p4.y - p3.y * p4.x) +
    (p4.x * p1.y - p4.y * p1.x)
  );
}

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

  // --- Premium Otsu + Largest Connected Component Corner Detector ---
  // Calculates an adaptive threshold based on Otsu's method and extracts the largest bright component.
  try {
    const histogram = new Int32Array(256);
    for (let i = 0; i < gray.length; i++) {
      histogram[gray[i]]++;
    }

    const total = gray.length;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i];
    }

    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let maxVariance = 0;
    let threshold = 127;

    for (let i = 0; i < 256; i++) {
      wB += histogram[i];
      if (wB === 0) continue;
      wF = total - wB;
      if (wF === 0) break;

      sumB += i * histogram[i];
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;

      const varianceBetween = wB * wF * (mB - mF) * (mB - mF);
      if (varianceBetween > maxVariance) {
        maxVariance = varianceBetween;
        threshold = i;
      }
    }

    const binary = new Uint8Array(width * height);
    for (let i = 0; i < gray.length; i++) {
      binary[i] = gray[i] >= threshold ? 1 : 0;
    }

    const visited = new Uint8Array(width * height);
    let maxComponentSize = 0;
    let bestComponentCorners: Point[] | null = null;

    // BFS with a grid-sampling seed finder for 16x speed
    for (let y = 10; y < height - 10; y += 4) {
      for (let x = 10; x < width - 10; x += 4) {
        const idx = y * width + x;
        if (binary[idx] === 1 && visited[idx] === 0) {
          let compSize = 0;
          let minSum = Infinity, maxSum = -Infinity;
          let minDiff = Infinity, maxDiff = -Infinity;
          let tlPt = { x: 0, y: 0 };
          let trPt = { x: 0, y: 0 };
          let brPt = { x: 0, y: 0 };
          let blPt = { x: 0, y: 0 };

          const queue = new Int32Array(width * height);
          let head = 0;
          let tail = 0;

          queue[tail++] = idx;
          visited[idx] = 1;

          while (head < tail) {
            const curr = queue[head++];
            compSize++;

            const cx = curr % width;
            const cy = Math.floor(curr / width);

            const sum = cx + cy;
            const diff = cx - cy;

            if (sum < minSum) {
              minSum = sum;
              tlPt = { x: cx, y: cy };
            }
            if (sum > maxSum) {
              maxSum = sum;
              brPt = { x: cx, y: cy };
            }
            if (diff < minDiff) {
              minDiff = diff;
              blPt = { x: cx, y: cy };
            }
            if (diff > maxDiff) {
              maxDiff = diff;
              trPt = { x: cx, y: cy };
            }

            const neighbors = [
              curr - 1,
              curr + 1,
              curr - width,
              curr + width
            ];

            for (const n of neighbors) {
              if (n >= 0 && n < width * height) {
                const nx = n % width;
                const ny = Math.floor(n / width);
                if (nx >= 2 && nx < width - 2 && ny >= 2 && ny < height - 2) {
                  if (binary[n] === 1 && visited[n] === 0) {
                    visited[n] = 1;
                    queue[tail++] = n;
                  }
                }
              }
            }
          }

          if (compSize > maxComponentSize) {
            maxComponentSize = compSize;
            bestComponentCorners = [
              { x: tlPt.x / width, y: tlPt.y / height },
              { x: trPt.x / width, y: trPt.y / height },
              { x: brPt.x / width, y: brPt.y / height },
              { x: blPt.x / width, y: blPt.y / height }
            ];
          }
        }
      }
    }

    if (bestComponentCorners) {
      const ordered = orderCorners(bestComponentCorners);
      const area = getQuadArea(ordered);
      const minDistance = 0.20;
      const isTooClose =
        Math.hypot(ordered[0].x - ordered[1].x, ordered[0].y - ordered[1].y) < minDistance ||
        Math.hypot(ordered[1].x - ordered[2].x, ordered[1].y - ordered[2].y) < minDistance ||
        Math.hypot(ordered[2].x - ordered[3].x, ordered[2].y - ordered[3].y) < minDistance ||
        Math.hypot(ordered[3].x - ordered[0].x, ordered[3].y - ordered[0].y) < minDistance;

      if (!isTooClose && area > 0.18 && area < 0.95) {
        return expandCorners(ordered, 0.015); // Exquisitely snap to the clean paper margin
      }
    }
  } catch (err) {
    console.error("Premium connected component detector failed, falling back to ray scan:", err);
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

  // Scan a ray from start point to target point to find the paper edge
  function scanRay(
    startX: number,
    startY: number,
    endX: number,
    endY: number
  ): { x: number; y: number; strength: number; grayInside: number; grayOutside: number } | null {
    const dx = endX - startX;
    const dy = endY - startY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));

    // 1. Collect points along the ray
    const pts: { x: number; y: number; grad: number; gray: number }[] = [];
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      // Search window: only scan the outer 68% of the ray to strictly avoid central page text
      if (t < 0.01 || t > 0.68) continue;

      const px = Math.round(startX + dx * t);
      const py = Math.round(startY + dy * t);

      if (px < 1 || px >= width - 1 || py < 1 || py >= height - 1) continue;

      const idx = py * width + px;
      pts.push({ x: px, y: py, grad: gradient[idx], gray: gray[idx] });
    }

    if (pts.length < 8) return null;

    // 2. Smooth the gradient and intensity signal to filter high-frequency noise
    const smoothGrads = new Float32Array(pts.length);
    const smoothGrays = new Float32Array(pts.length);
    for (let j = 0; j < pts.length; j++) {
      let gradSum = 0;
      let graySum = 0;
      let count = 0;
      for (let k = -2; k <= 2; k++) {
        const idx = j + k;
        if (idx >= 0 && idx < pts.length) {
          gradSum += pts[idx].grad;
          graySum += pts[idx].gray;
          count++;
        }
      }
      smoothGrads[j] = gradSum / count;
      smoothGrays[j] = graySum / count;
    }

    // 3. Scan from outside-in (j from 3 to length - 4) to find the paper transition
    // A paper boundary represents a sharp edge leading into a bright region.
    for (let j = 3; j < pts.length - 3; j++) {
      const g = smoothGrads[j];
      if (g >= 12) {
        // Is it a local peak?
        if (g >= smoothGrads[j - 1] && g >= smoothGrads[j + 1]) {
          // Compute average brightness before (outside) and after (inside) the candidate peak
          let grayOutside = 0;
          let grayInside = 0;
          for (let k = 1; k <= 3; k++) {
            grayOutside += smoothGrays[j - k];
            grayInside += smoothGrays[j + k];
          }
          grayOutside /= 3;
          grayInside /= 3;

          // Criterion A: Transition from a darker background to a bright white paper sheet
          const isTransition = grayInside > grayOutside + 10 && grayInside > 105;
          // Criterion B: High-contrast edge on a light-colored background
          const isStrongEdge = g > 18 && grayInside > 130;

          if (isTransition || isStrongEdge) {
            return { x: pts[j].x, y: pts[j].y, strength: g, grayInside, grayOutside };
          }
        }
      }
    }

    // Fallback: Return the highest gradient peak in the first 45% of the ray to prevent empty results
    let bestIdx = -1;
    let maxGrad = -1;
    const limit = Math.round(pts.length * 0.45);
    for (let j = 1; j < limit; j++) {
      if (smoothGrads[j] > maxGrad) {
        maxGrad = smoothGrads[j];
        bestIdx = j;
      }
    }
    if (bestIdx !== -1 && maxGrad > 9) {
      let grayOutside = 0;
      let grayInside = 0;
      let count = 0;
      for (let k = 1; k <= 3; k++) {
        if (bestIdx - k >= 0 && bestIdx + k < pts.length) {
          grayOutside += smoothGrays[bestIdx - k];
          grayInside += smoothGrays[bestIdx + k];
          count++;
        }
      }
      if (count > 0) {
        grayOutside /= count;
        grayInside /= count;
      } else {
        grayOutside = 120;
        grayInside = 180;
      }
      return { x: pts[bestIdx].x, y: pts[bestIdx].y, strength: maxGrad, grayInside, grayOutside };
    }

    return null;
  }

  // Find a corner by selecting the candidate closest to the image boundary
  function findCorner(
    startPoints: { x: number; y: number }[],
    target: { x: number; y: number },
    type: 'tl' | 'tr' | 'br' | 'bl'
  ): Point {
    const candidates: { x: number; y: number; strength: number; grayInside: number; grayOutside: number }[] = [];

    for (const start of startPoints) {
      const result = scanRay(start.x, start.y, target.x, target.y);
      if (result) {
        candidates.push(result);
      }
    }

    if (candidates.length === 0) {
      return { x: startPoints[0].x / width, y: startPoints[0].y / height };
    }

    // Define ideal corner zone centers (normalized)
    let idealX = 0.20;
    let idealY = 0.15;
    if (type === 'tr') { idealX = 0.80; idealY = 0.15; }
    else if (type === 'br') { idealX = 0.80; idealY = 0.85; }
    else if (type === 'bl') { idealX = 0.20; idealY = 0.85; }

    // Sort candidates using multi-factor scan score
    candidates.sort((a, b) => {
      const axNorm = a.x / width;
      const ayNorm = a.y / height;
      const bxNorm = b.x / width;
      const byNorm = b.y / height;

      const distA = Math.hypot(axNorm - idealX, ayNorm - idealY);
      const distB = Math.hypot(bxNorm - idealX, byNorm - idealY);

      const contrastA = Math.max(1, a.grayInside - a.grayOutside);
      const contrastB = Math.max(1, b.grayInside - b.grayOutside);

      // Higher score is better. Score boosts high gradients, transitions, and proximity to ideal zones
      const scoreA = (a.strength * contrastA * a.grayInside) / (1 + 10 * distA);
      const scoreB = (b.strength * contrastB * b.grayInside) / (1 + 10 * distB);

      return scoreB - scoreA;
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

  // Area of the quadrilateral. Default green box is 0.3744.
  // If the detected area is too small, it's a false positive (it probably detected internal text/lines).
  // A threshold of 0.22 prevents false positives on background clutter.
  const area = getQuadArea(orderedCorners);

  if (isTooClose || area < 0.22) {
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
