import React, { useState } from 'react';
import { FileText, Plus, Trash2, ArrowLeft, ArrowRight, Download, Edit3, Eye, FileSpreadsheet, Check, CheckSquare } from 'lucide-react';
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

    // Give UI half a second to show loading state
    setTimeout(() => {
      try {
        const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
        });

        pages.forEach((page, index) => {
          if (index > 0) {
            pdf.addPage('a4', 'portrait');
          }

          // A4 dimensions are 210mm x 297mm
          pdf.addImage(
            page.filteredUrl,
            'JPEG',
            0,
            0,
            210,
            297,
            undefined,
            'FAST'
          );
        });

        const filename = docName.toLowerCase().endsWith('.pdf') ? docName : `${docName}.pdf`;
        pdf.save(filename);
      } catch (err) {
        console.error('Error generating PDF:', err);
        alert('Hubo un error al generar el PDF. Por favor intenta de nuevo.');
      } finally {
        setIsExporting(false);
      }
    }, 500);
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
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={onReset}
            className="bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-medium px-5 py-3 rounded-xl text-sm transition active:scale-95 cursor-pointer font-mono uppercase tracking-wider text-xs"
          >
            Nuevo Lote
          </button>

          <button
            onClick={handleExportPdf}
            disabled={pages.length === 0 || isExporting}
            className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-bold px-6 py-3 rounded-xl text-sm shadow-lg shadow-emerald-950/40 transition active:scale-95 disabled:opacity-50 cursor-pointer disabled:pointer-events-none uppercase tracking-wider text-xs"
          >
            {isExporting ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                Compilando PDF...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 stroke-[2.5]" />
                Exportar PDF
              </>
            )}
          </button>
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
              <div className="p-4 bg-black/20 border-t border-white/5 flex items-center justify-between text-xs text-slate-400">
                <span className="capitalize text-[11px] font-medium">{page.filterType === 'original' ? 'Original' : page.filterType === 'bw' ? 'Blanco y Negro' : page.filterType === 'color-scan' ? 'Escáner Color' : 'Escala Grises'}</span>
                <span className="font-mono text-[9px] text-slate-500 uppercase tracking-wider">{page.width}x{page.height} px</span>
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
    </div>
  );
}
