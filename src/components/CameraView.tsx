import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, Sparkles } from 'lucide-react';
import { Point } from '../types';
import { detectDocumentCorners } from '../lib/documentDetector';

interface CameraViewProps {
  onCapture: (dataUrl: string, autoCorners: Point[]) => void;
  onImageUpload: (dataUrl: string) => void;
}

/**
 * Maps a point in normalized [0,1] video coordinates to container pixel coordinates,
 * taking into account object-cover scaling/offsets and camera mirroring.
 */
function mapVideoToContainer(
  p: Point,
  containerW: number,
  containerH: number,
  videoW: number,
  videoH: number,
  isFrontCamera: boolean
): Point {
  const videoAspect = videoW / videoH;
  const containerAspect = containerW / containerH;

  let scaledW = containerW;
  let scaledH = containerH;
  let xOffset = 0;
  let yOffset = 0;

  if (videoAspect < containerAspect) {
    // Video is narrower/taller than container: scaled to container width
    scaledW = containerW;
    scaledH = containerW / videoAspect;
    yOffset = (scaledH - containerH) / 2;
  } else {
    // Video is wider than container: scaled to container height
    scaledH = containerH;
    scaledW = containerH * videoAspect;
    xOffset = (scaledW - containerW) / 2;
  }

  let xRel = p.x;
  if (isFrontCamera) {
    xRel = 1.0 - xRel;
  }

  const xVideoScaled = xRel * scaledW;
  const yVideoScaled = p.y * scaledH;

  return {
    x: xVideoScaled - xOffset,
    y: yVideoScaled - yOffset,
  };
}

export default function CameraView({ onCapture, onImageUpload }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayBoxRef = useRef<HTMLDivElement | null>(null);
  
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Smooth lerping coords (normalized video coords)
  // Default values match a perfectly centered A4 ratio (1/1.414) box
  const currentRectRef = useRef({ minX: 0.24, minY: 0.08, maxX: 0.76, maxY: 0.80 });
  const targetRectRef = useRef({ minX: 0.24, minY: 0.08, maxX: 0.76, maxY: 0.80 });

  const currentDevice = devices.find(d => d.deviceId === activeDeviceId);
  const isFrontCamera = currentDevice
    ? currentDevice.label.toLowerCase().includes('front') || currentDevice.label.toLowerCase().includes('user')
    : false;

  // Load cameras and start stream
  useEffect(() => {
    async function initCamera() {
      setIsLoading(true);
      setCameraError(null);
      try {
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);

        const backCamera = videoDevices.find(
          device => device.label.toLowerCase().includes('back') || device.label.toLowerCase().includes('environment')
        );
        
        const initialDeviceId = backCamera ? backCamera.deviceId : (videoDevices[0]?.deviceId || '');
        if (initialDeviceId) {
          setActiveDeviceId(initialDeviceId);
        }
        
        await startStream(initialDeviceId);
      } catch (err: any) {
        console.error('Error listing cameras:', err);
        try {
          await startStream();
        } catch (fallbackErr: any) {
          setCameraError(
            'No se pudo acceder a la cámara. Por favor, asegúrate de dar los permisos necesarios o sube una imagen directamente.'
          );
          setIsLoading(false);
        }
      }
    }

    initCamera();

    return () => {
      stopCurrentStream();
    };
  }, []);

  function stopCurrentStream() {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }

  async function startStream(deviceId?: string) {
    stopCurrentStream();
    setIsLoading(true);

    const constraints: MediaStreamConstraints = {
      video: deviceId
        ? { deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } }
        : { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } }
    };

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsLoading(false);
    } catch (err: any) {
      console.error('Error starting stream:', err);
      try {
        const simpleConstraints: MediaStreamConstraints = {
          video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' }
        };
        const mediaStream = await navigator.mediaDevices.getUserMedia(simpleConstraints);
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
        setIsLoading(false);
      } catch (err2: any) {
        setCameraError('Error al iniciar la cámara. Intenta seleccionar otra cámara o subir un archivo.');
        setIsLoading(false);
      }
    }
  }

  async function handleSwitchCamera() {
    if (devices.length <= 1) return;
    const currentIndex = devices.findIndex(d => d.deviceId === activeDeviceId);
    const nextIndex = (currentIndex + 1) % devices.length;
    const nextDeviceId = devices[nextIndex].deviceId;
    setActiveDeviceId(nextDeviceId);
    await startStream(nextDeviceId);
  }

  // Live real-time document boundary detection & smooth interpolation loop
  useEffect(() => {
    if (!stream || !videoRef.current) return;

    let active = true;
    const video = videoRef.current;

    const detectCanvas = document.createElement('canvas');
    detectCanvas.width = 300;
    detectCanvas.height = 400;
    const detectCtx = detectCanvas.getContext('2d');

    // Run computer vision edge-detection at 6fps to keep CPU/GPU extremely cool and battery long
    const detectionInterval = setInterval(() => {
      if (!active || video.readyState < 2) return;

      const videoW = video.videoWidth;
      const videoH = video.videoHeight;
      if (videoW === 0 || videoH === 0) return;

      if (detectCtx) {
        detectCtx.clearRect(0, 0, 300, 400);
        if (isFrontCamera) {
          detectCtx.save();
          detectCtx.translate(300, 0);
          detectCtx.scale(-1, 1);
        }
        detectCtx.drawImage(video, 0, 0, 300, 400);
        if (isFrontCamera) {
          detectCtx.restore();
        }

        try {
          const corners = detectDocumentCorners(detectCanvas);
          if (corners && corners.length === 4) {
            // Find absolute bounds (rectangular bounds only, as requested)
            const minX = Math.min(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
            const maxX = Math.max(corners[0].x, corners[1].x, corners[2].x, corners[3].x);
            const minY = Math.min(corners[0].y, corners[1].y, corners[2].y, corners[3].y);
            const maxY = Math.max(corners[0].y, corners[1].y, corners[2].y, corners[3].y);

            // Bounds must be within a reasonable document ratio/size
            if (maxX - minX > 0.15 && maxY - minY > 0.15) {
              targetRectRef.current = { minX, minY, maxX, maxY };
            } else {
              targetRectRef.current = { minX: 0.24, minY: 0.08, maxX: 0.76, maxY: 0.80 };
            }
          } else {
            // Smoothly ease back to default centered guide box when no document is visible
            targetRectRef.current = { minX: 0.24, minY: 0.08, maxX: 0.76, maxY: 0.80 };
          }
        } catch (err) {
          console.error('Real-time document tracking error:', err);
        }
      }
    }, 160);

    // Dynamic 60fps layout/lerp update loop
    let animFrameId: number;
    const animateOverlay = () => {
      if (!active) return;

      const current = currentRectRef.current;
      const target = targetRectRef.current;

      // Butter-smooth interpolation (lerping)
      current.minX += (target.minX - current.minX) * 0.14;
      current.minY += (target.minY - current.minY) * 0.14;
      current.maxX += (target.maxX - current.maxX) * 0.14;
      current.maxY += (target.maxY - current.maxY) * 0.14;

      if (overlayBoxRef.current && video.clientWidth > 0 && video.clientHeight > 0) {
        const containerW = video.clientWidth;
        const containerH = video.clientHeight;
        const videoW = video.videoWidth || 1920;
        const videoH = video.videoHeight || 1080;

        const tl = mapVideoToContainer(
          { x: current.minX, y: current.minY },
          containerW,
          containerH,
          videoW,
          videoH,
          isFrontCamera
        );
        const br = mapVideoToContainer(
          { x: current.maxX, y: current.maxY },
          containerW,
          containerH,
          videoW,
          videoH,
          isFrontCamera
        );

        const width = Math.max(50, br.x - tl.x);
        const height = Math.max(70, br.y - tl.y);

        overlayBoxRef.current.style.left = `${tl.x}px`;
        overlayBoxRef.current.style.top = `${tl.y}px`;
        overlayBoxRef.current.style.width = `${width}px`;
        overlayBoxRef.current.style.height = `${height}px`;
      }

      animFrameId = requestAnimationFrame(animateOverlay);
    };

    animFrameId = requestAnimationFrame(animateOverlay);

    return () => {
      active = false;
      clearInterval(detectionInterval);
      cancelAnimationFrame(animFrameId);
    };
  }, [stream, activeDeviceId, devices, isFrontCamera]);

  function handleCapture() {
    if (!videoRef.current || !stream) return;

    const video = videoRef.current;
    const videoW = video.videoWidth;
    const videoH = video.videoHeight;

    const canvas = document.createElement('canvas');
    canvas.width = videoW;
    canvas.height = videoH;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (isFrontCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

    const rect = currentRectRef.current;
    const autoCorners = [
      { x: rect.minX, y: rect.minY }, // TL
      { x: rect.maxX, y: rect.minY }, // TR
      { x: rect.maxX, y: rect.maxY }, // BR
      { x: rect.minX, y: rect.maxY }, // BL
    ];

    onCapture(dataUrl, autoCorners);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (dataUrl) {
        onImageUpload(dataUrl);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="relative max-w-md mx-auto w-full h-[580px] bg-[#020305] flex flex-col items-center justify-center overflow-hidden rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.8)] border border-white/10">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        className="hidden"
      />

      {cameraError ? (
        <div className="flex flex-col items-center justify-center p-6 text-center max-w-md z-10">
          <div className="w-16 h-16 bg-red-950/40 border border-red-800 rounded-full flex items-center justify-center text-red-400 mb-4 shadow-lg shadow-red-950/20">
            <Camera className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-semibold text-slate-100 mb-2">Acceso a cámara no disponible</h3>
          <p className="text-slate-400 text-sm mb-6 leading-relaxed">
            {cameraError}
          </p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-medium px-6 py-3 rounded-xl transition duration-200 shadow-lg shadow-emerald-950/20 active:scale-95 cursor-pointer"
          >
            <Upload className="w-5 h-5" />
            Subir foto de la galería
          </button>
        </div>
      ) : (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`absolute w-full h-full object-cover ${isFrontCamera ? '-scale-x-100' : ''}`}
          />

          {!isLoading && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
              {/* Dynamic glowing green bounding box overlaid with massive outer shadow curtain */}
              <div
                ref={overlayBoxRef}
                className="absolute border-[3px] border-emerald-500/85 rounded-xl flex items-center justify-center shadow-[0_0_0_9999px_rgba(2,3,5,0.72),0_0_40px_rgba(16,185,129,0.5)] transition-[border-color] duration-300"
                style={{
                  left: '24%',
                  top: '8%',
                  width: '52%',
                  height: '72%',
                }}
              >
                {/* Neon-edged corners */}
                <div className="absolute -top-[3px] -left-[3px] w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm"></div>
                <div className="absolute -top-[3px] -right-[3px] w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm"></div>
                <div className="absolute -bottom-[3px] -left-[3px] w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm"></div>
                <div className="absolute -bottom-[3px] -right-[3px] w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-sm"></div>

                {/* Animated Scanning Line Laser */}
                <div className="absolute left-0 right-0 h-[2px] bg-emerald-400 shadow-[0_0_15px_#10b981] animate-scan-line"></div>

                {/* Real-time active status banner */}
                <div className="absolute top-4 text-emerald-400 font-mono text-[9px] tracking-widest uppercase bg-black/85 px-3 py-1.5 rounded-md border border-emerald-500/30 backdrop-blur-md">
                  ENFOQUE ACTIVO · AUTO-DETECT
                </div>

                {/* Dynamic pulse sensor */}
                <div className="w-12 h-12 border border-emerald-400/20 rounded-full flex items-center justify-center animate-pulse bg-emerald-500/10">
                  <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_10px_#10b981]"></div>
                </div>
              </div>

              {/* Header info guidance */}
              <div className="absolute top-4 inset-x-0 text-center z-20 pointer-events-none">
                <p className="text-[11px] font-bold text-emerald-400 bg-black/70 py-1.5 px-4 rounded-full border border-emerald-500/10 inline-flex items-center gap-1.5 uppercase tracking-widest backdrop-blur-sm shadow-xl">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                  Detección Automática de Hojas Activa
                </p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-30">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-emerald-400 animate-spin"></div>
              </div>
              <p className="text-slate-400 mt-4 text-sm animate-pulse font-mono tracking-wider">Iniciando cámara...</p>
            </div>
          )}

          {!isLoading && (
            <div className="absolute bottom-5 inset-x-5 flex items-center justify-between gap-4 z-20 px-6 bg-black/60 border border-white/5 backdrop-blur-2xl py-3.5 rounded-2xl shadow-2xl">
              <div className="flex flex-col items-center gap-1">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-12 h-12 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl flex items-center justify-center transition border border-white/10 backdrop-blur shadow-lg cursor-pointer active:scale-95"
                  title="Subir desde galería"
                >
                  <Upload className="w-5 h-5 text-emerald-400" />
                </button>
                <span className="text-[9px] font-mono tracking-wider text-slate-400 uppercase">Galería</span>
              </div>

              <div className="relative -top-8 animate-bounce-slow">
                <div 
                  onClick={handleCapture}
                  className="w-20 h-20 rounded-full bg-black border-[5px] border-emerald-500 hover:border-emerald-400 flex items-center justify-center p-1 cursor-pointer transition-transform active:scale-95 shadow-[0_0_25px_rgba(16,185,129,0.35)]"
                  title="Capturar foto"
                >
                  <div className="w-full h-full rounded-full bg-white hover:bg-slate-100 flex items-center justify-center shadow-[0_0_15px_rgba(255,255,255,0.6)]">
                    <Camera className="w-7 h-7 text-black stroke-[2.5]" />
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-center gap-1">
                {devices.length > 1 ? (
                  <button
                    onClick={handleSwitchCamera}
                    className="w-12 h-12 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl flex items-center justify-center transition border border-white/10 backdrop-blur shadow-lg cursor-pointer active:scale-95"
                    title="Cambiar cámara"
                  >
                    <RefreshCw className="w-5 h-5 text-emerald-400" />
                  </button>
                ) : (
                  <div className="w-12 h-12 bg-white/5 opacity-30 rounded-xl flex items-center justify-center border border-white/10">
                    <RefreshCw className="w-5 h-5 text-slate-600" />
                  </div>
                )}
                <span className="text-[9px] font-mono tracking-wider text-slate-400 uppercase">Rotar</span>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
