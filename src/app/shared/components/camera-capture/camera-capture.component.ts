import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { NgbActiveModal } from '@ng-bootstrap/ng-bootstrap';

type CameraState = 'starting' | 'live' | 'captured' | 'error';

// Resultado del modal: la foto tomada (con la cámara en vivo o con la del sistema)
export interface CameraCaptureResult {
  file: File;
}

/**
 * Modal de cámara en vivo (getUserMedia). Se abre con NgbModal:
 *
 *   const ref = this.modalService.open(CameraCaptureComponent, { centered: true, size: 'lg' });
 *   ref.result.then((result: CameraCaptureResult) => ...).catch(() => {});
 *
 * Cierra con { file } al usar la foto. Si no hay acceso a la cámara, ofrece la cámara del sistema
 * (input con `capture`, que en móvil abre la app de cámara) dentro del propio modal.
 */
@Component({
  selector: 'app-camera-capture',
  standalone: true,
  templateUrl: './camera-capture.component.html',
  styleUrls: ['./camera-capture.component.css']
})
export class CameraCaptureComponent implements OnInit, OnDestroy {
  readonly modal = inject(NgbActiveModal);

  // La API procesa a 1920x1920; se pide una resolución parecida
  private readonly IDEAL_SIZE = 1920;
  private readonly JPEG_QUALITY = 0.92;
  // Cuadros que se esperan como máximo si la cámara aún entrega imagen negra (~1 s)
  private readonly MAX_BLACK_FRAME_RETRIES = 30;
  private readonly BLACK_LUMINANCE_THRESHOLD = 8;

  state = signal<CameraState>('starting');
  errorMessage = signal<string | null>(null);
  capturedUrl = signal<string | null>(null);
  // La cámara ya entrega imagen: hasta entonces "Capturar" queda deshabilitado
  isVideoReady = signal<boolean>(false);
  isCapturing = signal<boolean>(false);
  cameras = signal<MediaDeviceInfo[]>([]);

  private stream: MediaStream | null = null;
  private currentDeviceId: string | null = null;
  private capturedBlob: Blob | null = null;

  // Siempre presente en la plantilla: se puede usar desde ngOnInit
  @ViewChild('video', { static: true }) private videoRef!: ElementRef<HTMLVideoElement>;

  private get videoElement(): HTMLVideoElement {
    return this.videoRef.nativeElement;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * Comprobación periódica de que el video ya tiene imagen. Los eventos del <video> no siempre
   * llegan a refrescar la vista del modal; este temporizador lo garantiza y se detiene al estar lista.
   */
  private readinessTimer: ReturnType<typeof setInterval> | null = null;
  private readonly READINESS_CHECK_MS = 250;

  ngOnInit(): void {
    this.startCamera();
  }

  /**
   * Abre la cámara indicada o, sin deviceId, la trasera si existe (móvil).
   * En computadoras `facingMode` se ignora: para cambiar de cámara se usa el deviceId.
   */
  private async startCamera(deviceId?: string): Promise<void> {
    this.stopCamera();
    this.state.set('starting');
    this.isVideoReady.set(false);
    this.errorMessage.set(null);

    const size = { width: { ideal: this.IDEAL_SIZE }, height: { ideal: this.IDEAL_SIZE } };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: deviceId
          ? { deviceId: { exact: deviceId }, ...size }
          : { facingMode: { ideal: 'environment' }, ...size }
      });
      this.currentDeviceId = this.stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? null;
      this.attachStream(this.stream);
      this.state.set('live');

      // Los nombres e ids de las cámaras solo están disponibles después de dar permiso
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameras.set(devices.filter(d => d.kind === 'videoinput'));
    } catch (error) {
      this.state.set('error');
      this.errorMessage.set(this.describeError(error));
    }
  }

  private describeError(error: unknown): string {
    const name = error instanceof DOMException ? error.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'No se dio permiso para usar la cámara. Revisa los permisos del navegador.';
    }
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'No se encontró una cámara disponible en este dispositivo.';
    }
    if (name === 'NotReadableError') {
      return 'La cámara está en uso por otra aplicación.';
    }
    return 'No se pudo iniciar la cámara.';
  }

  // Se asigna por propiedad: el atributo `muted` de la plantilla no actualiza la propiedad
  private attachStream(stream: MediaStream): void {
    const video = this.videoElement;
    video.muted = true;
    video.srcObject = stream;
    video.play().then(() => this.onVideoFrame()).catch(() => {
      // Si el navegador bloquea play(), `autoplay` lo reintenta al tener datos
    });

    this.stopReadinessCheck();
    this.readinessTimer = setInterval(() => this.onVideoFrame(), this.READINESS_CHECK_MS);
  }

  // Eventos del video (loadeddata, playing, resize) y la comprobación periódica
  onVideoFrame(): void {
    if (this.stream && this.videoElement.videoWidth > 0) {
      this.isVideoReady.set(true);
      this.stopReadinessCheck();
    }
  }

  private stopReadinessCheck(): void {
    if (this.readinessTimer) clearInterval(this.readinessTimer);
    this.readinessTimer = null;
  }

  currentCameraLabel(): string {
    const cameras = this.cameras();
    const index = cameras.findIndex(c => c.deviceId === this.currentDeviceId);
    return cameras[index]?.label || `Cámara ${index + 1}`;
  }

  // Pasa a la siguiente cámara de la lista
  switchCamera(): void {
    const cameras = this.cameras();
    if (cameras.length < 2) return;
    const index = cameras.findIndex(c => c.deviceId === this.currentDeviceId);
    const next = cameras[(index + 1) % cameras.length];
    this.startCamera(next.deviceId);
  }

  async capture(): Promise<void> {
    const video = this.videoElement;
    if (!video || !this.isVideoReady() || this.isCapturing()) return;
    this.isCapturing.set(true);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      this.isCapturing.set(false);
      return;
    }

    // Algunas cámaras entregan cuadros negros al arrancar: se espera a uno con imagen
    for (let attempt = 0; attempt <= this.MAX_BLACK_FRAME_RETRIES; attempt++) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (!this.isBlackFrame(canvas)) break;
      await this.nextFrame();
    }

    canvas.toBlob(blob => {
      this.isCapturing.set(false);
      if (!blob) return;
      this.capturedBlob = blob;
      this.revokeCaptured();
      this.capturedUrl.set(URL.createObjectURL(blob));
      this.state.set('captured');
      this.stopCamera();
    }, 'image/jpeg', this.JPEG_QUALITY);
  }

  // Luminancia media de una muestra reducida del cuadro
  private isBlackFrame(source: HTMLCanvasElement): boolean {
    const sample = document.createElement('canvas');
    sample.width = 32;
    sample.height = 32;
    const context = sample.getContext('2d', { willReadFrequently: true });
    if (!context) return false;

    context.drawImage(source, 0, 0, sample.width, sample.height);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    let total = 0;
    for (let i = 0; i < data.length; i += 4) {
      total += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    }
    return total / (data.length / 4) < this.BLACK_LUMINANCE_THRESHOLD;
  }

  private nextFrame(): Promise<void> {
    return new Promise(resolve => requestAnimationFrame(() => resolve()));
  }

  retake(): void {
    this.revokeCaptured();
    this.capturedBlob = null;
    this.startCamera(this.currentDeviceId ?? undefined);
  }

  usePhoto(): void {
    if (!this.capturedBlob) return;
    const file = new File([this.capturedBlob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' });
    this.modal.close({ file } satisfies CameraCaptureResult);
  }

  // El input está dentro del modal para que el click sea un gesto directo del usuario
  onSystemCapture(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) this.modal.close({ file } satisfies CameraCaptureResult);
  }

  private stopCamera(): void {
    this.stopReadinessCheck();
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    if (this.videoElement) this.videoElement.srcObject = null;
  }

  private revokeCaptured(): void {
    const url = this.capturedUrl();
    if (url) URL.revokeObjectURL(url);
    this.capturedUrl.set(null);
  }

  ngOnDestroy(): void {
    this.stopReadinessCheck();
    this.stopCamera();
    this.revokeCaptured();
  }
}
