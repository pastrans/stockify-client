import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import Swal from 'sweetalert2';
import { Product } from '../../shared/models/product.model';
import { ProductService } from '../../core/services/product.service';
import { ExportService } from '../../core/services/export.service';
import { translateApiMessage } from '../../shared/utils/api-error';
import { showApiErrorAlert } from '../../shared/utils/error-alert';
import { downloadBlob } from '../../shared/utils/download-file';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

/**
 * Acciones de Odoo sobre un producto (US-F5), compartidas por el listado y el formulario:
 * exportar, marcar como sincronizado y quitar la sincronización. Cada una resuelve true si
 * cambió algo y la vista debe recargar el producto.
 */
@Injectable({
  providedIn: 'root'
})
export class ProductOdooActionsService {
  private readonly productService = inject(ProductService);
  private readonly exportService = inject(ExportService);

  // Variantes activas que aún no están en Odoo: sus existencias se exportarán
  pendingVariantsCount(product: Product): number {
    return product.variants.filter(v => v.available && v.syncedAt === null).length;
  }

  // Se puede marcar si no está sincronizado o si tiene variantes nuevas pendientes de Odoo
  canSync(product: Product): boolean {
    return product.available && (product.status !== 'synced' || this.pendingVariantsCount(product) > 0);
  }

  canUnsync(product: Product): boolean {
    return product.available && product.status === 'synced';
  }

  async exportProduct(product: Product): Promise<boolean> {
    try {
      const result = await firstValueFrom(this.exportService.exportProduct(product.id));
      downloadBlob(result.blob, result.fileName);
      this.showExportNextSteps(result.fileName, product);
    } catch (err) {
      await showApiErrorAlert(err as HttpErrorResponse, 'No se pudo exportar', 'Error al generar la exportación del producto.');
    }
    return false;
  }

  async syncProduct(product: Product): Promise<boolean> {
    const pending = this.pendingVariantsCount(product);
    const confirm = await Swal.fire({
      theme: 'dark',
      icon: 'question',
      title: '¿Marcar como sincronizado?',
      text: product.status === 'synced'
        ? `"${product.name}" ya está sincronizado. Se marcarán sus ${pending === 1 ? 'variante nueva' : `${pending} variantes nuevas`} como importadas en Odoo.`
        : `¿Importaste en Odoo, sin errores, los archivos de "${product.name}"? Su SKU y sus códigos de barras quedarán congelados.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, marcar',
      cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return false;

    try {
      await firstValueFrom(this.productService.syncProducts([product.id]));
      toast.fire({ icon: 'success', title: `"${product.name}" marcado como sincronizado` });
      return true;
    } catch (err) {
      await showApiErrorAlert(err as HttpErrorResponse, 'No se pudo sincronizar', 'Error al marcar el producto como sincronizado.');
      return false;
    }
  }

  async unsyncProduct(product: Product): Promise<boolean> {
    const confirm = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: '¿Quitar la sincronización?',
      text: `"${product.name}" ya existe en Odoo. Al quitar la sincronización podrás volver a editar su prefijo y sus atributos, ` +
        'pero los cambios pueden crear variantes duplicadas en Odoo en la siguiente importación.',
      showCancelButton: true,
      confirmButtonText: 'Sí, quitar sincronización',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (!confirm.isConfirmed) return false;

    try {
      const result = await firstValueFrom(this.productService.unsyncProduct(product.id));
      if (result.warning) {
        // La advertencia no es un error: el cambio se hizo, pero hay que avisar del riesgo
        await Swal.fire({
          theme: 'dark',
          icon: 'warning',
          title: 'Sincronización quitada',
          text: translateApiMessage(result.warning),
          confirmButtonText: 'Entendido'
        });
      } else {
        toast.fire({ icon: 'success', title: 'Sincronización quitada' });
      }
      return true;
    } catch (err) {
      await showApiErrorAlert(err as HttpErrorResponse, 'No se pudo quitar la sincronización', 'Error al quitar la sincronización del producto.');
      return false;
    }
  }

  private showExportNextSteps(fileName: string, product: Product): void {
    const container = document.createElement('div');
    container.className = 'text-start small';

    const downloaded = document.createElement('p');
    downloaded.append('Se descargó ');
    const name = document.createElement('code');
    name.textContent = fileName;
    downloaded.append(name, '.');
    container.appendChild(downloaded);

    // Las existencias solo se exportan de variantes pendientes con stock (D-19)
    const hasStockFile = product.variants.some(v =>
      v.available && v.syncedAt === null && v.stockStore + v.stockWarehouse > 0
    );
    const steps = [
      hasStockFile ? 'Importa los archivos en Odoo en orden (1 → 4).' : 'Importa los archivos en Odoo en orden (1 → 3).',
      hasStockFile
        ? 'Después de importar las Existencias, pulsa "Aplicar todo" en Inventario físico.'
        : 'No trae Existencias: todas sus variantes ya están en Odoo o no tienen stock.',
      'Si todo se importó sin errores, vuelve al producto y pulsa "Marcar como sincronizado".'
    ];
    const list = document.createElement('ol');
    list.className = 'mb-0 ps-3';
    steps.forEach(text => {
      const item = document.createElement('li');
      item.className = 'mb-1';
      item.textContent = text;
      list.appendChild(item);
    });
    container.appendChild(list);

    Swal.fire({
      theme: 'dark',
      icon: 'success',
      title: 'Exportación generada',
      html: container,
      confirmButtonText: 'Entendido',
      width: '40rem'
    });
  }
}
