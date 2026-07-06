import React, { useState } from 'react';
import { FileText, Plus, Trash2, ArrowLeft, ArrowRight, Download, Edit3, Eye, Check, CheckCircle, Sparkles, X, Copy } from 'lucide-react';
import { ScannedPage } from '../types';
import { jsPDF } from 'jspdf';
import { motion, AnimatePresence } from 'motion/react';

interface DocumentListProps {
  pages: ScannedPage[];
  docName: string;
  onDocNameChange: (name: string) => void;
  onAddPage: () => void;
  onDeletePage: (id: string) => void;
  onReorderPages: (newPages: ScannedPage[]) => void;
  onReset: () => void;
}

export default function DocumentList({
  pages,
  docName,
  onDocNameChange,
  onAddPage,
  onDeletePage,
  onReorderPages,
  onReset
}: DocumentListProps) {
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [tempName, setTempName] = useState<string>(docName);
  const [previewPage, setPreviewPage] = useState<ScannedPage | null>(null);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [selectedOcrPage, setSelectedOcrPage] = useState<ScannedPage | null>(null);
  const [runningOcrPageId, setRunningOcrPageId] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [isOcrEnabled, setIsOcrEnabled] = useState<boolean>(true);
  const [ocrProgressText, setOcrProgressText] = useState<string>('');

  function handleCopyText(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSinglePageOcr(page: ScannedPage) {
    setRunningOcrPageId(page.id);
    try {
      const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ image: page.filteredUrl }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Error al procesar el OCR');
      }

      const ocrResult = await response.json();
      
      const updatedPages = pages.map(p => {
        if (p.id === page.id) {
          return { ...p, ocr: ocrResult };
        }
        return p;
      });
      onReorderPages(updatedPages);
    } catch (err: any) {
      console.error('OCR error:', err);
      alert(`No se pudo realizar el OCR: ${err.message || 'Error desconocido'}`);
    } finally {
      setRunningOcrPageId(null);
    }
  }

  function handleNameSave() {
    const trimmed = tempName.trim();
    if (trimmed) {
      onDocNameChange(trimmed);
    } else {
      setTempName(docName);
    }
    setIsEditingName(false);
  }

  function handleMoveLeft(index: number) {
    if (index === 0) return;
    const nextPages = [...pages];
    const temp = nextPages[index];
    nextPages[index] = nextPages[index - 1];
    nextPages[index - 1] = temp;
    onReorderPages(nextPages);
  }

  function handleMoveRight(index: number) {
    if (index === pages.length - 1) return;
    const nextPages = [...pages];
    const temp = nextPages[index];
    nextPages[index] = nextPages[index + 1];
    nextPages[index + 1] = temp;
    onReorderPages(nextPages);
  }

  async function handleExportPdf() {
    if (pages.length === 0) return;
    setIsExporting(true);
    setOcrProgressText('Iniciando...');

    try {
      const currentPages = pages.map(p => ({ ...p }));

      if (isOcrEnabled) {
        const pagesToOcr = currentPages.filter(p => !p.ocr);
        
        if (pagesToOcr.length > 0) {
          setOcrProgressText(`Procesando OCR con IA...`);
          
          for (let i = 0; i < pagesToOcr.length; i++) {
            const page = pagesToOcr[i];
            const originalIndex = currentPages.findIndex(p => p.id === page.id);
            setOcrProgressText(`OCR en pág. ${originalIndex + 1} de ${currentPages.length}...`);
            
            const response = await fetch('/api/ocr', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ image: page.filteredUrl }),
            });

            if (!response.ok) {
              const errData = await response.json().catch(() => ({}));
              throw new Error(`Fallo OCR pág. ${originalIndex + 1}: ${errData.error || 'Fallo de API'}`);
            }

            const ocrResult = await response.json();
            page.ocr = ocrResult;
          }

          // Save the pages with OCR cache
          onReorderPages(currentPages);
        }
      }

      setOcrProgressText('Compilando PDF...');
      await new Promise(resolve => setTimeout(resolve, 300));

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'pt',
        format: 'a4'
      });

      const pdfWidth = 595.28;
      const pdfHeight = 841.89;

      currentPages.forEach((page, index) => {
        if (index > 0) {
          pdf.addPage('a4', 'portrait');
        }

        // Add the scanned page image
        pdf.addImage(
          page.filteredUrl,
          'JPEG',
          0,
          0,
          pdfWidth,
          pdfHeight,
          undefined,
          'FAST'
        );

        // Add OCR layer if enabled and exists
        if (isOcrEnabled && page.ocr && page.ocr.lines) {
          pdf.setFont('Helvetica', 'normal');
          
          page.ocr.lines.forEach(line => {
            if (!line.text || !line.boundingBox || line.boundingBox.length < 4) return;
            
            const [ymin, xmin, ymax, xmax] = line.boundingBox;
            
            const y = (ymin / 1000) * pdfHeight;
            const x = (xmin / 1000) * pdfWidth;
            const lineH = ((ymax - ymin) / 1000) * pdfHeight;
            const lineW = ((xmax - xmin) / 1000) * pdfWidth;

            // Set font size matching original text height
            const fontSize = Math.max(4, lineH * 0.82);
            pdf.setFontSize(fontSize);

            // Calculate precise character spacing so the text spans exactly the bounding box width
            let charSpace = 0;
            if (line.text.length > 1) {
              const textWidth = pdf.getStringUnitWidth(line.text) * fontSize;
              charSpace = (lineW - textWidth) / (line.text.length - 1);
              // Clamp character spacing to avoid extreme overlapping or stretching in case of coordinate noise
              const maxCharSpace = fontSize * 0.4;
              const minCharSpace = -fontSize * 0.12;
              if (charSpace > maxCharSpace) charSpace = maxCharSpace;
              if (charSpace < minCharSpace) charSpace = minCharSpace;
            }

            // Add standard invisible text layer overlay for perfect highlightability and searchability
            pdf.text(line.text, x, y + lineH * 0.82, {
              renderingMode: 'invisible',
              charSpace: charSpace
            });
          });
        }
      });

      const filename = docName.toLowerCase().endsWith('.pdf') ? docName : `${docName}.pdf`;
      pdf.save(filename);
    } catch (err: any) {
      console.error('Error generating PDF:', err);
      alert(`Hubo un error al generar el PDF con OCR: ${err.message || 'Intenta de nuevo.'}`);
    } finally {
      setIsExporting(false);
      setOcrProgressText('');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner Control Panel */}
      <div className="bg-[#020305] border border-white/5 rounded-2xl p-6 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-5">
        {/* Document Title Editor */}
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-mono tracking-widest text-emerald-400 uppercase">DOCUMENTO ACTIVO</span>
          {isEditingName ? (
            <div className="flex items-center gap-2 mt-1.5 max-w-md">
              <input
                type="text"
                value={tempName}
                onChange={(e) => setTempName(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={(e) => e.key === 'Enter' && handleNameSave()}
                className="bg-black border border-emerald-500 rounded-xl px-3.5 py-2 text-base font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-400/40 w-full"
                autoFocus
              />
              <button
                onClick={handleNameSave}
                className="p-2.5 bg-emerald-500 text-black rounded-xl hover:bg-emerald-400 transition cursor-pointer"
              >
                <Check className="w-5 h-5 stroke-[2.5]" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-1.5 group">
              <h2 className="text-xl font-bold text-white tracking-tight truncate">
                {docName}
              </h2>
              <button
                onClick={() => {
                  setTempName(docName);
                  setIsEditingName(true);
                }}
                className="p-1.5 text-slate-400 hover:text-emerald-400 rounded-lg transition hover:bg-white/5 cursor-pointer"
                title="Editar nombre"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            </div>
          )}
          <p className="text-xs text-slate-400 mt-1.5">
            {pages.length} {pages.length === 1 ? 'página' : 'páginas'} en el lote de compilación · Formato A4
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col md:flex-row md:items-center gap-4 shrink-0">
          {/* OCR Toggle */}
          <label className="flex items-center gap-2.5 bg-white/3 border border-white/5 hover:border-emerald-500/20 px-4 py-2.5 rounded-xl cursor-pointer select-none transition">
            <input
              type="checkbox"
              checked={isOcrEnabled}
              onChange={(e) => setIsOcrEnabled(e.target.checked)}
              className="accent-emerald-500 w-4 h-4 rounded border-white/10 text-emerald-500 focus:ring-emerald-400 focus:ring-offset-black bg-black cursor-pointer"
            />
            <div className="flex flex-col text-left">
              <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wide flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Capa OCR Buscable
              </span>
              <span className="text-[9px] text-slate-400">Texto seleccionable con IA</span>
            </div>
          </label>

          <div className="flex items-center gap-3">
            <button
              onClick={onReset}
              className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-medium px-5 py-3 rounded-xl text-xs transition active:scale-95 cursor-pointer font-mono uppercase tracking-wider"
            >
              Nuevo Lote
            </button>

            <button
              onClick={handleExportPdf}
              disabled={pages.length === 0 || isExporting}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold px-6 py-3 rounded-xl text-xs shadow-lg shadow-emerald-950/40 transition active:scale-95 disabled:opacity-50 cursor-pointer disabled:pointer-events-none uppercase tracking-wider"
            >
              {isExporting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                  {ocrProgressText || 'Procesando...'}
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 stroke-[2.5]" />
                  {isOcrEnabled ? 'Exportar con OCR' : 'Exportar PDF'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Pages Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <AnimatePresence mode="popLayout">
          {pages.map((page, index) => (
            <motion.div
              key={page.id}
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="group relative bg-[#020305] border border-white/5 rounded-2xl overflow-hidden shadow-xl hover:border-white/10 transition-all flex flex-col"
            >
              {/* Image Preview Container */}
              <div className="relative aspect-[1/1.414] bg-black/40 flex items-center justify-center p-4 select-none">
                <img
                  src={page.filteredUrl}
                  alt={`Página ${index + 1}`}
                  className="max-h-full max-w-full object-contain rounded border border-white/5 shadow-2xl transition group-hover:brightness-90"
                />

                {/* Page Number Badge */}
                <div className="absolute top-4 left-4 bg-black/95 border border-white/10 text-emerald-400 px-3 py-1 rounded-xl font-mono text-xs font-bold shadow backdrop-blur-md">
                  PÁG {index + 1}
                </div>

                {/* Hover overlay actions */}
                <div className="absolute inset-0 bg-black/85 opacity-0 group-hover:opacity-100 transition duration-200 flex flex-col items-center justify-center gap-3 px-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPreviewPage(page)}
                      className="p-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 rounded-xl transition shadow active:scale-95 cursor-pointer"
                      title="Ver a tamaño completo"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => onDeletePage(page.id)}
                      className="p-2.5 bg-red-950/80 hover:bg-red-900/90 border border-red-800/50 text-red-100 rounded-xl transition shadow active:scale-95 cursor-pointer"
                      title="Eliminar página"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Ordering arrows */}
                  <div className="flex items-center gap-1 mt-2">
                    <button
                      onClick={() => handleMoveLeft(index)}
                      disabled={index === 0}
                      className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 disabled:text-slate-600 disabled:border-white/5 disabled:bg-transparent rounded-lg transition active:scale-95 cursor-pointer"
                      title="Mover hacia arriba"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <span className="text-[10px] font-mono font-bold text-slate-300 bg-black/60 px-2 py-1 rounded-md border border-white/5 uppercase tracking-widest">
                      ORDEN
                    </span>
                    <button
                      onClick={() => handleMoveRight(index)}
                      disabled={index === pages.length - 1}
                      className="p-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-100 disabled:text-slate-600 disabled:border-white/5 disabled:bg-transparent rounded-lg transition active:scale-95 cursor-pointer"
                      title="Mover hacia abajo"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom detail row */}
              <div className="p-4 bg-black/20 border-t border-white/5 flex flex-col gap-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span className="capitalize font-medium">{page.filterType === 'original' ? 'Original' : page.filterType === 'bw' ? 'Blanco y Negro' : page.filterType === 'color-scan' ? 'Escáner Color' : 'Escala Grises'}</span>
                  <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider">{page.width}x{page.height} px</span>
                </div>

                <div className="pt-1">
                  {page.ocr ? (
                    <button
                      onClick={() => setSelectedOcrPage(page)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 hover:border-emerald-500/40 text-emerald-400 rounded-xl text-[11px] font-medium transition active:scale-98 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Ver Texto OCR
                    </button>
                  ) : (
                    <button
                      onClick={() => handleSinglePageOcr(page)}
                      disabled={runningOcrPageId !== null}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 px-3 bg-white/3 hover:bg-emerald-500/10 border border-white/5 hover:border-emerald-500/30 text-slate-300 hover:text-emerald-400 rounded-xl text-[11px] font-medium transition active:scale-98 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {runningOcrPageId === page.id ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-emerald-500/20 border-t-emerald-400 rounded-full animate-spin"></div>
                          Analizando...
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                          Reconocer Texto (OCR)
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Giant "Add Page" Button Card */}
        <button
          onClick={onAddPage}
          className="group aspect-[1/1.414] border border-dashed border-white/10 hover:border-emerald-500/80 bg-white/2 hover:bg-emerald-500/5 rounded-2xl flex flex-col items-center justify-center p-6 text-center transition duration-200 cursor-pointer shadow-inner active:scale-[0.99]"
        >
          <div className="w-14 h-14 rounded-full bg-black border border-white/10 group-hover:border-emerald-500/30 group-hover:bg-emerald-500/10 flex items-center justify-center text-slate-400 group-hover:text-emerald-400 transition duration-200 mb-4 shadow">
            <Plus className="w-6 h-6 stroke-[3]" />
          </div>
          <h4 className="text-sm font-bold text-slate-300 group-hover:text-white uppercase tracking-wider">
            Agregar Página
          </h4>
          <p className="text-xs text-slate-500 mt-1 max-w-[150px] leading-relaxed">
            Inicia la cámara para anexar otro documento al PDF
          </p>
        </button>
      </div>

      {/* Full-Screen Page Preview Modal */}
      {previewPage && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 md:p-8 backdrop-blur-md animate-fade-in">
          <div className="absolute inset-0" onClick={() => setPreviewPage(null)}></div>
          
          <div className="relative bg-[#020305] border border-white/10 rounded-2xl overflow-hidden max-w-3xl w-full max-h-[90vh] flex flex-col shadow-3xl z-10 animate-scale-in">
            {/* Modal Header */}
            <div className="bg-black/80 px-6 py-4 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
              <div>
                <h3 className="font-bold text-white text-sm uppercase tracking-wider">VISTA PREVIA</h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">RESOLUCIÓN DE IMPRESIÓN COMPLETA</p>
              </div>
              <button
                onClick={() => setPreviewPage(null)}
                className="text-slate-400 hover:text-white text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-4 py-2 rounded-xl transition cursor-pointer font-mono uppercase tracking-widest"
              >
                Cerrar
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 bg-black p-6 overflow-auto flex items-center justify-center min-h-[300px]">
              <img
                src={previewPage.filteredUrl}
                alt="Full resolution preview"
                className="max-h-[60vh] md:max-h-[70vh] w-auto object-contain rounded shadow-3xl border border-white/10"
              />
            </div>
          </div>
        </div>
      )}

      {/* OCR Text Viewer Modal */}
      {selectedOcrPage && selectedOcrPage.ocr && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-4 md:p-8 backdrop-blur-md animate-fade-in">
          <div className="absolute inset-0" onClick={() => setSelectedOcrPage(null)}></div>
          
          <div className="relative bg-[#020305] border border-white/10 rounded-2xl overflow-hidden max-w-2xl w-full max-h-[85vh] flex flex-col shadow-3xl z-10 animate-scale-in">
            {/* Modal Header */}
            <div className="bg-black/80 px-6 py-4 border-b border-white/5 flex items-center justify-between backdrop-blur-md">
              <div>
                <h3 className="font-bold text-white text-sm uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-emerald-400" />
                  Texto Extraído (OCR Inteligente)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5 font-mono">PÁGINA {pages.indexOf(selectedOcrPage) + 1} · TOTALMENTE COPIABLE</p>
              </div>
              <button
                onClick={() => setSelectedOcrPage(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg transition hover:bg-white/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 bg-black p-6 overflow-auto flex flex-col gap-4">
              <textarea
                value={selectedOcrPage.ocr.fullText}
                readOnly
                className="w-full flex-1 min-h-[300px] max-h-[50vh] p-4 bg-white/2 border border-white/5 rounded-xl text-slate-300 font-sans text-sm leading-relaxed focus:outline-none resize-none font-mono selection:bg-emerald-500 selection:text-black"
              />
              
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => handleCopyText(selectedOcrPage.ocr!.fullText)}
                  className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-black font-bold px-5 py-3 rounded-xl text-xs uppercase tracking-wider transition active:scale-95 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4 stroke-[2.5]" />
                      Copiado
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copiar Texto
                    </>
                  )}
                </button>
                <button
                  onClick={() => setSelectedOcrPage(null)}
                  className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 px-5 py-3 rounded-xl text-xs uppercase tracking-wider transition cursor-pointer"
                >
                  Cerrar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
