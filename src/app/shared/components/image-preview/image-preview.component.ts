import { Component, Signal, inject } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

export type ImagePreviewStatus = 'saved' | 'uploading' | 'processing' | 'ready' | 'failed';

/**
 * Datos del modal como signals: si la imagen sigue procesándose, el modal se actualiza solo
 * cuando llega la versión procesada o el error.
 */
export interface ImagePreviewSource {
  label: string;
  status: Signal<ImagePreviewStatus>;
  // Imagen guardada (status 'saved')
  savedUrl: Signal<string | null>;
  // Archivo que eligió o fotografió el usuario
  originalUrl: Signal<string | null>;
  // Versión procesada por el backend (status 'ready')
  processedUrl: Signal<string | null>;
  error: Signal<string | null>;
}

/**
 * Vista ampliada de una imagen. Con una subida en curso muestra la original junto a la procesada.
 *
 *   const ref = this.modalService.open(ImagePreviewComponent, { centered: true, size: 'xl' });
 *   ref.componentInstance.source = source;
 */
@Component({
  selector: 'app-image-preview',
  standalone: true,
  templateUrl: './image-preview.component.html',
  styleUrls: ['./image-preview.component.css']
})
export class ImagePreviewComponent {
  readonly modal = inject(NgbActiveModal);

  source!: ImagePreviewSource;
}
