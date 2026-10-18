// Resoluciones de las impresoras Zebra admitidas (la GK420d es de 203 dpi)
export type PrinterDpi = 203 | 300 | 600;

export const PRINTER_DPI_OPTIONS: PrinterDpi[] = [203, 300, 600];

// Atributo de talla tal como lo devuelve la API (puede estar inactivo: se ignora al imprimir)
export interface SizeAttributeRef {
  id: number;
  name: string;
  available: boolean;
}

export interface LabelSettings {
  printerDpi: PrinterDpi;
  // Marcador {{storeName}}; puede estar vacío
  storeName: string;
  // En orden de prioridad: {{size}} toma el primero que tenga la variante
  sizeAttributeIds: number[];
  sizeAttributes: SizeAttributeRef[];
  // null = nunca se guardaron: son los valores por defecto
  updatedAt: string | null;
}

// PUT acepta campos parciales: solo cambian los que se envían
export type UpdateLabelSettingsRequest = Partial<Pick<LabelSettings, 'printerDpi' | 'storeName' | 'sizeAttributeIds'>>;
