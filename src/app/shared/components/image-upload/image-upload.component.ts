import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, computed, inject, signal } from '@angular/core';
import { NgbDropdownModule, NgbModal, NgbModalRef } from '@ng-bootstrap/ng-bootstrap';
import { Subscription } from 'rxjs';
import { UploadService } from '../../../core/services/upload.service';
import { ImageChange } from '../../models/upload.model';
import { getApiErrorMessage } from '../../utils/api-error';
import { CameraCaptureComponent, CameraCaptureResult } from '../camera-capture/camera-capture.component';
import { ImagePreviewComponent, ImagePreviewSource, ImagePreviewStatus } from '../image-preview/image-preview.component';

type UploadState = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed' | 'removed';

/**
 * Selector de imagen con subida diferida a S3:
 *  1. El usuario sube un archivo o toma una fotografía (menú al pulsar la imagen).
 *  2. POST /uploads/image deja la foto en tmp/ y devuelve un uploadId.
 *  3. Se consulta GET /uploads/:uploadId hasta 'ready' (vista previa) o 'failed' (error).
 *  4. El formulario envía el uploadId al guardar; este componente solo emite `changed`.
 *
 * "Ver imagen" abre la vista ampliada; con una subida en curso muestra la original y la procesada.
 * Cuando el padre cambia `imageUrl` (p. ej. tras guardar), el componente vuelve al estado inicial.
 *
 *   <app-image-upload [imageUrl]="product.mainImageUrl" (changed)="onImageChange($event)">
 */
@Component({
  selector: 'app-image-upload',
  standalone: true,
  imports: [NgbDropdownModule],
  templateUrl: './image-upload.component.html',
  styleUrls: ['./image-upload.component.css']
})
export class ImageUploadComponent implements OnDestroy {
  private readonly uploadService = inject(UploadService);
  private readonly modalService = inject(NgbModal);

  @Input() size: 'sm' | 'lg' = 'lg';
  @Input() disabled = false;
  @Input() label = 'Imagen';

  // URL pública de la imagen guardada (mainImageUrl / imageUrl), nunca la key
  @Input() set imageUrl(url: string | null | undefined) {
    this.savedUrl.set(url ?? null);
    this.reset();
  }

  @Output() changed = new EventEmitter<ImageChange>();

  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;
  @ViewChild('captureInput') private captureInput?: ElementRef<HTMLInputElement>;

  readonly accept = this.uploadService.ACCEPTED_TYPES.join(',');

  savedUrl = signal<string | null>(null);
  state = signal<UploadState>('idle');
  // Vista previa local mientras se sube/procesa, y la del backend cuando está lista
  localPreview = signal<string | null>(null);
  readyPreview = signal<string | null>(null);
  errorMessage = signal<string | null>(null);

  private subscription: Subscription | null = null;
  private previewRef: NgbModalRef | null = null;

  private previewStatus = computed<ImagePreviewStatus | null>(() => {
    switch (this.state()) {
      case 'idle': return this.savedUrl() ? 'saved' : null;
      case 'removed': return null;
      case 'failed': return this.localPreview() ? 'failed' : null;
      default: return this.state() as ImagePreviewStatus;
    }
  });

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

  get canPreview(): boolean {
    return this.previewStatus() !== null;
  }

  get canRemove(): boolean {
    return !this.disabled && !this.isBusy && this.displayUrl !== null;
  }

  // Hay un cambio respecto a la imagen guardada que se puede descartar
  get canUndo(): boolean {
    return !this.disabled && this.state() !== 'idle';
  }

  // --- ORIGEN DE LA IMAGEN ---

  chooseFile(): void {
    this.fileInput?.nativeElement.click();
  }

  takePhoto(): void {
    // Sin getUserMedia (p. ej. sin HTTPS) se usa la cámara del sistema; el click debe ser síncrono
    if (!CameraCaptureComponent.isSupported()) {
      this.captureInput?.nativeElement.click();
      return;
    }

    const ref = this.modalService.open(CameraCaptureComponent, { centered: true, size: 'lg' });
    ref.result.then(
      (result: CameraCaptureResult) => this.handleFile(result.file),
      () => {}
    );
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.handleFile(file);
  }

  private handleFile(file: File): void {
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

  // --- VISTA AMPLIADA ---

  openPreview(): void {
    if (!this.canPreview) return;

    const source: ImagePreviewSource = {
      label: this.label,
      status: computed(() => this.previewStatus() ?? 'saved'),
      savedUrl: this.savedUrl,
      originalUrl: this.localPreview,
      processedUrl: this.readyPreview,
      error: this.errorMessage
    };

    this.previewRef = this.modalService.open(ImagePreviewComponent, { centered: true, size: 'xl' });
    this.previewRef.componentInstance.source = source;
    this.previewRef.result.finally(() => (this.previewRef = null)).catch(() => {});
  }

  // --- ACCIONES ---

  remove(): void {
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

  undo(): void {
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
    // La vista ampliada lee las signals de este componente: se cierra con él
    this.previewRef?.dismiss();
    this.cancelUpload();
    this.revokeLocalPreview();
  }
}
