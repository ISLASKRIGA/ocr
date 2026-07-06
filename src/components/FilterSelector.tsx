import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, FileText, Palette, Sliders, Check } from 'lucide-react';
import { FilterType } from '../types';
import { applyFilterToCanvas } from '../utils/filters';

interface FilterSelectorProps {
  warpedDataUrl: string;
  selectedFilter: FilterType;
  onChange: (filter: FilterType, filteredDataUrl: string) => void;
  onSave: () => void;
  onCancel: () => void;
}

interface FilterOption {
  type: FilterType;
  name: string;
  desc: string;
  icon: React.ComponentType<any>;
  colorClass: string;
}

const FILTER_OPTIONS: FilterOption[] = [
  {
    type: 'original',
    name: 'Original',
    desc: 'Colores de la foto sin modificar',
    icon: Palette,
    colorClass: 'text-slate-400 bg-slate-900 border-slate-800'
  },
  {
    type: 'color-scan',
    name: 'Escáner Color',
    desc: 'Satura tintas y blanquea papel',
    icon: Sparkles,
    colorClass: 'text-amber-400 bg-amber-950/20 border-amber-900/40'
  },
  {
    type: 'bw',
    name: 'Documento B/N',
    desc: 'Texto de alto contraste y fondo puro',
    icon: FileText,
    colorClass: 'text-emerald-400 bg-emerald-950/20 border-emerald-900/40'
  },
  {
    type: 'grayscale',
    name: 'Escala Grises',
    desc: 'Elimina todo color del documento',
    icon: Sliders,
    colorClass: 'text-cyan-400 bg-cyan-950/20 border-cyan-900/40'
  }
];

export default function FilterSelector({
  warpedDataUrl,
  selectedFilter,
  onChange,
  onSave,
  onCancel
}: FilterSelectorProps) {
  const [previewUrls, setPreviewUrls] = useState<Record<FilterType, string>>({
    original: '',
    'color-scan': '',
    bw: '',
    grayscale: ''
  });
  const [isProcessing, setIsProcessing] = useState<boolean>(true);
  const warpedImageRef = useRef<HTMLImageElement | null>(null);

  // Generate the filter previews and the initial active filter dataUrl
  useEffect(() => {
    const img = new Image();
    img.src = warpedDataUrl;
    img.onload = () => {
      warpedImageRef.current = img;

      // Create an offscreen canvas to apply filters
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const previews: Record<FilterType, string> = {
        original: warpedDataUrl,
        'color-scan': '',
        bw: '',
        grayscale: ''
      };

      // Generate other filter previews
      FILTER_OPTIONS.forEach(opt => {
        if (opt.type === 'original') return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const filteredCanvas = applyFilterToCanvas(canvas, opt.type);
        previews[opt.type] = filteredCanvas.toDataURL('image/jpeg', 0.85);
      });

      setPreviewUrls(previews);
      setIsProcessing(false);

      // Trigger standard on-change for initial selection if not set
      const initialFiltered = previews[selectedFilter] || warpedDataUrl;
      onChange(selectedFilter, initialFiltered);
    };
  }, [warpedDataUrl]);

  function handleFilterSelect(type: FilterType) {
    if (isProcessing) return;
    const url = previewUrls[type] || warpedDataUrl;
    onChange(type, url);
  }

  return (
    <div className="flex flex-col h-full bg-[#020305] rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
      {/* Header */}
      <div className="bg-[#020305] p-5 border-b border-white/5 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            MEJORAR CALIDAD DE ESCANEO
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Selecciona un filtro inteligente optimizado para maximizar la legibilidad y contraste.
          </p>
        </div>
      </div>

      {/* Main Preview Container */}
      <div className="flex-1 flex flex-col md:flex-row bg-black/40 overflow-hidden min-h-[300px]">
        {/* Left Side: Big Active Preview */}
        <div className="flex-1 flex items-center justify-center p-6 bg-black/50 border-r border-white/5">
          <div className="relative max-w-full max-h-[50vh] flex items-center justify-center">
            {isProcessing ? (
              <div className="flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
                <p className="text-slate-400 text-xs mt-3">Optimizando filtros de precisión...</p>
              </div>
            ) : (
              <img
                src={previewUrls[selectedFilter] || warpedDataUrl}
                alt="Document Filter Preview"
                className="max-w-full max-h-[50vh] object-contain rounded-lg border border-white/10 shadow-[0_0_50px_rgba(0,0,0,0.8)]"
              />
            )}
          </div>
        </div>

        {/* Right Side: Interactive Filter Options List */}
        <div className="w-full md:w-[320px] bg-[#020305]/80 p-5 flex flex-col justify-between border-t md:border-t-0 border-white/5 backdrop-blur-md">
          <div className="space-y-4 overflow-y-auto max-h-[30vh] md:max-h-none">
            <span className="text-[10px] font-mono tracking-widest text-slate-400 uppercase block">Estilo de Escaneo</span>
            <div className="space-y-3">
              {FILTER_OPTIONS.map(opt => {
                const isActive = selectedFilter === opt.type;
                const Icon = opt.icon;

                return (
                  <button
                    key={opt.type}
                    onClick={() => handleFilterSelect(opt.type)}
                    className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition duration-150 relative cursor-pointer group ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-500/10 shadow-[0_0_15px_rgba(16,185,129,0.1)]'
                        : 'border-white/5 bg-white/5 hover:bg-white/10 hover:border-white/10'
                    }`}
                    disabled={isProcessing}
                  >
                    <div className={`p-2 rounded-lg border shrink-0 ${opt.colorClass}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 pr-6">
                      <h4 className="text-sm font-bold text-slate-200 group-hover:text-white transition-colors">
                        {opt.name}
                      </h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed truncate">
                        {opt.desc}
                      </p>
                    </div>
                    {isActive && (
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center shadow shadow-emerald-950">
                        <Check className="w-3 h-3 text-black stroke-[3px]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-5 border-t border-white/5 mt-5 flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 bg-white/5 hover:bg-white/10 text-slate-300 font-medium py-3 px-4 rounded-xl text-center text-sm border border-white/10 transition active:scale-95 cursor-pointer font-mono uppercase tracking-wider"
            >
              Atrás
            </button>
            <button
              onClick={onSave}
              disabled={isProcessing}
              className="flex-1 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold py-3 px-4 rounded-xl text-center text-sm shadow-lg shadow-emerald-950/30 transition active:scale-95 disabled:opacity-50 cursor-pointer uppercase tracking-wider"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
