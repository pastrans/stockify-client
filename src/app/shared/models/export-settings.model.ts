// Idioma de los encabezados de los archivos de Odoo ('es' = español de Latinoamérica, es_419)
export type ExportLanguage = 'en' | 'es';

export interface ExportSettings {
  language: ExportLanguage;
  // Ubicación de Odoo (nombre completo, p. ej. 'WH/Stock') para el stock de Bodega
  warehouseLocation: string;
  // Ubicación de Odoo para el stock de Tienda
  storeLocation: string;
  // Nombre del Punto de Venta de Odoo (archivo de categorías POS)
  linkedPosConfig: string;
  // Máximo de filas por archivo; si se supera, se parte en -01, -02…
  maxRowsPerFile: number;
  // No se puede cambiar si hay algún producto sincronizado
  externalIdPrefix: string;
  // Columna "Category" del archivo de atributos
  attributeCategory: string;
  // null = nunca se guardaron: son los valores por defecto
  updatedAt: string | null;
}

// PUT acepta campos parciales: solo cambian los que se envían
export type UpdateExportSettingsRequest = Partial<Omit<ExportSettings, 'updatedAt'>>;
