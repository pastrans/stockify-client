import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import Swal from 'sweetalert2';
import { Product, ProductVariant } from '../../../shared/models/product.model';
import { LabelSettings } from '../../../shared/models/label-settings.model';
import { ProductService } from '../../../core/services/product.service';
import { SettingsService } from '../../../core/services/settings.service';
import { LabelQueueEntry, LabelQueueService } from '../../../core/services/label-queue.service';
import { labelContextFrom } from '../label-print-flow.service';
import { LabelJobPanelComponent } from '../label-job-panel/label-job-panel.component';
import { getApiErrorMessage } from '../../../shared/utils/api-error';
import { LabelPrintItem, MAX_LABEL_QUANTITY, clampLabelQuantity, sizeOf } from '../../../shared/utils/zpl';

interface QueueRow {
  entry: LabelQueueEntry;
  product: Product | null;
  variant: ProductVariant | null;
  // El producto y la variante existen y están activos: se puede imprimir
  printable: boolean;
}

/**
 * Cola de impresión (US-L6): variantes de varios productos que se imprimen juntas con una plantilla.
 * La cola guarda solo ids y cantidades; los datos de los productos se cargan al abrirla (RF-29).
 */
@Component({
  selector: 'app-label-queue',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, LabelJobPanelComponent],
  templateUrl: './label-queue.component.html'
})
export class LabelQueueComponent implements OnInit {
  private readonly queue = inject(LabelQueueService);
  private readonly productService = inject(ProductService);
  private readonly settingsService = inject(SettingsService);

  readonly maxQuantity = MAX_LABEL_QUANTITY;
  readonly entries = this.queue.entries;

  products = signal<Map<number, Product | null>>(new Map());
  settings = signal<LabelSettings | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  applyAllControl = new FormControl<number>(1, { nonNullable: true });

  rows = computed<QueueRow[]>(() => {
    const products = this.products();
    return this.entries().map(entry => {
      const product = products.get(entry.productId) ?? null;
      const variant = product?.variants.find(v => v.id === entry.variantId) ?? null;
      return { entry, product, variant, printable: !!product?.available && !!variant?.available };
    });
  });

  items = computed<LabelPrintItem[]>(() =>
    this.rows()
      .filter(row => row.printable)
      .map(row => ({ product: row.product!, variant: row.variant!, quantity: row.entry.quantity }))
  );
  unavailableCount = computed(() => this.rows().filter(row => !row.printable).length);
  total = computed(() => this.items().reduce((sum, item) => sum + item.quantity, 0));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const productIds = [...new Set(this.entries().map(entry => entry.productId))];
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      settings: this.settingsService.getLabelSettings(),
      // Un producto que ya no existe no rompe la cola: su fila queda marcada como no disponible
      products: productIds.length === 0
        ? of([] as [number, Product | null][])
        : forkJoin(productIds.map(id =>
            this.productService.getProductById(id).pipe(
              map(product => [id, product] as [number, Product | null]),
              catchError(() => of([id, null] as [number, Product | null]))
            )
          ))
    }).subscribe({
      next: ({ settings, products }) => {
        this.settings.set(settings);
        this.products.set(new Map(products));
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar la cola de impresión.'));
        this.isLoading.set(false);
      }
    });
  }

  // --- DATOS PARA LA VISTA ---

  sizeOf(variant: ProductVariant): string {
    return sizeOf(variant, labelContextFrom(this.settings()).sizeAttributeIds);
  }

  combinationLabel(variant: ProductVariant): string {
    return variant.combination.map(value => value.valueName).join(', ');
  }

  unavailableReason(row: QueueRow): string {
    if (!row.product) return 'El producto ya no existe';
    if (!row.product.available) return 'El producto está inactivo';
    return row.variant ? 'La variante está inactiva' : 'La variante ya no existe';
  }

  // --- ACCIONES ---

  setQuantity(row: QueueRow, value: string): void {
    this.queue.setQuantity(row.entry.variantId, clampLabelQuantity(value));
  }

  applyToAll(value: number): void {
    this.queue.setAllQuantities(clampLabelQuantity(value));
  }

  remove(row: QueueRow): void {
    this.queue.remove([row.entry.variantId]);
  }

  removeUnavailable(): void {
    this.queue.remove(this.rows().filter(row => !row.printable).map(row => row.entry.variantId));
  }

  async clear(): Promise<void> {
    const result = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: '¿Vaciar la cola?',
      text: 'Se quitarán todas las etiquetas de la cola.',
      showCancelButton: true,
      confirmButtonText: 'Sí, vaciar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (result.isConfirmed) this.queue.clear();
  }

  // Tras imprimir todo, se ofrece quitar de la cola lo que ya se imprimió
  async onPrinted(): Promise<void> {
    const printed = this.items().filter(item => item.quantity > 0).map(item => item.variant.id);
    if (printed.length === 0) return;

    const result = await Swal.fire({
      theme: 'dark',
      icon: 'question',
      title: '¿Quitar de la cola lo impreso?',
      text: `Se imprimieron ${this.total()} etiquetas. ¿Las quito de la cola?`,
      showCancelButton: true,
      confirmButtonText: 'Sí, quitarlas',
      cancelButtonText: 'Dejarlas en la cola'
    });
    if (result.isConfirmed) this.queue.remove(printed);
  }
}
