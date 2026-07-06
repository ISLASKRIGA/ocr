export interface Point {
  x: number;
  y: number;
}

export type FilterType = 'original' | 'color-scan' | 'grayscale' | 'bw';

export interface OcrLine {
  text: string;
  boundingBox: number[]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export interface OcrResult {
  fullText: string;
  lines: OcrLine[];
}

export interface ScannedPage {
  id: string;
  originalUrl: string;    // Captured photo dataURL
  warpedUrl: string;      // Perspective warped dataURL (pre-filtered)
  filteredUrl: string;    // Final filtered image dataURL
  filterType: FilterType;
  corners: Point[];       // Selected corners relative to original image size
  width: number;          // Dimensions of the warped document
  height: number;
  ocr?: OcrResult;        // Optional OCR result
}

export interface ScanDocument {
  id: string;
  name: string;
  pages: ScannedPage[];
  createdAt: number;
}

export type AppStep = 'camera' | 'adjust' | 'filters' | 'document';
