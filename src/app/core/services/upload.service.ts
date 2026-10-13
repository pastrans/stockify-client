import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, exhaustMap, takeUntil, takeWhile, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UploadImageResponse, UploadStatusResponse } from '../../shared/models/upload.model';

@Injectable({
  providedIn: 'root'
})
export class UploadService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/uploads`;

  // Formatos y tamaño que acepta la API
  readonly ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  readonly MAX_SIZE_BYTES = 5 * 1024 * 1024;

  // Intervalo de consulta del procesamiento (la Lambda tarda ~3-5 s)
  private readonly POLL_INTERVAL_MS = 1500;
  // El backend marca 'failed' a los 90 s; el cliente corta un poco después como respaldo
  private readonly CLIENT_TIMEOUT_MS = 100_000;

  uploadImage(file: File): Observable<UploadImageResponse> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<UploadImageResponse>(`${this.apiUrl}/image`, formData);
  }

  getUploadStatus(uploadId: string): Observable<UploadStatusResponse> {
    return this.http.get<UploadStatusResponse>(`${this.apiUrl}/${uploadId}`);
  }

  /**
   * Consulta el estado cada POLL_INTERVAL_MS y emite cada respuesta. Completa al recibir
   * 'ready' o 'failed' (incluida), o al agotar CLIENT_TIMEOUT_MS sin respuesta final.
   */
  watchUpload(uploadId: string): Observable<UploadStatusResponse> {
    return timer(this.POLL_INTERVAL_MS, this.POLL_INTERVAL_MS).pipe(
      // exhaustMap: no se lanza otra consulta mientras la anterior sigue en curso
      exhaustMap(() => this.getUploadStatus(uploadId)),
      takeWhile(res => res.status === 'processing', true),
      // Respaldo por si se pierde la respuesta final: quien escucha trata el corte como fallo
      takeUntil(timer(this.CLIENT_TIMEOUT_MS))
    );
  }

  // Mensaje de validación local o null si el archivo es aceptable
  validateFile(file: File): string | null {
    if (!this.ACCEPTED_TYPES.includes(file.type)) {
      return 'Formato no permitido. Usa JPG, PNG o WebP.';
    }
    if (file.size > this.MAX_SIZE_BYTES) {
      return 'La imagen supera el máximo de 5 MB.';
    }
    return null;
  }
}
