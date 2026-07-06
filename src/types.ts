export interface Point {
  x: number;
  y: number;
}

export type FilterType = 'original' | 'color-scan' | 'grayscale' | 'bw';

export interface ScannedPage {
  id: string;
  originalUrl: string;    // Captured photo dataURL
  warpedUrl: string;      // Perspective warped dataURL (pre-filtered)
  filteredUrl: string;    // Final filtered image dataURL
  filterType: FilterType;
  corners: Point[];       // Selected corners relative to original image size
  width: number;          // Dimensions of the warped document
  height: number;
}

export interface ScanDocument {
  id: string;
  name: string;
  pages: ScannedPage[];
  createdAt: number;
}

export type AppStep = 'camera' | 'adjust' | 'filters' | 'document';
