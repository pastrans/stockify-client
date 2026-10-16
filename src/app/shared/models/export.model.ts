// Archivo .zip generado por la API, listo para descargar
export interface ExportResult {
  blob: Blob;
  fileName: string;
  // Valor de X-Export-Generated-At (ISO): se envía a PATCH /products/sync-exported
  generatedAt: string;
}

// Datos que se guardan de la última exportación total para marcarla después como sincronizada
export interface LastExport {
  generatedAt: string;
  fileName: string;
}
