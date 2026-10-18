import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Swal from 'sweetalert2';
import { PrinterError, ZebraDevice, ZebraPrinterService } from '../../../core/services/zebra-printer.service';
import { PrinterStatus, sanitizeZplValue } from '../../utils/zpl';

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
  templateUrl: './printer-status.component.html'
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

  // Etiqueta mínima, válida para cualquier tamaño: comprueba la conexión y la calibración
  async printTest(): Promise<void> {
    this.isPrintingTest.set(true);
    this.checkError.set(null);
    try {
      const { device, status } = await this.zebra.checkStatus();
      this.checked.set({ device, status });
      if (!status.ready) return;

      const time = new Date().toLocaleString('es');
      const name = sanitizeZplValue(device.name);
      await this.zebra.send(
        `^XA^CI28^FO16,16^A0N,28,28^FDStockify: prueba^FS^FO16,52^A0N,22,22^FD${name}^FS^FO16,80^A0N,22,22^FD${time}^FS^PQ1^XZ`,
        device
      );
    } catch (error) {
      this.checkError.set(error instanceof PrinterError ? error.message : 'No se pudo imprimir la etiqueta de prueba.');
    } finally {
      this.isPrintingTest.set(false);
    }
  }
}
