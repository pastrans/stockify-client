import { Component, EventEmitter, Input, OnDestroy, Output, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { UploadService } from '../../../core/services/upload.service';
import { ImageChange } from '../../models/upload.model';
import { getApiErrorMessage } from '../../utils/api-error';

type UploadState = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed' | 'removed';

/**
 * Selector de imagen con subida diferida a S3:
 *  1. POST /uploads/image deja la foto en tmp/ y devuelve un uploadId.
 *  2. Se consulta GET /uploads/:uploadId hasta 'ready' (vista previa) o 'failed' (error).
 *  3. El formulario envía el uploadId al guardar; este componente solo emite `changed`.
 *
 * Cuando el padre cambia `imageUrl` (p. ej. tras guardar), el componente vuelve al estado inicial.
 *
 *   <app-image-upload [imageUrl]="product.mainImageUrl" (changed)="onImageChange($event)">
 */
@Component({
  selector: 'app-image-upload',
  standalone: true,
  templateUrl: './image-upload.component.html',
  styleUrls: ['./image-upload.component.css']
})
export class ImageUploadComponent implements OnDestroy {
  private readonly uploadService = inject(UploadService);

  @Input() size: 'sm' | 'lg' = 'lg';
  @Input() disabled = false;
  @Input() label = 'Imagen';

  // URL pública de la imagen guardada (mainImageUrl / imageUrl), nunca la key
  @Input() set imageUrl(url: string | null | undefined) {
    this.savedUrl.set(url ?? null);
    this.reset();
  }

  @Output() changed = new EventEmitter<ImageChange>();

  readonly accept = this.uploadService.ACCEPTED_TYPES.join(',');

  savedUrl = signal<string | null>(null);
  state = signal<UploadState>('idle');
  // Vista previa local mientras se sube/procesa, y la del backend cuando está lista
  localPreview = signal<string | null>(null);
  readyPreview = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  private subscription: Subscription | null = null;

  get displayUrl(): string | null {
    switch (this.state()) {
      case 'idle': return this.savedUrl();
      case 'removed': return null;
      case 'ready': return this.readyPreview() ?? this.localPreview();
      default: return this.localPreview();
    }
  }

  get isBusy(): boolean {
    return this.state() === 'uploading' || this.state() === 'processing';
  }

  get canRemove(): boolean {
    return !this.disabled && !this.isBusy && this.displayUrl !== null;
  }

  // Hay un cambio respecto a la imagen guardada que se puede descartar
  get canUndo(): boolean {
    return !this.disabled && this.state() !== 'idle';
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const validationError = this.uploadService.validateFile(file);
    this.cancelUpload();
    this.setLocalPreview(file);
    this.readyPreview.set(null);

    if (validationError) {
      this.fail(validationError);
      return;
    }

    this.errorMessage.set(null);
    this.state.set('uploading');
    this.changed.emit({ status: 'processing' });

    this.subscription = this.uploadService.uploadImage(file).subscribe({
      next: (res) => this.watch(res.uploadId),
      error: (err) => this.fail(getApiErrorMessage(err, 'No se pudo subir la imagen.'))
    });
  }

  private watch(uploadId: string): void {
    this.state.set('processing');

    this.subscription = this.uploadService.watchUpload(uploadId).subscribe({
      next: (res) => {
        if (res.status === 'ready') {
          this.readyPreview.set(res.previewUrl ?? null);
          this.state.set('ready');
          this.changed.emit({ status: 'ready', uploadId });
        } else if (res.status === 'failed') {
          this.fail(res.error || 'El procesamiento de la imagen falló.');
        }
      },
      error: (err) => this.fail(getApiErrorMessage(err, 'No se pudo consultar el estado de la imagen.')),
      complete: () => {
        // Se cortó por el tiempo máximo del cliente sin respuesta final
        if (this.state() === 'processing') {
          this.fail('El procesamiento tardó demasiado. Intenta subir la imagen de nuevo.');
        }
      }
    });
  }

  remove(event: Event): void {
    event.stopPropagation();
    this.cancelUpload();
    this.clearPreviews();
    this.errorMessage.set(null);

    // Sin imagen guardada, quitar equivale a no haber cambiado nada
    if (this.savedUrl()) {
      this.state.set('removed');
      this.changed.emit({ status: 'removed' });
    } else {
      this.state.set('idle');
      this.changed.emit({ status: 'unchanged' });
    }
  }

  undo(event: Event): void {
    event.stopPropagation();
    this.reset();
    this.changed.emit({ status: 'unchanged' });
  }

  private fail(message: string): void {
    this.cancelUpload();
    this.errorMessage.set(message);
    this.state.set('failed');
    this.changed.emit({ status: 'failed' });
  }

  private reset(): void {
    this.cancelUpload();
    this.clearPreviews();
    this.errorMessage.set(null);
    this.state.set('idle');
  }

  private cancelUpload(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  private setLocalPreview(file: File): void {
    this.revokeLocalPreview();
    this.localPreview.set(URL.createObjectURL(file));
  }

  private clearPreviews(): void {
    this.revokeLocalPreview();
    this.readyPreview.set(null);
  }

  private revokeLocalPreview(): void {
    const url = this.localPreview();
    if (url) URL.revokeObjectURL(url);
    this.localPreview.set(null);
  }

  ngOnDestroy(): void {
    this.cancelUpload();
    this.revokeLocalPreview();
  }
}
