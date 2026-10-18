import { Component, DestroyRef, OnDestroy, OnInit, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { Product, ProductVariant } from '../../../../shared/models/product.model';
import { LabelTemplate } from '../../../../shared/models/label-template.model';
import { LabelSettings } from '../../../../shared/models/label-settings.model';
import { SelectOption } from '../../../../shared/models/select-option.model';
import { LabelTemplateService } from '../../../../core/services/label-template.service';
import { SettingsService } from '../../../../core/services/settings.service';
import { LabelaryService } from '../../../../core/services/labelary.service';
import { LabelQueueService } from '../../../../core/services/label-queue.service';
import { LabelPrintFlowService, labelContextFrom } from '../../../labels/label-print-flow.service';
import { SearchSelectComponent } from '../../../../shared/components/search-select/search-select.component';
import { PrinterStatusComponent } from '../../../../shared/components/printer-status/printer-status.component';
import { getApiErrorMessage } from '../../../../shared/utils/api-error';
import { LabelPrintItem, renderLabel, sizeOf, splitTemplate, totalLabels } from '../../../../shared/utils/zpl';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

const TEMPLATE_STORAGE_KEY = 'stockify.labels.template';
const TEMPLATES_LIMIT = 100;
const PREVIEW_DEBOUNCE_MS = 800;
const MAX_QUANTITY = 999;

// Pestaña "Etiquetas" del producto (US-L5): cantidades por variante, vista previa e impresión
@Component({
  selector: 'app-product-labels',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SearchSelectComponent, PrinterStatusComponent],
  templateUrl: './product-labels.component.html',
  styleUrls: ['./product-labels.component.css']
})
export class ProductLabelsComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly labelTemplateService = inject(LabelTemplateService);
  private readonly settingsService = inject(SettingsService);
  private readonly labelary = inject(LabelaryService);
  private readonly queue = inject(LabelQueueService);
  private readonly printFlow = inject(LabelPrintFlowService);

  product = input.required<Product>();

  readonly maxQuantity = MAX_QUANTITY;

  templates = signal<LabelTemplate[]>([]);
  settings = signal<LabelSettings | null>(null);
  isLoading = signal<boolean>(false);
  isRefreshingTemplates = signal<boolean>(false);
  isBusy = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Cantidad a imprimir por variante: empieza en 0 (D-07)
  quantities = signal<Record<number, number>>({});
  applyAllControl = new FormControl<number>(1, { nonNullable: true });
  templateControl = new FormControl<number | null>(this.readStoredTemplateId());

  previewUrl = signal<string | null>(null);
  previewError = signal<string | null>(null);
  isPreviewing = signal<boolean>(false);
  private readonly previewRequests = new Subject<void>();

  variants = computed<ProductVariant[]>(() => this.product().variants.filter(v => v.available));
  isSynced = computed(() => this.product().status === 'synced');

  private readonly templateId = signal<number | null>(this.templateControl.value);
  selectedTemplate = computed(() => this.templates().find(t => t.id === this.templateId()) ?? null);
  templateOptions = computed<SelectOption[]>(() =>
    this.templates().map(t => ({ value: t.id, label: t.name, hint: `${t.widthMm} × ${t.heightMm} mm` }))
  );

  items = computed<LabelPrintItem[]>(() => {
    const quantities = this.quantities();
    return this.variants().map(variant => ({ product: this.product(), variant, quantity: quantities[variant.id] ?? 0 }));
  });
  total = computed(() => totalLabels(this.items()));
  // La vista previa muestra la primera variante con cantidad > 0, o la primera si no hay ninguna
  previewItem = computed(() => this.items().find(item => item.quantity > 0) ?? this.items()[0] ?? null);

  constructor() {
    // Producto recargado (p. ej. tras guardar): se conservan las cantidades de las variantes que siguen
    effect(() => {
      const ids = new Set(this.variants().map(v => v.id));
      const current = this.quantities();
      const kept = Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(Number(id))));
      if (Object.keys(kept).length !== Object.keys(current).length) this.quantities.set(kept);
    }, { allowSignalWrites: true });

    this.previewRequests
      .pipe(debounceTime(PREVIEW_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.refreshPreview());
  }

  ngOnInit(): void {
    this.load();
    this.templateControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(id => {
        this.templateId.set(id);
        this.storeTemplateId(id);
        this.previewRequests.next();
      });
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  private load(): void {
    this.isLoading.set(true);
    forkJoin({
      templates: this.labelTemplateService.getTemplates(1, TEMPLATES_LIMIT, { available: 'true' }),
      settings: this.settingsService.getLabelSettings()
    }).subscribe({
      next: ({ templates, settings }) => {
        this.templates.set(templates.data ?? []);
        this.settings.set(settings);
        // La plantilla recordada puede ya no existir o estar inactiva
        if (!this.selectedTemplate()) {
          const first = this.templates()[0]?.id ?? null;
          this.templateControl.setValue(first, { emitEvent: false });
          this.templateId.set(first);
        }
        this.isLoading.set(false);
        this.previewRequests.next();
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar las plantillas de etiqueta.'));
        this.isLoading.set(false);
      }
    });
  }

  refreshTemplates(): void {
    if (this.isRefreshingTemplates()) return;
    this.isRefreshingTemplates.set(true);
    this.labelTemplateService.getTemplates(1, TEMPLATES_LIMIT, { available: 'true' }).subscribe({
      next: (res) => {
        this.templates.set(res.data ?? []);
        this.isRefreshingTemplates.set(false);
      },
      error: () => this.isRefreshingTemplates.set(false)
    });
  }

  // --- CANTIDADES ---

  sizeOf(variant: ProductVariant): string {
    return sizeOf(variant, labelContextFrom(this.settings()).sizeAttributeIds);
  }

  combinationLabel(variant: ProductVariant): string {
    return variant.combination.map(value => value.valueName).join(', ');
  }

  private clamp(value: unknown): number {
    const parsed = Math.floor(Number(value));
    return Number.isFinite(parsed) ? Math.min(MAX_QUANTITY, Math.max(0, parsed)) : 0;
  }

  setQuantity(variant: ProductVariant, value: string): void {
    this.quantities.update(current => ({ ...current, [variant.id]: this.clamp(value) }));
    this.previewRequests.next();
  }

  applyToAll(value: number): void {
    const quantity = this.clamp(value);
    this.quantities.set(Object.fromEntries(this.variants().map(v => [v.id, quantity])));
    this.previewRequests.next();
  }

  // --- VISTA PREVIA ---

  async refreshPreview(): Promise<void> {
    const template = this.selectedTemplate();
    const item = this.previewItem();
    if (!template || !item) return;

    const label = renderLabel(splitTemplate(template.zpl).label, item.product, item.variant, labelContextFrom(this.settings()));
    this.isPreviewing.set(true);
    this.previewError.set(null);
    try {
      const url = await this.labelary.preview(label, template.widthMm, template.heightMm, this.settings()?.printerDpi ?? 203);
      this.revokePreview();
      this.previewUrl.set(url);
    } catch (error) {
      this.previewError.set(error instanceof Error ? error.message : 'No se pudo generar la vista previa.');
    } finally {
      this.isPreviewing.set(false);
    }
  }

  private revokePreview(): void {
    const url = this.previewUrl();
    if (url) URL.revokeObjectURL(url);
    this.previewUrl.set(null);
  }

  previewWidthPx(): number {
    return Math.round((this.selectedTemplate()?.widthMm ?? 0) * 4);
  }

  // --- ACCIONES ---

  private jobRequest() {
    const template = this.selectedTemplate();
    if (!template) return null;
    const items = this.items();
    return {
      template,
      items,
      context: labelContextFrom(this.settings()),
      omitted: items.filter(item => item.quantity === 0).length
    };
  }

  async print(): Promise<void> {
    const request = this.jobRequest();
    if (!request || this.isBusy()) return;
    this.isBusy.set(true);
    try {
      await this.printFlow.print(request);
    } finally {
      this.isBusy.set(false);
    }
  }

  async download(): Promise<void> {
    const request = this.jobRequest();
    if (!request || this.isBusy()) return;
    this.isBusy.set(true);
    try {
      await this.printFlow.download(request);
    } finally {
      this.isBusy.set(false);
    }
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

  private readStoredTemplateId(): number | null {
    try {
      const stored = Number(localStorage.getItem(TEMPLATE_STORAGE_KEY));
      return Number.isInteger(stored) && stored > 0 ? stored : null;
    } catch {
      return null;
    }
  }

  private storeTemplateId(id: number | null): void {
    try {
      if (id) localStorage.setItem(TEMPLATE_STORAGE_KEY, String(id));
    } catch {
      // Sin almacenamiento disponible: la plantilla solo se recuerda en esta pantalla
    }
  }
}
