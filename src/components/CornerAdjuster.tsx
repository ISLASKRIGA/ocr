import React, { useRef, useState, useEffect } from 'react';
import { Check, RotateCcw, AlertCircle, Maximize2, Sparkles } from 'lucide-react';
import { Point } from '../types';
import { detectDocumentCorners, getDefaultCorners } from '../lib/documentDetector';

interface CornerAdjusterProps {
  imageUrl: string;
  onConfirm: (corners: Point[]) => void;
  onCancel: () => void;
}

export default function CornerAdjuster({ imageUrl, onConfirm, onCancel }: CornerAdjusterProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const magnifierRef = useRef<HTMLCanvasElement | null>(null);

  // Store corners as relative positions (0 to 1)
  const [corners, setCorners] = useState<Point[]>(getDefaultCorners());
  const [detectedCorners, setDetectedCorners] = useState<Point[] | null>(null);
  const [isAutoDetected, setIsAutoDetected] = useState<boolean>(false);

  const [activeHandle, setActiveHandle] = useState<number | null>(null);
  const [imgLoaded, setImgLoaded] = useState<boolean>(false);
  const [containerSize, setContainerSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // Update canvas sizing and redraw when size or corners change
  useEffect(() => {
    if (!imgLoaded || !imageRef.current || !canvasRef.current) return;

    const img = imageRef.current;
    const canvas = canvasRef.current;

    // We want the canvas to match the displayed image dimensions exactly
    const rect = img.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    setContainerSize({ width: rect.width, height: rect.height });

    drawOverlay();
  }, [corners, imgLoaded, containerSize.width, containerSize.height]);

  // Handle resizing
  useEffect(() => {
    function handleResize() {
      if (imageRef.current) {
        const rect = imageRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    }
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    setImgLoaded(true);

    // Run smart edge detection to snap corners to sheet of paper automatically
    try {
      const autoPts = detectDocumentCorners(img);
      setCorners(autoPts);
      setDetectedCorners(autoPts);
      setIsAutoDetected(true);
    } catch (err) {
      console.error("Fallo la detección automática de hoja:", err);
      const fallback = getDefaultCorners();
      setCorners(fallback);
      setDetectedCorners(fallback);
    }
  }

  function drawOverlay() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;

    // Clear previous drawing
    ctx.clearRect(0, 0, w, h);

    // Convert relative corners to actual canvas coordinates
    const pts = corners.map(pt => ({
      x: pt.x * w,
      y: pt.y * h
    }));

    // Draw shaded outer region (optional, but a transparent green document quad looks amazing)
    // Let's draw the document contour line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < 4; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();

    // Fill polygon with a very light green glow
    ctx.fillStyle = 'rgba(52, 211, 153, 0.12)';
    ctx.fill();

    // Stroke outline with bright emerald green
    ctx.strokeStyle = '#34d399';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(16, 185, 129, 0.5)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0; // reset shadow

    // Draw diagonal helper cross lines lightly to indicate flatness
    ctx.strokeStyle = 'rgba(52, 211, 153, 0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    ctx.lineTo(pts[2].x, pts[2].y);
    ctx.moveTo(pts[1].x, pts[1].y);
    ctx.lineTo(pts[3].x, pts[3].y);
    ctx.stroke();

    // Draw interactive corner handles
    pts.forEach((pt, index) => {
      const isCurrent = activeHandle === index;

      // Handle glow
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isCurrent ? 14 : 10, 0, Math.PI * 2);
      ctx.fillStyle = isCurrent ? 'rgba(52, 211, 153, 0.4)' : 'rgba(52, 211, 153, 0.25)';
      ctx.fill();

      // Handle border
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, isCurrent ? 8 : 6, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#059669';
      ctx.lineWidth = 2.5;
      ctx.fill();
      ctx.stroke();
    });
  }

  // Magnifying Zoom Lens Logic
  function updateMagnifier(cornerIndex: number, clientX: number, clientY: number) {
    const magCanvas = magnifierRef.current;
    const img = imageRef.current;
    if (!magCanvas || !img || !imgLoaded) return;

    const magCtx = magCanvas.getContext('2d');
    if (!magCtx) return;

    const size = 120; // magnifier size in pixels
    magCanvas.width = size;
    magCanvas.height = size;

    const rect = img.getBoundingClientRect();
    const relativeX = (clientX - rect.left) / rect.width;
    const relativeY = (clientY - rect.top) / rect.height;

    // Clamp relative coordinates
    const clampedX = Math.max(0, Math.min(1, relativeX));
    const clampedY = Math.max(0, Math.min(1, relativeY));

    // Calculate source coordinate in original high-res image
    const sourceX = clampedX * naturalSize.width;
    const sourceY = clampedY * naturalSize.height;

    // Clear magnifier canvas
    magCtx.clearRect(0, 0, size, size);

    // Save state to clip as a circular lens
    magCtx.save();
    magCtx.beginPath();
    magCtx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
    magCtx.clip();

    // Draw the zoomed part of the original image
    const zoomFactor = 4; // 4x zoom
    const sourceW = size / zoomFactor;
    const sourceH = size / zoomFactor;

    magCtx.drawImage(
      img,
      sourceX - sourceW / 2,
      sourceY - sourceH / 2,
      sourceW,
      sourceH,
      0,
      0,
      size,
      size
    );

    // Draw central target crosshair (so they know exactly where the vertex is)
    magCtx.strokeStyle = '#ef4444'; // Red crosshair
    magCtx.lineWidth = 2;
    magCtx.beginPath();
    // Horizontal line
    magCtx.moveTo(size / 2 - 10, size / 2);
    magCtx.lineTo(size / 2 + 10, size / 2);
    // Vertical line
    magCtx.moveTo(size / 2, size / 2 - 10);
    magCtx.lineTo(size / 2, size / 2 + 10);
    magCtx.stroke();

    // Draw light inner border
    magCtx.strokeStyle = 'rgba(255,255,255,0.4)';
    magCtx.lineWidth = 1;
    magCtx.stroke();

    magCtx.restore();
  }

  // Handle Dragging
  function getMousePos(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const img = imageRef.current;
    if (!img) return { x: 0, y: 0 };

    const rect = img.getBoundingClientRect();
    let clientX = 0;
    let clientY = 0;

    if ('touches' in e) {
      if (e.touches.length === 0) return { x: 0, y: 0 };
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = (clientX - rect.left) / rect.width;
    const y = (clientY - rect.top) / rect.height;

    return {
      x: Math.max(0, Math.min(1, x)),
      y: Math.max(0, Math.min(1, y))
    };
  }

  function handleStart(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (!imgLoaded || !containerSize.width || !containerSize.height) return;

    const pos = getMousePos(e);
    const w = containerSize.width;
    const h = containerSize.height;

    // Find the closest corner within active touch radius
    let closestIndex = -1;
    let minDistance = 0.08; // visual grab threshold (percentage)

    corners.forEach((pt, idx) => {
      // Calculate visual distance in pixels for realistic grab accuracy
      const dx = (pt.x - pos.x) * (w / h); // account for aspect ratio
      const dy = pt.y - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = idx;
      }
    });

    if (closestIndex !== -1) {
      setActiveHandle(closestIndex);
      
      // Update magnifying glass position
      let clientX = 0;
      let clientY = 0;
      if ('touches' in e) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      updateMagnifier(closestIndex, clientX, clientY);
    }
  }

  function handleMove(e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) {
    if (activeHandle === null) return;
    e.preventDefault(); // prevent scrolling on mobile while dragging

    const pos = getMousePos(e);
    
    // Update active corner positions
    setCorners(prev => {
      const next = [...prev];
      next[activeHandle] = pos;
      return next;
    });

    // Update magnifying glass position
    let clientX = 0;
    let clientY = 0;
    if ('touches' in e) {
      if (e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      }
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    updateMagnifier(activeHandle, clientX, clientY);
  }

  function handleEnd() {
    setActiveHandle(null);
  }

  function handleReset() {
    if (detectedCorners) {
      setCorners([...detectedCorners]);
      setIsAutoDetected(true);
    } else {
      setCorners(getDefaultCorners());
      setIsAutoDetected(false);
    }
  }

  function handleConfirmClick() {
    onConfirm(corners);
  }

  return (
    <div className="flex flex-col h-full bg-[#020305] rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
      {/* Top Header Controls */}
      <div className="bg-[#020305] p-5 border-b border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex flex-wrap items-center gap-2">
            <Maximize2 className="w-5 h-5 text-emerald-400" />
            <span>AJUSTE DE ESQUINAS DE PRECISIÓN</span>
            {isAutoDetected && (
              <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase tracking-widest font-mono">
                <Sparkles className="w-3 h-3 text-emerald-400" />
                Auto-Detectado
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Arrastra los puntos brillantes a las esquinas exactas del papel para una reconstrucción perfecta.
          </p>
        </div>

        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 text-xs bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 px-4 py-2 rounded-xl transition active:scale-95 cursor-pointer font-mono uppercase tracking-wider"
        >
          <RotateCcw className="w-3.5 h-3.5 text-emerald-400" />
          Reiniciar
        </button>
      </div>

      {/* Main Cropping Arena */}
      <div className="relative flex-1 flex items-center justify-center p-6 bg-black/60 overflow-hidden min-h-[300px]">
        <div ref={containerRef} className="relative max-w-full max-h-[60vh] select-none shadow-3xl">
          {/* Main Captured Photo */}
          <img
            ref={imageRef}
            src={imageUrl}
            alt="Captured scan template"
            onLoad={handleImageLoad}
            className="max-w-full max-h-[60vh] object-contain rounded-lg opacity-90 block pointer-events-none border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
          />

          {/* Canvas overlays for dragging, paths, and handles */}
          {imgLoaded && (
            <canvas
              ref={canvasRef}
              onMouseDown={handleStart}
              onMouseMove={handleMove}
              onMouseUp={handleEnd}
              onMouseLeave={handleEnd}
              onTouchStart={handleStart}
              onTouchMove={handleMove}
              onTouchEnd={handleEnd}
              className="absolute inset-0 z-20 cursor-crosshair rounded-lg touch-none"
            />
          )}

          {/* Floating High-Resolution Magnifying Zoom Lens */}
          {activeHandle !== null && (
            <div className="absolute top-4 left-4 z-40 bg-black/95 border border-emerald-500/30 p-2 rounded-full shadow-[0_15px_40px_rgba(0,0,0,0.9)] flex flex-col items-center justify-center animate-fade-in backdrop-blur-md">
              <canvas
                ref={magnifierRef}
                className="w-[120px] h-[120px] rounded-full border border-white/10 bg-black shadow-inner"
              />
              <div className="text-[10px] font-mono font-bold tracking-widest text-emerald-400 mt-1.5 uppercase">
                {activeHandle === 0 ? 'TL' : activeHandle === 1 ? 'TR' : activeHandle === 2 ? 'BR' : 'BL'} ZOOM
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Footer Action Controls */}
      <div className="bg-[#020305] p-5 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between gap-4">
        <button
          onClick={onCancel}
          className="w-full sm:w-auto min-w-[140px] bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 font-medium px-5 py-3 rounded-xl transition duration-150 active:scale-95 cursor-pointer text-center text-sm font-mono uppercase tracking-wider"
        >
          Cancelar
        </button>

        <div className="hidden sm:flex items-center gap-2 text-slate-400 text-xs bg-white/5 py-2.5 px-4 rounded-xl border border-white/5">
          <AlertCircle className="w-4 h-4 text-emerald-400 animate-pulse" />
          <span>La distorsión geométrica 3D será corregida con homografía bilineal.</span>
        </div>

        <button
          onClick={handleConfirmClick}
          className="w-full sm:w-auto min-w-[200px] flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold px-6 py-3 rounded-xl shadow-lg shadow-emerald-950/40 transition duration-150 active:scale-95 cursor-pointer text-center text-sm uppercase tracking-wider"
        >
          <Check className="w-4 h-4 stroke-[3]" />
          Procesar Escaneo
        </button>
      </div>
    </div>
  );
}
