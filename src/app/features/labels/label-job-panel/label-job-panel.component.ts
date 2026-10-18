import { Component, DestroyRef, EventEmitter, OnDestroy, OnInit, Output, computed, effect, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { LabelTemplate } from '../../../shared/models/label-template.model';
import { LabelSettings } from '../../../shared/models/label-settings.model';
import { SelectOption } from '../../../shared/models/select-option.model';
import { LabelTemplateService } from '../../../core/services/label-template.service';
import { LabelaryService } from '../../../core/services/labelary.service';
import { LabelPrintFlowService, labelContextFrom } from '../label-print-flow.service';
import { SearchSelectComponent } from '../../../shared/components/search-select/search-select.component';
import { PrinterStatusComponent, PrinterTestLabel } from '../../../shared/components/printer-status/printer-status.component';
import { getApiErrorMessage } from '../../../shared/utils/api-error';
import { LabelPrintItem, renderLabel, splitTemplate, totalLabels } from '../../../shared/utils/zpl';

const TEMPLATE_STORAGE_KEY = 'stockify.labels.template';
const TEMPLATES_LIMIT = 100;
const PREVIEW_DEBOUNCE_MS = 800;

/**
 * Panel de impresión común a la pestaña "Etiquetas" del producto (US-L5) y a la cola (US-L6):
 * impresora, plantilla (recordada en el navegador), vista previa e Imprimir / Descargar .zpl.
 * Las acciones propias de cada pantalla se proyectan con el atributo panelActions.
 *
 *   <app-label-job-panel [items]="items()" [settings]="settings()" [omitted]="omitted()" (printed)="onPrinted()">
 *     <button panelActions ...>Agregar a la cola</button>
 *   </app-label-job-panel>
 */
@Component({
  selector: 'app-label-job-panel',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SearchSelectComponent, PrinterStatusComponent],
  templateUrl: './label-job-panel.component.html',
  styleUrls: ['./label-job-panel.component.css']
})
export class LabelJobPanelComponent implements OnInit, OnDestroy {
  private readonly destroyRef = inject(DestroyRef);
  private readonly labelTemplateService = inject(LabelTemplateService);
  private readonly labelary = inject(LabelaryService);
  private readonly printFlow = inject(LabelPrintFlowService);

  // Filas a imprimir (las de cantidad 0 no se imprimen)
  items = input.required<LabelPrintItem[]>();
  settings = input<LabelSettings | null>(null);
  // Filas que no se imprimen por otro motivo (p. ej. variantes inactivas de la cola)
  omitted = input<number>(0);

  // Se emite cuando se imprimió todo el trabajo
  @Output() printed = new EventEmitter<void>();

  templates = signal<LabelTemplate[]>([]);
  isLoading = signal<boolean>(false);
  isRefreshingTemplates = signal<boolean>(false);
  isBusy = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  templateControl = new FormControl<number | null>(this.readStoredTemplateId());
  private readonly templateId = signal<number | null>(this.templateControl.value);

  previewUrl = signal<string | null>(null);
  previewError = signal<string | null>(null);
  isPreviewing = signal<boolean>(false);
  private readonly previewRequests = new Subject<void>();

  selectedTemplate = computed(() => this.templates().find(t => t.id === this.templateId()) ?? null);
  templateOptions = computed<SelectOption[]>(() =>
    this.templates().map(t => ({ value: t.id, label: t.name, hint: `${t.widthMm} × ${t.heightMm} mm` }))
  );
  total = computed(() => totalLabels(this.items()));
  // La vista previa muestra la primera fila con cantidad > 0, o la primera si no hay ninguna
  previewItem = computed(() => this.items().find(item => item.quantity > 0) ?? this.items()[0] ?? null);

  // La prueba de la impresora usa la misma etiqueta que la vista previa
  printerTestLabel = computed<PrinterTestLabel | null>(() => {
    const template = this.selectedTemplate();
    const item = this.previewItem();
    if (!template || !item) return null;
    return {
      zpl: renderLabel(splitTemplate(template.zpl).label, item.product, item.variant, labelContextFrom(this.settings())),
      previewUrl: this.previewUrl(),
      widthMm: template.widthMm,
      description: `"${template.name}" con ${item.variant.sku}`
    };
  });

  constructor() {
    // La vista previa se actualiza al cambiar la variante que se muestra o los ajustes
    effect(() => {
      this.previewItem()?.variant.id;
      this.settings();
      this.previewRequests.next();
    });

    this.previewRequests
      .pipe(debounceTime(PREVIEW_DEBOUNCE_MS), takeUntilDestroyed())
      .subscribe(() => this.refreshPreview());
  }

  ngOnInit(): void {
    this.loadTemplates();
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

  private loadTemplates(): void {
    this.isLoading.set(true);
    this.labelTemplateService.getTemplates(1, TEMPLATES_LIMIT, { available: 'true' }).subscribe({
      next: (res) => {
        this.templates.set(res.data ?? []);
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
      omitted: items.filter(item => item.quantity === 0).length + this.omitted()
    };
  }

  async print(): Promise<void> {
    const request = this.jobRequest();
    if (!request || this.isBusy()) return;
    this.isBusy.set(true);
    try {
      if (await this.printFlow.print(request)) this.printed.emit();
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
