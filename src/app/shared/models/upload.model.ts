export type UploadProcessingStatus = 'processing' | 'ready' | 'failed';

// Respuesta de POST /uploads/image: la imagen queda en tmp/ mientras se procesa
export interface UploadImageResponse {
  uploadId: string;
  key: string;
  status: 'processing';
}

// Respuesta de GET /uploads/:uploadId
export interface UploadStatusResponse {
  uploadId: string;
  status: UploadProcessingStatus;
  // Solo con status 'ready': URL firmada, válida 15 min
  previewUrl?: string;
  // Solo con status 'failed'
  error?: string;
}

/**
 * Estado de la imagen de un formulario, tal como lo emite <app-image-upload>:
 * - unchanged: no se tocó la imagen guardada
 * - processing / failed: hay una subida que todavía no se puede guardar
 * - ready: la subida terminó; se envía su uploadId al guardar
 * - removed: el usuario quitó la imagen; se envía null al guardar
 */
export type ImageChange =
  | { status: 'unchanged' }
  | { status: 'processing' }
  | { status: 'failed' }
  | { status: 'ready'; uploadId: string; previewUrl?: string | null }
  | { status: 'removed' };

/**
 * Subida ya procesada que se aplica desde fuera a otro <app-image-upload> (p. ej. la foto de un color
 * a sus variantes). El backend copia el archivo en cada promoción, así que un uploadId sirve para varias.
 */
export interface AppliedImage {
  uploadId: string;
  previewUrl: string | null;
}

// Valor para el campo *UploadId del body: undefined = no se toca, null = quitar, uuid = nueva imagen
export function toUploadIdField(change: ImageChange): string | null | undefined {
  if (change.status === 'ready') return change.uploadId;
  if (change.status === 'removed') return null;
  return undefined;
}

export function isImageBlocking(change: ImageChange): boolean {
  return change.status === 'processing' || change.status === 'failed';
}
