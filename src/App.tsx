import React, { useState, useEffect } from 'react';
import { Camera, FileText, CheckCircle, Sparkles, HelpCircle, ArrowLeft, RefreshCw, FolderOpen } from 'lucide-react';
import { AppStep, FilterType, Point, ScannedPage } from './types';
import CameraView from './components/CameraView';
import CornerAdjuster from './components/CornerAdjuster';
import FilterSelector from './components/FilterSelector';
import DocumentList from './components/DocumentList';
import { warpImage } from './utils/homography';
import { motion, AnimatePresence } from 'motion/react';
import { detectDocumentCorners, orderCorners } from './lib/documentDetector';
import { rotateCanvas90 } from './utils/rotation';
import { applyFilterToCanvas } from './utils/filters';

export default function App() {
  const [activeStep, setActiveStep] = useState<AppStep>('camera');
  const [pages, setPages] = useState<ScannedPage[]>([]);
  const [docName, setDocName] = useState<string>('');

  // Temp states during the scanning funnel
  const [tempOriginalUrl, setTempOriginalUrl] = useState<string | null>(null);
  const [tempCorners, setTempCorners] = useState<Point[] | null>(null);
  const [tempWarpedUrl, setTempWarpedUrl] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>('color-scan');
  const [tempFilteredUrl, setTempFilteredUrl] = useState<string | null>(null);
  const [warpedSize, setWarpedSize] = useState<{ width: number; height: number }>({ width: 1000, height: 1414 });
  const [isWarping, setIsWarping] = useState<boolean>(false);

  // Set default document name with date on load
  useEffect(() => {
    const date = new Date();
    const pad = (num: number) => String(num).padStart(2, '0');
    const dateStr = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    setDocName(`Documento_Escaneado_${dateStr}`);
  }, []);

  // When a user has pages, we show the list, but if they clear them, we open the camera automatically
  useEffect(() => {
    if (pages.length === 0 && activeStep === 'document') {
      setActiveStep('camera');
    }
  }, [pages, activeStep]);

  // Performs the actual perspective warp
  function processWarpAndAdvance(imageUrl: string, corners: Point[]) {
    setIsWarping(true);
    
    // Always order corners clockwise starting from Top-Left to guarantee correct upright warping
    const orderedCorners = orderCorners(corners);
    setTempCorners(orderedCorners);

    const img = new Image();
    img.src = imageUrl;
    img.onload = () => {
      try {
        const naturalW = img.naturalWidth;
        const naturalH = img.naturalHeight;

        // Convert relative coordinates back to high-res pixel coordinates
        const pixelCorners = orderedCorners.map(c => ({
          x: c.x * naturalW,
          y: c.y * naturalH
        }));

        // Analyze if the captured quadrilateral is landscape or portrait
        // Points index order: 0: TL, 1: TR, 2: BR, 3: BL
        const widthTop = Math.hypot(pixelCorners[1].x - pixelCorners[0].x, pixelCorners[1].y - pixelCorners[0].y);
        const widthBottom = Math.hypot(pixelCorners[2].x - pixelCorners[3].x, pixelCorners[2].y - pixelCorners[3].y);
        const heightLeft = Math.hypot(pixelCorners[3].x - pixelCorners[0].x, pixelCorners[3].y - pixelCorners[0].y);
        const heightRight = Math.hypot(pixelCorners[2].x - pixelCorners[1].x, pixelCorners[2].y - pixelCorners[1].y);

        const avgWidth = (widthTop + widthBottom) / 2;
        const avgHeight = (heightLeft + heightRight) / 2;
        const isLandscape = avgWidth > avgHeight;

        // Use standard A4 1:1.414 aspect ratio targets
        const targetW = isLandscape ? 1414 : 1000;
        const targetH = isLandscape ? 1000 : 1414;
        setWarpedSize({ width: targetW, height: targetH });

        // Run high-resolution warping algorithm (bilinear interpolation)
        const warpedCanvas = warpImage(img, pixelCorners, targetW, targetH);
        const warpedDataUrl = warpedCanvas.toDataURL('image/jpeg', 0.92);

        setTempWarpedUrl(warpedDataUrl);
        // Default to Color Scan filter as it is usually the most pleasant starting point
        setActiveFilter('color-scan');
        setActiveStep('filters');
      } catch (err) {
        console.error('Failed perspective warp:', err);
        alert('Ocurrió un error al procesar la perspectiva del documento. Reajusta los puntos.');
      } finally {
        setIsWarping(false);
      }
    };
  }

  // Capture callback
  function handleImageAcquired(dataUrl: string, autoCorners?: Point[]) {
    setTempOriginalUrl(dataUrl);
    setIsWarping(true); // Show the loading state while analyzing image

    const img = new Image();
    img.src = dataUrl;
    img.onload = () => {
      let finalCorners;
      try {
        // Run smart sheet/paper edge detection!
        finalCorners = detectDocumentCorners(img);
      } catch (err) {
        console.error("Auto-detection failed, using box coordinates", err);
        // Fallback to the bounding box if CV fails
        finalCorners = autoCorners || [
          { x: 0.24, y: 0.08 },
          { x: 0.76, y: 0.08 },
          { x: 0.76, y: 0.80 },
          { x: 0.24, y: 0.80 },
        ];
      }
      
      // Instant auto-crop with detected corners!
      processWarpAndAdvance(dataUrl, finalCorners);
    };

    img.onerror = () => {
      setIsWarping(false);
      // Fallback to manual adjust if image loads incorrectly
      setActiveStep('adjust');
    };
  }

  // Corner confirmation callback: performs warp based on manual adjustment
  function handleCornersConfirmed(corners: Point[]) {
    if (!tempOriginalUrl) return;
    processWarpAndAdvance(tempOriginalUrl, corners);
  }

  // Rotate the warped document 90 degrees clockwise
  function handleRotateWarped() {
    if (!tempWarpedUrl) return;
    setIsWarping(true);

    const img = new Image();
    img.src = tempWarpedUrl;
    img.onload = () => {
      try {
        const rotatedCanvas = rotateCanvas90(img);
        const rotatedDataUrl = rotatedCanvas.toDataURL('image/jpeg', 0.92);

        // Swap width and height for correct layout size (landscape/portrait swap)
        setWarpedSize(prev => ({ width: prev.height, height: prev.width }));
        setTempWarpedUrl(rotatedDataUrl);

        // Reapply the active scan filter on the rotated canvas
        const filterImg = new Image();
        filterImg.src = rotatedDataUrl;
        filterImg.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = filterImg.naturalWidth;
          canvas.height = filterImg.naturalHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(filterImg, 0, 0);
            const filteredCanvas = applyFilterToCanvas(canvas, activeFilter);
            const filteredDataUrl = filteredCanvas.toDataURL('image/jpeg', 0.85);
            setTempFilteredUrl(filteredDataUrl);
          }
          setIsWarping(false);
        };
        filterImg.onerror = () => {
          setIsWarping(false);
        };
      } catch (err) {
        console.error('Failed to rotate:', err);
        setIsWarping(false);
      }
    };
    img.onerror = () => {
      setIsWarping(false);
    };
  }

  // Filter selection callback
  function handleFilterChanged(filter: FilterType, filteredDataUrl: string) {
    setActiveFilter(filter);
    setTempFilteredUrl(filteredDataUrl);
  }

  // Save the page into the active multi-page document container
  function handleSavePage() {
    if (!tempOriginalUrl || !tempWarpedUrl || !tempFilteredUrl) return;

    const newPage: ScannedPage = {
      id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 11),
      originalUrl: tempOriginalUrl,
      warpedUrl: tempWarpedUrl,
      filteredUrl: tempFilteredUrl,
      filterType: activeFilter,
      corners: tempCorners || [],
      width: warpedSize.width,
      height: warpedSize.height
    };

    setPages(prev => [...prev, newPage]);
    
    // Clear temp states
    setTempOriginalUrl(null);
    setTempCorners(null);
    setTempWarpedUrl(null);
    setTempFilteredUrl(null);

    // Transition directly to the pages workspace compilation screen
    setActiveStep('document');
  }

  function handleDeletePage(id: string) {
    setPages(prev => prev.filter(p => p.id !== id));
  }

  function handleResetAll() {
    if (confirm('¿Estás seguro de que deseas vaciar este documento e iniciar un escaneo limpio?')) {
      setPages([]);
      setTempOriginalUrl(null);
      setTempCorners(null);
      setTempWarpedUrl(null);
      setTempFilteredUrl(null);
      setActiveStep('camera');
    }
  }

  return (
    <div className="min-h-screen bg-[#020305] flex flex-col antialiased selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Top Main Navigation Header */}
      <header className="bg-black/40 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-tr from-emerald-500 to-teal-500 rounded-xl flex items-center justify-center shadow-[0_0_25px_rgba(16,185,129,0.4)]">
              <FileText className="w-6 h-6 text-black stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-white tracking-wider flex items-center gap-2 uppercase">
                SCANPRO AI
                <span className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] px-2.5 py-0.5 rounded-md font-bold uppercase tracking-widest">
                  A4 FORMAT
                </span>
              </h1>
              <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest">Corrección de Perspectiva Bilineal v4.2</p>
            </div>
          </div>

          {/* Quick status bar indicator */}
          <div className="hidden md:flex items-center gap-6">
            <div className="flex items-center gap-2.5 text-xs bg-white/5 py-1.5 px-3 rounded-xl border border-white/5">
              <span className={`w-2.5 h-2.5 rounded-full ${pages.length > 0 ? 'bg-emerald-400 shadow-[0_0_8px_#10b981]' : 'bg-slate-600'}`}></span>
              <span className="text-slate-300 font-mono font-bold tracking-wider uppercase text-[10px]">
                {pages.length === 0 ? '0 PÁGINAS' : `${pages.length} ${pages.length === 1 ? 'PÁGINA' : 'PÁGINAS'}`}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex flex-col gap-8">
        {/* Step Wizard Tracker Indicator */}
        <div className="bg-black/30 border border-white/5 rounded-2xl p-4 flex justify-between items-center text-xs font-bold text-slate-400 max-w-2xl mx-auto w-full backdrop-blur-md">
          <div className={`flex items-center gap-2 ${activeStep === 'camera' ? 'text-emerald-400' : ''}`}>
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs ${activeStep === 'camera' ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-slate-400'}`}>1</span>
            <span className="uppercase tracking-wider text-[10px]">Captura</span>
          </div>
          <div className="h-[1px] bg-white/5 flex-1 mx-4"></div>
          <div className={`flex items-center gap-2 ${activeStep === 'adjust' ? 'text-emerald-400' : ''}`}>
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs ${activeStep === 'adjust' ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-slate-400'}`}>2</span>
            <span className="uppercase tracking-wider text-[10px]">Esquinas</span>
          </div>
          <div className="h-[1px] bg-white/5 flex-1 mx-4"></div>
          <div className={`flex items-center gap-2 ${activeStep === 'filters' ? 'text-emerald-400' : ''}`}>
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs ${activeStep === 'filters' ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-slate-400'}`}>3</span>
            <span className="uppercase tracking-wider text-[10px]">Filtros</span>
          </div>
          <div className="h-[1px] bg-white/5 flex-1 mx-4"></div>
          <div className={`flex items-center gap-2 ${activeStep === 'document' ? 'text-emerald-400' : ''}`}>
            <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-mono text-xs ${activeStep === 'document' ? 'bg-emerald-500 text-black font-extrabold shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-white/5 text-slate-400'}`}>4</span>
            <span className="uppercase tracking-wider text-[10px]">PDF final</span>
          </div>
        </div>

        {/* Dynamic Workflow Area */}
        <div className="flex-1">
          {isWarping ? (
            <div className="flex flex-col items-center justify-center py-24 bg-[#020305] rounded-2xl border border-white/5 shadow-2xl">
              <div className="relative w-16 h-16 mb-6">
                <div className="absolute inset-0 rounded-full border-4 border-emerald-500/10"></div>
                <div className="absolute inset-0 rounded-full border-4 border-t-emerald-400 animate-spin"></div>
              </div>
              <h3 className="text-lg font-bold text-white uppercase tracking-wider">Alineando Perspectiva...</h3>
              <p className="text-slate-400 text-xs mt-3 max-w-sm text-center leading-relaxed">
                Nuestra matemática está reconstruyendo los bordes del papel con interpolación bilineal de alta fidelidad.
              </p>
            </div>
          ) : (
            <AnimatePresence mode="wait">
              {activeStep === 'camera' && (
                <motion.div
                  key="camera"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                  className="space-y-4"
                >
                  {/* If pages list has items, allow going back to document layout */}
                  {pages.length > 0 && (
                    <button
                      onClick={() => setActiveStep('document')}
                      className="inline-flex items-center gap-2 text-xs text-emerald-400 hover:text-emerald-300 font-bold bg-white/5 border border-white/10 px-4 py-2.5 rounded-xl transition active:scale-95 cursor-pointer uppercase tracking-wider font-mono"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 stroke-[2.5]" />
                      Volver a Documento ({pages.length})
                    </button>
                  )}
                  <CameraView
                    onCapture={handleImageAcquired}
                    onImageUpload={handleImageAcquired}
                  />
                </motion.div>
              )}

              {activeStep === 'adjust' && tempOriginalUrl && (
                <motion.div
                  key="adjust"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                >
                  <CornerAdjuster
                    imageUrl={tempOriginalUrl}
                    onConfirm={handleCornersConfirmed}
                    onCancel={() => {
                      setTempOriginalUrl(null);
                      setActiveStep(pages.length > 0 ? 'document' : 'camera');
                    }}
                  />
                </motion.div>
              )}

              {activeStep === 'filters' && tempWarpedUrl && (
                <motion.div
                  key="filters"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                >
                  <FilterSelector
                    warpedDataUrl={tempWarpedUrl}
                    selectedFilter={activeFilter}
                    onChange={handleFilterChanged}
                    onSave={handleSavePage}
                    onCancel={() => {
                      setTempWarpedUrl(null);
                      setTempFilteredUrl(null);
                      setActiveStep('camera');
                    }}
                    onAdjustCorners={() => {
                      setActiveStep('adjust');
                    }}
                    onRotateWarped={handleRotateWarped}
                  />
                </motion.div>
              )}

              {activeStep === 'document' && (
                <motion.div
                  key="document"
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -15 }}
                >
                  <DocumentList
                    pages={pages}
                    docName={docName}
                    onDocNameChange={setDocName}
                    onAddPage={() => setActiveStep('camera')}
                    onDeletePage={handleDeletePage}
                    onReorderPages={setPages}
                    onReset={handleResetAll}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Decorative footer */}
      <footer className="bg-black/20 py-8 border-t border-white/5 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4">
          <p className="font-mono tracking-wider uppercase text-[10px]">© 2026 SCANPRO AI · ENCRIPTACIÓN Y PROCESAMIENTO LOCAL DE EXTREMO A EXTREMO</p>
        </div>
      </footer>
    </div>
  );
}
