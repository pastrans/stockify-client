import { Component, OnDestroy, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { LABEL_TOP_RANGE, PrinterError, ZebraDevice, ZebraPrinterService } from '../../../core/services/zebra-printer.service';
import { LabelaryService } from '../../../core/services/labelary.service';
import { PrinterStatus, dotsPerMm, sanitizeZplValue, setQuantity } from '../../utils/zpl';

// Etiqueta real con la que probar la impresora (la plantilla elegida con una variante)
export interface PrinterTestLabel {
  // Solo la etiqueta (sin bloques de configuración), con los marcadores ya sustituidos
  zpl: string;
  // Vista previa de Labelary: así debe salir impresa
  previewUrl: string | null;
  widthMm: number;
  description: string;
}

// Tamaño con el que se dibuja la vista previa de la etiqueta genérica
const GENERIC_PREVIEW_SIZE_MM = { width: 40, height: 30 };

/**
 * Impresora Zebra elegida, selector y botón "Verificar impresora" (US-L4).
 * La elección se guarda en el navegador; el flujo de impresión vuelve a verificar antes de imprimir.
 * Con [testLabel], la prueba imprime esa etiqueta real y el ajuste de posición la muestra como
 * referencia ("así debe salir"); sin ella, se usa una etiqueta genérica que se explica sola.
 *
 *   <app-printer-status [testLabel]="testLabel()"></app-printer-status>
 */
@Component({
  selector: 'app-printer-status',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './printer-status.component.html',
  styles: [
    '.position-input { width: 130px; }',
    // El selector ocupa su propia línea en columnas estrechas y los botones bajan debajo
    '.printer-picker { min-width: 260px; }',
    '.expected-image { max-width: 220px; height: auto; background: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.15); image-rendering: pixelated; }',
    '.expected-empty { width: 160px; height: 120px; border: 1px dashed rgba(255,255,255,.2); border-radius: .375rem; }'
  ]
})
export class PrinterStatusComponent implements OnInit, OnDestroy {
  private readonly zebra = inject(ZebraPrinterService);
  private readonly labelary = inject(LabelaryService);

  testLabel = input<PrinterTestLabel | null>(null);

  readonly selectedUid = this.zebra.selectedUid;

  printers = signal<ZebraDevice[]>([]);
  defaultUid = signal<string | null>(null);
  isLoading = signal<boolean>(false);
  isChecking = signal<boolean>(false);
  // Error de conexión con Browser Print
  connectionError = signal<string | null>(null);
  // Resultado de la última verificación
  checked = signal<{ device: ZebraDevice; status: PrinterStatus } | null>(null);
  checkError = signal<string | null>(null);
  isPrintingTest = signal<boolean>(false);
  isCalibrating = signal<boolean>(false);

  // Ajuste del margen superior (^LT), en mm; la impresora lo guarda en puntos
  showPosition = signal<boolean>(false);
  isReadingPosition = signal<boolean>(false);
  isSavingPosition = signal<boolean>(false);
  currentLabelTopDots = signal<number | null>(null);
  labelTopMm = 0;
  // La GK420d es de 203 dpi (8 puntos por mm)
  readonly dotsPerMm = dotsPerMm(203);
  readonly labelTopRangeMm = {
    min: LABEL_TOP_RANGE.min / this.dotsPerMm,
    max: LABEL_TOP_RANGE.max / this.dotsPerMm
  };

  // Referencia de cómo debe salir la prueba: la etiqueta real o, sin ella, la genérica
  private genericPreviewUrl = signal<string | null>(null);
  expected = computed(() => {
    const real = this.testLabel();
    if (real) return { url: real.previewUrl, widthPx: real.widthMm * 4, description: real.description };
    return { url: this.genericPreviewUrl(), widthPx: GENERIC_PREVIEW_SIZE_MM.width * 4, description: 'Etiqueta de prueba genérica' };
  });

  ngOnInit(): void {
    this.loadPrinters();
  }

  ngOnDestroy(): void {
    const url = this.genericPreviewUrl();
    if (url) URL.revokeObjectURL(url);
  }

  async loadPrinters(): Promise<void> {
    this.isLoading.set(true);
    this.connectionError.set(null);
    try {
      const [printers, fallback] = await Promise.all([this.zebra.listPrinters(), this.zebra.getDefaultPrinter()]);
      this.printers.set(printers);
      this.defaultUid.set(fallback?.uid ?? null);
    } catch (error) {
      this.printers.set([]);
      this.connectionError.set(error instanceof PrinterError ? error.message : 'No se pudo consultar Zebra Browser Print.');
    } finally {
      this.isLoading.set(false);
    }
  }

  onSelect(uid: string): void {
    this.zebra.selectPrinter(uid || null);
    this.checked.set(null);
    this.checkError.set(null);
  }

  async verify(): Promise<void> {
    this.isChecking.set(true);
    this.checked.set(null);
    this.checkError.set(null);
    try {
      this.checked.set(await this.zebra.checkStatus());
      this.connectionError.set(null);
    } catch (error) {
      this.checkError.set(error instanceof PrinterError ? error.message : 'No se pudo verificar la impresora.');
    } finally {
      this.isChecking.set(false);
    }
  }

  /**
   * Calibración del rollo con ~JC: la impresora avanza algunas etiquetas y mide dónde empieza cada una.
   * Hace falta al cambiar de rollo o de tamaño de etiqueta; sin ella, la impresión sale corrida
   * (p. ej. el nombre cae en el espacio entre etiquetas).
   */
  async calibrate(): Promise<void> {
    const confirm = await Swal.fire({
      theme: 'dark',
      icon: 'question',
      title: '¿Calibrar la impresora?',
      text: 'La impresora avanzará algunas etiquetas en blanco para medir el rollo. Hazlo cada vez que cambies de rollo o de tamaño de etiqueta.',
      showCancelButton: true,
      confirmButtonText: 'Sí, calibrar',
      cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return;

    this.isCalibrating.set(true);
    this.checkError.set(null);
    try {
      const { device, status } = await this.zebra.checkStatus();
      this.checked.set({ device, status });
      if (!status.ready) return;
      await this.zebra.send('~JC', device);
      await Swal.fire({
        theme: 'dark',
        icon: 'success',
        title: 'Calibración enviada',
        text: 'Cuando la impresora deje de avanzar etiquetas, pulsa "Imprimir prueba" para comprobar que el texto sale centrado en la etiqueta.',
        confirmButtonText: 'Entendido'
      });
    } catch (error) {
      this.checkError.set(error instanceof PrinterError ? error.message : 'No se pudo calibrar la impresora.');
    } finally {
      this.isCalibrating.set(false);
    }
  }

  async togglePosition(): Promise<void> {
    this.showPosition.update(open => !open);
    if (!this.showPosition()) return;
    if (!this.testLabel() && !this.genericPreviewUrl()) this.loadGenericPreview();

    this.isReadingPosition.set(true);
    this.checkError.set(null);
    try {
      const dots = await this.zebra.readLabelTop();
      this.currentLabelTopDots.set(dots);
      this.labelTopMm = dots === null ? 0 : dots / this.dotsPerMm;
    } catch (error) {
      this.checkError.set(error instanceof PrinterError ? error.message : 'No se pudo leer la configuración de la impresora.');
    } finally {
      this.isReadingPosition.set(false);
    }
  }

  mmToDots(mm: number): number {
    return Math.round(Number(mm) * this.dotsPerMm);
  }

  isPositionInRange(): boolean {
    const dots = this.mmToDots(this.labelTopMm);
    return dots >= LABEL_TOP_RANGE.min && dots <= LABEL_TOP_RANGE.max;
  }

  // Guarda el margen en la impresora y saca una etiqueta de prueba para comprobarlo
  async savePosition(): Promise<void> {
    if (!this.isPositionInRange()) return;
    const dots = this.mmToDots(this.labelTopMm);

    const confirm = await Swal.fire({
      theme: 'dark',
      icon: 'question',
      title: '¿Guardar el margen superior?',
      text: `La impresora dejará el margen en ${dots / this.dotsPerMm} mm (${dots} puntos) para todas las impresiones, ` +
        'con cualquier plantilla y programa, y luego imprimirá una etiqueta de prueba.',
      showCancelButton: true,
      confirmButtonText: 'Sí, guardar y probar',
      cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return;

    this.isSavingPosition.set(true);
    this.checkError.set(null);
    try {
      const { device, status } = await this.zebra.checkStatus();
      this.checked.set({ device, status });
      if (!status.ready) return;
      await this.zebra.saveLabelTop(dots, device);
      this.currentLabelTopDots.set(dots);
      await this.sendTestLabel(device);
    } catch (error) {
      this.checkError.set(error instanceof PrinterError ? error.message : 'No se pudo guardar el margen superior.');
    } finally {
      this.isSavingPosition.set(false);
    }
  }

  // Etiqueta mínima, válida para cualquier tamaño: comprueba la conexión y la calibración
  async printTest(): Promise<void> {
    this.isPrintingTest.set(true);
    this.checkError.set(null);
    try {
      const { device, status } = await this.zebra.checkStatus();
      this.checked.set({ device, status });
      if (!status.ready) return;

      await this.sendTestLabel(device);
    } catch (error) {
      this.checkError.set(error instanceof PrinterError ? error.message : 'No se pudo imprimir la etiqueta de prueba.');
    } finally {
      this.isPrintingTest.set(false);
    }
  }

  // La etiqueta real (una copia) o, sin ella, la genérica
  private async sendTestLabel(device: ZebraDevice): Promise<void> {
    const real = this.testLabel();
    await this.zebra.send(real ? setQuantity(real.zpl, 1) : this.genericTestZpl(device.name), device);
  }

  /**
   * Etiqueta genérica que se explica sola: una línea a 1 mm del borde superior con la indicación
   * impresa al lado. Si la línea no sale entera, la impresión está corrida hacia arriba.
   */
  private genericTestZpl(printerName: string): string {
    const time = new Date().toLocaleString('es');
    const name = sanitizeZplValue(printerName);
    const top = this.dotsPerMm;
    return `^XA^CI28^FO16,${top}^GB288,3,3^FS` +
      `^FO16,${top + 10}^A0N,20,18^FDDebe verse la línea de arriba entera^FS` +
      `^FO16,${top + 36}^A0N,28,28^FDStockify: prueba^FS` +
      `^FO16,${top + 72}^A0N,20,20^FD${name}^FS` +
      `^FO16,${top + 98}^A0N,20,20^FD${time}^FS^PQ1^XZ`;
  }

  private async loadGenericPreview(): Promise<void> {
    try {
      const url = await this.labelary.preview(
        this.genericTestZpl('Zebra'), GENERIC_PREVIEW_SIZE_MM.width, GENERIC_PREVIEW_SIZE_MM.height, 203
      );
      this.genericPreviewUrl.set(url);
    } catch {
      // Sin vista previa: el texto de la etiqueta ya explica qué revisar
    }
  }
}
