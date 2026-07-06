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
