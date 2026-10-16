import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ExportResult } from '../../shared/models/export.model';
import { parseBlobError } from '../../shared/utils/blob-error';
import { getFileNameFromDisposition } from '../../shared/utils/download-file';

@Injectable({
  providedIn: 'root'
})
export class ExportService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/exports`;

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
}
