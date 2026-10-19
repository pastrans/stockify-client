import { Component, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { Product, ProductVariant, variantImageUrl } from '../../../../shared/models/product.model';
import { ImgFallbackDirective } from '../../../../shared/directives/img-fallback.directive';
import { LabelSettings } from '../../../../shared/models/label-settings.model';
import { SettingsService } from '../../../../core/services/settings.service';
import { LabelQueueService } from '../../../../core/services/label-queue.service';
import { labelContextFrom } from '../../../labels/label-print-flow.service';
import { LabelJobPanelComponent } from '../../../labels/label-job-panel/label-job-panel.component';
import { getApiErrorMessage } from '../../../../shared/utils/api-error';
import { LabelPrintItem, MAX_LABEL_QUANTITY, clampLabelQuantity, sizeOf, totalLabels } from '../../../../shared/utils/zpl';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

// Pestaña "Etiquetas" del producto (US-L5): cantidades por variante; la impresión va en el panel común
@Component({
  selector: 'app-product-labels',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, ImgFallbackDirective, LabelJobPanelComponent],
  templateUrl: './product-labels.component.html',
  styleUrls: ['./product-labels.component.css']
})
export class ProductLabelsComponent implements OnInit {
  private readonly settingsService = inject(SettingsService);
  private readonly queue = inject(LabelQueueService);

  product = input.required<Product>();

  settings = signal<LabelSettings | null>(null);
  errorMessage = signal<string | null>(null);

  // Cantidad a imprimir por variante: empieza en 0 (D-07)
  quantities = signal<Record<number, number>>({});
  applyAllControl = new FormControl<number>(1, { nonNullable: true });

  variants = computed<ProductVariant[]>(() => this.product().variants.filter(v => v.available));
  isSynced = computed(() => this.product().status === 'synced');

  items = computed<LabelPrintItem[]>(() => {
    const quantities = this.quantities();
    return this.variants().map(variant => ({ product: this.product(), variant, quantity: quantities[variant.id] ?? 0 }));
  });
  total = computed(() => totalLabels(this.items()));

  constructor() {
    // Producto recargado (p. ej. tras guardar): se conservan las cantidades de las variantes que siguen
    effect(() => {
      const ids = new Set(this.variants().map(v => v.id));
      const current = this.quantities();
      const kept = Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(Number(id))));
      if (Object.keys(kept).length !== Object.keys(current).length) this.quantities.set(kept);
    }, { allowSignalWrites: true });
  }

  ngOnInit(): void {
    this.settingsService.getLabelSettings().subscribe({
      next: (settings) => this.settings.set(settings),
      error: (err) => this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar la configuración de etiquetas.'))
    });
  }

  // --- CANTIDADES ---

  readonly maxQuantity = MAX_LABEL_QUANTITY;
  readonly variantImageUrl = variantImageUrl;

  sizeOf(variant: ProductVariant): string {
    return sizeOf(variant, labelContextFrom(this.settings()).sizeAttributeIds);
  }

  combinationLabel(variant: ProductVariant): string {
    return variant.combination.map(value => value.valueName).join(', ');
  }

  setQuantity(variant: ProductVariant, value: string): void {
    this.quantities.update(current => ({ ...current, [variant.id]: clampLabelQuantity(value) }));
  }

  applyToAll(value: number): void {
    const quantity = clampLabelQuantity(value);
    this.quantities.set(Object.fromEntries(this.variants().map(v => [v.id, quantity])));
  }

  addToQueue(): void {
    const entries = this.items()
      .filter(item => item.quantity > 0)
      .map(item => ({ variantId: item.variant.id, productId: this.product().id, quantity: item.quantity }));
    if (entries.length === 0) return;

    this.queue.add(entries);
    const total = entries.reduce((sum, entry) => sum + entry.quantity, 0);
    toast.fire({ icon: 'success', title: `Se agregaron ${total} etiquetas a la cola` });
  }
}
