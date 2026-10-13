import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
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
  private requestedDeviceId: string | undefined;
  // Última cámara que abrió bien y cámaras que no se pudieron abrir en este modal
  private lastWorkingDeviceId: string | null = null;
  private unavailableDeviceIds = new Set<string>();
  // Aviso cuando se tuvo que volver a la cámara anterior
  notice = signal<string | null>(null);
  private capturedBlob: Blob | null = null;

  // Cada apertura de cámara tiene un número: solo la más reciente puede quedarse con la stream
  private startRequest = 0;
  // Reintentos si la cámara aparece ocupada justo al cambiar (espera de 0.5 s y 1 s)
  private readonly BUSY_RETRIES = 2;
  private readonly BUSY_RETRY_DELAY_MS = 500;

  // Siempre presente en la plantilla: se puede usar desde ngOnInit
  @ViewChild('video', { static: true }) private videoRef!: ElementRef<HTMLVideoElement>;

  private get videoElement(): HTMLVideoElement {
    return this.videoRef.nativeElement;
  }

  static isSupported(): boolean {
    return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /**
   * Mientras el modal está abierto se revisa la cámara y se refresca la vista cada REFRESH_MS.
   * Comprobado en pruebas: sin este refresco continuo los cambios de la cámara (imagen lista,
   * captura, foto tomada) no siempre llegan a la pantalla. Detenerlo al estar lista rompe la captura.
   */
  private readonly cdr = inject(ChangeDetectorRef);
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly REFRESH_MS = 500;

  ngOnInit(): void {
    this.startCamera();
    this.refreshTimer = setInterval(() => {
      this.onVideoFrame();
      this.cdr.detectChanges();
    }, this.REFRESH_MS);
  }

  /**
   * Abre la cámara indicada o, sin deviceId, la trasera si existe (móvil).
   * En computadoras `facingMode` se ignora: para cambiar de cámara se usa el deviceId.
   */
  private async startCamera(deviceId?: string): Promise<void> {
    const request = ++this.startRequest;
    this.requestedDeviceId = deviceId;
    this.stopCamera();
    this.state.set('starting');
    this.isVideoReady.set(false);
    this.errorMessage.set(null);

    try {
      const stream = await this.openStream(deviceId);

      // Si mientras tanto se pidió otra cámara o se cerró el modal, esta stream sobra:
      // se detiene para no dejar la cámara ocupada
      if (request !== this.startRequest) {
        stream.getTracks().forEach(track => track.stop());
        return;
      }

      this.stream = stream;
      this.currentDeviceId = stream.getVideoTracks()[0]?.getSettings().deviceId ?? deviceId ?? null;
      this.lastWorkingDeviceId = this.currentDeviceId;
      if (this.currentDeviceId) this.unavailableDeviceIds.delete(this.currentDeviceId);
      this.attachStream(stream);
      this.state.set('live');

      // Los nombres e ids de las cámaras solo están disponibles después de dar permiso
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.cameras.set(devices.filter(d => d.kind === 'videoinput'));
    } catch (error) {
      if (request !== this.startRequest) return;

      // Al cambiar a una cámara que no se puede abrir (p. ej. la infrarroja de Windows Hello),
      // se vuelve a la que funcionaba y se la salta en los siguientes cambios
      if (deviceId && this.lastWorkingDeviceId && deviceId !== this.lastWorkingDeviceId) {
        this.unavailableDeviceIds.add(deviceId);
        this.notice.set(
          `No se pudo abrir "${this.cameraLabel(deviceId)}": ${this.describeError(error)} Se volvió a la cámara anterior.`
        );
        this.startCamera(this.lastWorkingDeviceId);
        return;
      }

      this.state.set('error');
      this.errorMessage.set(this.describeError(error));
    }
  }

  /**
   * En Windows la cámara recién detenida tarda unos instantes en liberarse y getUserMedia
   * responde NotReadableError ("en uso"): se reintenta con una espera creciente.
   */
  private async openStream(deviceId?: string): Promise<MediaStream> {
    const size = { width: { ideal: this.IDEAL_SIZE }, height: { ideal: this.IDEAL_SIZE } };
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: deviceId
        ? { deviceId: { exact: deviceId }, ...size }
        : { facingMode: { ideal: 'environment' }, ...size }
    };

    for (let attempt = 0; ; attempt++) {
      try {
        return await navigator.mediaDevices.getUserMedia(constraints);
      } catch (error) {
        const busy = error instanceof DOMException && error.name === 'NotReadableError';
        if (!busy || attempt >= this.BUSY_RETRIES) throw error;
        await new Promise(resolve => setTimeout(resolve, this.BUSY_RETRY_DELAY_MS * (attempt + 1)));
      }
    }
  }

  // Vuelve a intentar abrir la última cámara pedida (desde el estado de error)
  retryCamera(): void {
    this.startCamera(this.requestedDeviceId);
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
  }

  // Eventos del video (loadeddata, playing, resize) y el refresco periódico
  onVideoFrame(): void {
    if (this.stream && this.videoElement.videoWidth > 0) {
      this.isVideoReady.set(true);
    }
  }

  cameraLabel(deviceId: string | null | undefined): string {
    const cameras = this.cameras();
    const index = cameras.findIndex(c => c.deviceId === deviceId);
    if (index === -1) return 'Cámara';
    return cameras[index].label || `Cámara ${index + 1}`;
  }

  currentCameraLabel(): string {
    return this.cameraLabel(this.currentDeviceId);
  }

  // Cámaras a las que se puede cambiar: las demás, sin las que ya fallaron
  private switchableCameras(): MediaDeviceInfo[] {
    return this.cameras().filter(c => c.deviceId !== this.currentDeviceId && !this.unavailableDeviceIds.has(c.deviceId));
  }

  canSwitchCamera(): boolean {
    return this.switchableCameras().length > 0;
  }

  // Pasa a la siguiente cámara de la lista que no haya fallado
  switchCamera(): void {
    const cameras = this.cameras();
    const candidates = this.switchableCameras();
    if (candidates.length === 0) return;

    // Si la última apertura falló, se avanza desde la cámara que se intentó abrir
    const from = this.state() === 'error' ? this.requestedDeviceId ?? this.currentDeviceId : this.currentDeviceId;
    const start = cameras.findIndex(c => c.deviceId === from);
    const next = [...cameras.slice(start + 1), ...cameras.slice(0, start + 1)].find(c => candidates.includes(c))!;

    this.notice.set(null);
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
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    // Invalida una apertura en curso: su stream se detendrá en cuanto llegue
    this.startRequest++;
    this.stopCamera();
    this.revokeCaptured();
  }
}
