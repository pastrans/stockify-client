import { Injectable, inject } from '@angular/core';
import Swal from 'sweetalert2';
import { LabelTemplate } from '../../shared/models/label-template.model';
import { LabelSettings } from '../../shared/models/label-settings.model';
import { PrinterError, ZebraPrinterService } from '../../core/services/zebra-printer.service';
import { downloadBlob } from '../../shared/utils/download-file';
import { LabelContext, LabelPrintItem, buildPrintJob, exceedsPriceCode, totalLabels } from '../../shared/utils/zpl';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true
});

export interface LabelJobRequest {
  template: LabelTemplate;
  items: LabelPrintItem[];
  context: LabelContext;
  // Filas que no se imprimen (cantidad 0 o variante inactiva), para avisarlo (RF-33)
  omitted: number;
}

// Contexto de impresión a partir de los ajustes: los atributos de talla inactivos se ignoran (RF-05)
export function labelContextFrom(settings: LabelSettings | null): LabelContext {
  const active = new Set(settings?.sizeAttributes.filter(a => a.available).map(a => a.id) ?? []);
  return {
    storeName: settings?.storeName ?? '',
    sizeAttributeIds: (settings?.sizeAttributeIds ?? []).filter(id => active.has(id))
  };
}

function list(items: string[]): HTMLUListElement {
  const ul = document.createElement('ul');
  ul.className = 'mb-2 ps-3';
  for (const text of items) {
    const li = document.createElement('li');
    li.textContent = text;
    ul.appendChild(li);
  }
  return ul;
}

function paragraph(text: string, className = 'mb-2'): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = className;
  p.textContent = text;
  return p;
}

function slug(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plantilla';
}

/**
 * Flujo común de impresión de etiquetas (US-L5, lo reutiliza la cola en US-L6):
 * avisos previos → verificar la impresora → etiqueta de prueba → el resto.
 * Los textos de los productos se insertan con textContent (los escribe el usuario).
 */
@Injectable({
  providedIn: 'root'
})
export class LabelPrintFlowService {
  private readonly zebra = inject(ZebraPrinterService);

  // Resuelve true si se imprimió todo
  async print(request: LabelJobRequest): Promise<boolean> {
    const items = request.items.filter(item => item.quantity > 0);
    if (items.length === 0) {
      await this.showNothingToPrint();
      return false;
    }
    if (!(await this.confirmWarnings(request, items, 'imprimir'))) return false;

    // RF-31: sin comunicación o con un problema, no se imprime
    let device;
    try {
      const checked = await this.zebra.checkStatus();
      if (!checked.status.ready) {
        await this.showPrinterProblem(`${checked.device.name} no puede imprimir:`, checked.status.problems);
        return false;
      }
      device = checked.device;
    } catch (error) {
      await this.showPrinterProblem(error instanceof PrinterError ? error.message : 'No se pudo verificar la impresora.', [
        '¿La luz del botón de la impresora está verde fija?',
        '¿El cable USB está bien conectado en ambos extremos?',
        '¿Zebra Browser Print está abierto (ícono junto al reloj de Windows)?'
      ]);
      return false;
    }

    const { template, context } = request;
    const total = totalLabels(items);

    try {
      // Una sola etiqueta: se imprime sin prueba
      if (total === 1) {
        await this.zebra.send(buildPrintJob(template.zpl, items, context), device);
        toast.fire({ icon: 'success', title: 'Se envió 1 etiqueta a la impresora' });
        return true;
      }

      // RF-32: primero una etiqueta de prueba (la primera variante, una copia)
      const testItem = { ...items[0], quantity: 1 };
      await this.zebra.send(buildPrintJob(template.zpl, [testItem], context), device);

      while (true) {
        const answer = await this.askTestResult(testItem, total - 1);
        if (answer === 'reprint') {
          await this.zebra.send(buildPrintJob(template.zpl, [testItem], context, { includeSetup: false }), device);
          continue;
        }
        if (answer === 'cancel') {
          toast.fire({ icon: 'info', title: 'Impresión cancelada: solo se imprimió la prueba' });
          return false;
        }
        break;
      }

      // El resto, restando la copia de prueba; la configuración ya se envió con la prueba
      const rest = items
        .map((item, index) => index === 0 ? { ...item, quantity: item.quantity - 1 } : item)
        .filter(item => item.quantity > 0);
      await this.zebra.send(buildPrintJob(template.zpl, rest, context, { includeSetup: false }), device);
      toast.fire({ icon: 'success', title: `Se enviaron ${total} etiquetas a la impresora` });
      return true;
    } catch (error) {
      await Swal.fire({
        theme: 'dark',
        icon: 'error',
        title: 'No se pudo imprimir',
        text: error instanceof PrinterError ? error.message : 'Error al enviar las etiquetas a la impresora.',
        confirmButtonText: 'Entendido'
      });
      return false;
    }
  }

  // RF-34: un solo .zpl con todo el trabajo
  async download(request: LabelJobRequest): Promise<boolean> {
    const items = request.items.filter(item => item.quantity > 0);
    if (items.length === 0) {
      await this.showNothingToPrint();
      return false;
    }
    if (!(await this.confirmWarnings(request, items, 'descargar'))) return false;

    const job = buildPrintJob(request.template.zpl, items, request.context);
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(new Blob([job], { type: 'text/plain;charset=utf-8' }), `etiquetas-${slug(request.template.name)}-${date}.zpl`);
    toast.fire({ icon: 'success', title: `Se descargó el .zpl con ${totalLabels(items)} etiquetas` });
    return true;
  }

  // RF-33: avisos previos en una sola confirmación. Sin avisos no pregunta nada
  private async confirmWarnings(request: LabelJobRequest, items: LabelPrintItem[], action: 'imprimir' | 'descargar'): Promise<boolean> {
    const warnings: string[] = [];

    const unsynced = [...new Map(items.filter(i => i.product.status !== 'synced').map(i => [i.product.id, i.product])).values()];
    if (unsynced.length > 0) {
      const names = unsynced.slice(0, 5).map(p => `"${p.name}"`).join(', ') + (unsynced.length > 5 ? ` y ${unsynced.length - 5} más` : '');
      warnings.push(
        `${unsynced.length === 1 ? 'El producto' : 'Los productos'} ${names} no ${unsynced.length === 1 ? 'está sincronizado' : 'están sincronizados'}: ` +
        'si cambian sus atributos o su prefijo, cambia el SKU del QR y las etiquetas impresas dejan de servir.'
      );
    }

    const highPrice = [...new Set(items.filter(i => exceedsPriceCode(i.product.salePrice)).map(i => i.product.name))];
    if (highPrice.length > 0) {
      warnings.push(`Precio de 100 o más en ${highPrice.map(n => `"${n}"`).join(', ')}: el precio oculto sale con 5 dígitos y puede no caber en la plantilla.`);
    }

    if (request.omitted > 0) {
      warnings.push(`Se omiten ${request.omitted} ${request.omitted === 1 ? 'fila' : 'filas'} con cantidad 0 o variante inactiva.`);
    }

    if (warnings.length === 0) return true;

    const container = document.createElement('div');
    container.className = 'text-start small';
    container.appendChild(paragraph(`Antes de ${action} ${totalLabels(items)} etiquetas con "${request.template.name}":`));
    container.appendChild(list(warnings));

    const result = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: action === 'imprimir' ? '¿Imprimir de todos modos?' : '¿Descargar de todos modos?',
      html: container,
      showCancelButton: true,
      confirmButtonText: action === 'imprimir' ? 'Sí, imprimir' : 'Sí, descargar',
      cancelButtonText: 'Cancelar',
      width: '40rem'
    });
    return result.isConfirmed;
  }

  private async askTestResult(testItem: LabelPrintItem, remaining: number): Promise<'continue' | 'reprint' | 'cancel'> {
    const container = document.createElement('div');
    container.className = 'text-start small';
    container.appendChild(paragraph(`Se imprimió una etiqueta de prueba de "${testItem.variant.displayName}".`));
    container.appendChild(paragraph('Revisa que el diseño, el QR y la posición sean correctos antes de imprimir el resto.', 'mb-0 text-secondary'));

    const result = await Swal.fire({
      theme: 'dark',
      icon: 'question',
      title: '¿Salió bien la etiqueta de prueba?',
      html: container,
      showDenyButton: true,
      showCancelButton: true,
      confirmButtonText: `Salió bien, imprimir ${remaining === 1 ? 'la restante' : `las ${remaining} restantes`}`,
      denyButtonText: 'Reimprimir prueba',
      denyButtonColor: '#6c757d',
      cancelButtonText: 'Cancelar',
      allowOutsideClick: false,
      allowEscapeKey: false,
      width: '36rem'
    });
    if (result.isConfirmed) return 'continue';
    if (result.isDenied) return 'reprint';
    return 'cancel';
  }

  private async showPrinterProblem(title: string, items: string[]): Promise<void> {
    const container = document.createElement('div');
    container.className = 'text-start small';
    container.appendChild(paragraph(title, 'fw-semibold mb-2'));
    container.appendChild(list(items));
    await Swal.fire({ theme: 'dark', icon: 'error', title: 'La impresora no está lista', html: container, confirmButtonText: 'Entendido' });
  }

  private async showNothingToPrint(): Promise<void> {
    await Swal.fire({
      theme: 'dark',
      icon: 'info',
      title: 'No hay etiquetas que imprimir',
      text: 'Pon una cantidad mayor que 0 en al menos una variante.',
      confirmButtonText: 'Entendido'
    });
  }
}
