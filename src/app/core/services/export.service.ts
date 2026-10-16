import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExportResult, LastExport } from '../../shared/models/export.model';
import { parseBlobError } from '../../shared/utils/blob-error';
import { getFileNameFromDisposition } from '../../shared/utils/download-file';

const LAST_EXPORT_STORAGE_KEY = 'stockify.export.last';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/exports`;

  // Última exportación total pendiente de marcar como sincronizada (sobrevive a recargas)
  readonly lastExport = signal<LastExport | null>(this.readStoredExport());

  // Productos activos no sincronizados
  exportFull(): Observable<ExportResult> {
    return this.requestArchive(`${this.apiUrl}/full`, 'stockify-export-full.zip');
  }

  // Un producto activo, esté o no sincronizado
  exportProduct(id: number): Observable<ExportResult> {
    return this.requestArchive(`${this.apiUrl}/products/${id}`, `stockify-export-product-${id}.zip`);
  }

  private requestArchive(url: string, fallbackName: string): Observable<ExportResult> {
    return this.http.post(url, null, { responseType: 'blob', observe: 'response' }).pipe(
      parseBlobError(),
      map((res: HttpResponse<Blob>) => ({
        blob: res.body ?? new Blob([], { type: 'application/zip' }),
        fileName: getFileNameFromDisposition(res.headers.get('Content-Disposition'), fallbackName),
        // Respaldo por si la cabecera no llega (p. ej. CORS mal configurado)
        generatedAt: res.headers.get('X-Export-Generated-At') ?? new Date().toISOString()
      }))
    );
  }

  // --- Última exportación total ---

  saveLastExport(result: ExportResult): void {
    const value: LastExport = { generatedAt: result.generatedAt, fileName: result.fileName };
    this.lastExport.set(value);
    try {
      localStorage.setItem(LAST_EXPORT_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Sin almacenamiento disponible: solo dura esta sesión
    }
  }

  clearLastExport(): void {
    this.lastExport.set(null);
    try {
      localStorage.removeItem(LAST_EXPORT_STORAGE_KEY);
    } catch {
      // Sin almacenamiento disponible
    }
  }

  private readStoredExport(): LastExport | null {
    try {
      const stored = JSON.parse(localStorage.getItem(LAST_EXPORT_STORAGE_KEY) ?? 'null');
      const valid = typeof stored?.generatedAt === 'string' && !Number.isNaN(Date.parse(stored.generatedAt));
      return valid ? { generatedAt: stored.generatedAt, fileName: String(stored.fileName ?? '') } : null;
    } catch {
      return null;
    }
  }
}
