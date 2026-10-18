import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { LABEL_TOP_RANGE, PrinterError, ZebraDevice, ZebraPrinterService } from '../../../core/services/zebra-printer.service';
import { PrinterStatus, dotsPerMm, sanitizeZplValue } from '../../utils/zpl';

/**
 * Impresora Zebra elegida, selector y botón "Verificar impresora" (US-L4).
 * La elección se guarda en el navegador; el flujo de impresión vuelve a verificar antes de imprimir.
 *
 *   <app-printer-status></app-printer-status>
 */
@Component({
  selector: 'app-printer-status',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './printer-status.component.html',
  styles: ['.position-input { width: 130px; }']
})
export class PrinterStatusComponent implements OnInit {
  private readonly zebra = inject(ZebraPrinterService);

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

  ngOnInit(): void {
    this.loadPrinters();
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

  // La línea superior va a 1 mm del borde: si no se ve entera, la impresión está corrida
  private async sendTestLabel(device: ZebraDevice): Promise<void> {
    const time = new Date().toLocaleString('es');
    const name = sanitizeZplValue(device.name);
    const top = this.dotsPerMm;
    await this.zebra.send(
      `^XA^CI28^FO16,${top}^GB288,3,3^FS^FO16,${top + 12}^A0N,28,28^FDStockify: prueba^FS` +
      `^FO16,${top + 48}^A0N,22,22^FD${name}^FS^FO16,${top + 76}^A0N,22,22^FD${time}^FS^PQ1^XZ`,
      device
    );
  }
}
