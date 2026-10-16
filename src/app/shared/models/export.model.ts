// Archivo .zip generado por la API, listo para descargar
export interface ExportResult {
  blob: Blob;
  fileName: string;
  // Valor de X-Export-Generated-At (ISO): se envía a PATCH /products/sync-exported
  generatedAt: string;
}
