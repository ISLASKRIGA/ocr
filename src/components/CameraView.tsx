import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, Upload, Sparkles, HelpCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface CameraViewProps {
  onCapture: (dataUrl: string) => void;
  onImageUpload: (dataUrl: string) => void;
}

export default function CameraView({ onCapture, onImageUpload }: CameraViewProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load cameras and start stream
  useEffect(() => {
    async function initCamera() {
      setIsLoading(true);
      setCameraError(null);
      try {
        // Enumerate devices first to see what's available
        const allDevices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = allDevices.filter(device => device.kind === 'videoinput');
        setDevices(videoDevices);

        // Find back camera if available, otherwise use first camera
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
        // Fallback to general userMedia request if enumeration failed
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
      // Try again without width/height constraints
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

  function handleCapture() {
    if (!videoRef.current || !stream) return;

    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally if using a front camera for normal viewing
    const currentDevice = devices.find(d => d.deviceId === activeDeviceId);
    const isFrontCamera = currentDevice ? currentDevice.label.toLowerCase().includes('front') || currentDevice.label.toLowerCase().includes('user') : false;

    if (isFrontCamera) {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
    onCapture(dataUrl);
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
    <div className="relative w-full h-[calc(100vh-140px)] md:h-[calc(100vh-160px)] bg-slate-950 flex flex-col items-center justify-center overflow-hidden rounded-2xl shadow-2xl border border-slate-800">
      {/* Invisible file input */}
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
          {/* Main Video Stream */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="absolute w-full h-full object-cover"
          />

          {/* Glowing Green Overlay Bounding Frame */}
          {!isLoading && (
            <div className="absolute inset-0 pointer-events-none flex flex-col justify-between p-6 z-10">
              {/* Semi-transparent mask on outer edges, leaving a clean green rectangle in center */}
              <div className="absolute inset-0 bg-[#020305]/65"></div>

              {/* Green bounding box */}
              <div className="absolute top-[38%] left-1/2 -translate-x-1/2 -translate-y-1/2 h-[48%] sm:h-[52%] max-h-[380px] md:max-h-[440px] aspect-[1/1.414] border-[3px] border-emerald-500/80 rounded-xl flex items-center justify-center shadow-[0_0_40px_rgba(16,185,129,0.25),inset_0_0_30px_rgba(16,185,129,0.15)]">
                {/* Decorative corners */}
                <div className="absolute -top-[3px] -left-[3px] w-8 h-8 border-t-4 border-l-4 border-emerald-400 rounded-tl-sm"></div>
                <div className="absolute -top-[3px] -right-[3px] w-8 h-8 border-t-4 border-r-4 border-emerald-400 rounded-tr-sm"></div>
                <div className="absolute -bottom-[3px] -left-[3px] w-8 h-8 border-b-4 border-l-4 border-emerald-400 rounded-bl-sm"></div>
                <div className="absolute -bottom-[3px] -right-[3px] w-8 h-8 border-b-4 border-r-4 border-emerald-400 rounded-br-sm"></div>

                {/* Animated Scanning Laser Effect */}
                <div className="absolute left-0 right-0 h-[2px] bg-emerald-400 shadow-[0_0_15px_#10b981] animate-scan-line"></div>

                {/* Real-time guide indicators */}
                <div className="absolute top-4 text-emerald-400 font-mono text-[10px] tracking-widest uppercase bg-black/80 px-3 py-1.5 rounded-md border border-emerald-500/30 backdrop-blur-md">
                  ENFOQUE ACTIVO · AUTO-DETECT
                </div>

                <div className="w-12 h-12 border border-emerald-400/20 rounded-full flex items-center justify-center animate-pulse bg-emerald-500/10">
                  <div className="w-2.5 h-2.5 bg-emerald-400 rounded-full shadow-[0_0_10px_#10b981]"></div>
                </div>
              </div>

              {/* Helper text on top */}
              <div className="absolute top-4 inset-x-0 text-center z-20">
                <p className="text-sm md:text-base font-medium text-slate-100 drop-shadow-lg flex items-center justify-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400 animate-pulse" />
                  ALINEA LOS BORDES DE LA HOJA CON EL CUADRO VERDE
                </p>
              </div>
            </div>
          )}

          {/* Loading state */}
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950 flex flex-col items-center justify-center z-30">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/20"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-emerald-400 animate-spin"></div>
              </div>
              <p className="text-slate-400 mt-4 text-sm animate-pulse">Iniciando cámara...</p>
            </div>
          )}

          {/* Overlay controls */}
          {!isLoading && (
            <div className="absolute bottom-8 inset-x-0 flex items-center justify-between gap-4 z-20 px-8 max-w-lg mx-auto bg-black/40 border border-white/5 backdrop-blur-2xl py-4 rounded-3xl shadow-2xl">
              {/* Gallery upload option */}
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

              {/* Huge Shutter Capture Button */}
              <div className="relative -top-10">
                <div 
                  onClick={handleCapture}
                  className="w-24 h-24 rounded-full bg-black border-[6px] border-emerald-500 hover:border-emerald-400 flex items-center justify-center p-1 cursor-pointer transition-transform active:scale-95 shadow-[0_0_30px_rgba(16,185,129,0.35)]"
                  title="Capturar foto"
                >
                  <div className="w-full h-full rounded-full bg-white hover:bg-slate-100 flex items-center justify-center shadow-[0_0_20px_rgba(255,255,255,0.6)]">
                    <Camera className="w-8 h-8 text-black stroke-[2.5]" />
                  </div>
                </div>
              </div>

              {/* Switch camera toggle or placeholder */}
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
