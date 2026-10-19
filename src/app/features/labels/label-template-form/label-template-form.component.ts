import { Component, DestroyRef, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { debounceTime, forkJoin, map, merge } from 'rxjs';
import Swal from 'sweetalert2';
import { LabelTemplate } from '../../../shared/models/label-template.model';
import { LabelSettings } from '../../../shared/models/label-settings.model';
import { Product } from '../../../shared/models/product.model';
import { SelectOption } from '../../../shared/models/select-option.model';
import { LabelTemplateService } from '../../../core/services/label-template.service';
import { SettingsService } from '../../../core/services/settings.service';
import { AttributeService } from '../../../core/services/attribute.service';
import { ProductService } from '../../../core/services/product.service';
import { LabelaryService } from '../../../core/services/labelary.service';
import { getApiErrorList, getApiErrorMessage } from '../../../shared/utils/api-error';
import { AppValidators } from '../../../shared/utils/app-validators';
import { SearchSelectComponent } from '../../../shared/components/search-select/search-select.component';
import {
  LABEL_PLACEHOLDER_HELP,
  LabelContext,
  LabelPrintItem,
  attributePlaceholderNames,
  invalidPlaceholders,
  renderLabel,
  sampleLabelItem,
  sizeFromZpl,
  splitTemplate,
  templateWarnings
} from '../../../shared/utils/zpl';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

const MAX_SIZE_MM = 220;
// Espera tras dejar de escribir antes de pedir la vista previa (Labelary limita la frecuencia)
const PREVIEW_DEBOUNCE_MS = 1200;
const CATALOG_LIMIT = 100;

const sizeValidators = [Validators.required, Validators.min(0.01), Validators.max(MAX_SIZE_MM), AppValidators.maxDecimals(2)];

// Alta y edición de una plantilla de etiqueta, con vista previa en Labelary (US-L3)
@Component({
  selector: 'app-label-template-form',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, SearchSelectComponent],
  templateUrl: './label-template-form.component.html',
  styleUrls: ['./label-template-form.component.css']
})
export class LabelTemplateFormComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly labelTemplateService = inject(LabelTemplateService);
  private readonly settingsService = inject(SettingsService);
  private readonly attributeService = inject(AttributeService);
  private readonly productService = inject(ProductService);
  private readonly labelary = inject(LabelaryService);

  @ViewChild('zplInput') private zplInput?: ElementRef<HTMLTextAreaElement>;

  readonly placeholderHelp = LABEL_PLACEHOLDER_HELP;

  template = signal<LabelTemplate | null>(null);
  settings = signal<LabelSettings | null>(null);
  attributeNames = signal<string[]>([]);
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  notFound = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  // Un 400 de la plantilla puede traer varios problemas de marcadores
  errorList = signal<string[]>([]);

  isEditMode = computed(() => this.template() !== null);
  dpi = computed(() => this.settings()?.printerDpi ?? 203);

  templateForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(80)]],
    description: ['', Validators.maxLength(200)],
    widthMm: [null as number | null, sizeValidators],
    heightMm: [null as number | null, sizeValidators],
    zpl: ['', Validators.required]
  });

  // Valor completo del formulario: un objeto nuevo en cada cambio, para que los computed se recalculen
  // aunque un campo repita su valor anterior
  private readonly formValue = toSignal(
    this.templateForm.valueChanges.pipe(map(() => this.templateForm.getRawValue())),
    { initialValue: this.templateForm.getRawValue() }
  );

  // --- AVISOS EN VIVO ---

  // Errores que la API rechazará al guardar
  zplErrors = computed<string[]>(() => {
    const zpl = this.formValue().zpl;
    if (!zpl.trim()) return [];
    const errors: string[] = [];

    const upper = zpl.toUpperCase();
    if (!upper.includes('^XA') || upper.lastIndexOf('^XZ') < upper.lastIndexOf('^XA')) {
      errors.push('Falta la etiqueta: el ZPL debe tener un bloque ^XA … ^XZ.');
    }
    const invalid = invalidPlaceholders(zpl);
    if (invalid.length > 0) {
      errors.push(`Marcadores no válidos: ${invalid.join(', ')}. Usa los del panel de marcadores.`);
    }
    const known = new Set(this.attributeNames());
    const missing = attributePlaceholderNames(zpl).filter(name => !known.has(name));
    if (missing.length > 0 && known.size > 0) {
      errors.push(`No existe el atributo: ${missing.join(', ')}. Revisa el nombre (mayúsculas y espacios incluidos).`);
    }
    return errors;
  });

  // Advertencias que no impiden guardar
  zplWarnings = computed<string[]>(() => {
    const { zpl, widthMm, heightMm } = this.formValue();
    if (!zpl.trim()) return [];
    return templateWarnings(zpl, widthMm, heightMm, this.dpi());
  });

  // Tamaño que propone el ZPL (^PW/^LL) si no coincide con el del formulario
  sizeSuggestion = computed(() => {
    const { zpl, widthMm, heightMm } = this.formValue();
    const suggested = sizeFromZpl(zpl, this.dpi());
    if (!suggested) return null;
    return suggested.widthMm === Number(widthMm) && suggested.heightMm === Number(heightMm) ? null : suggested;
  });

  // --- VISTA PREVIA ---

  previewSource = new FormControl<'sample' | 'product'>('sample', { nonNullable: true });
  autoPreview = new FormControl<boolean>(true, { nonNullable: true });
  productControl = new FormControl<number | null>(null);
  variantControl = new FormControl<number | null>(null);

  products = signal<Product[]>([]);
  previewProduct = signal<Product | null>(null);
  isRefreshingProducts = signal<boolean>(false);
  previewUrl = signal<string | null>(null);
  previewError = signal<string | null>(null);
  isPreviewing = signal<boolean>(false);

  productOptions = computed<SelectOption[]>(() =>
    this.products().map(p => ({ value: p.id, label: p.name, hint: p.skuPrefix }))
  );
  variantOptions = computed<SelectOption[]>(() =>
    (this.previewProduct()?.variants ?? [])
      .filter(v => v.available)
      .map(v => ({ value: v.id, label: v.displayName, hint: v.sku }))
  );

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    const id = idParam ? Number(idParam) : null;
    this.load(id);

    // Vista previa automática al dejar de escribir
    merge(this.templateForm.valueChanges, this.variantControl.valueChanges, this.previewSource.valueChanges)
      .pipe(debounceTime(PREVIEW_DEBOUNCE_MS), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.autoPreview.value) this.refreshPreview();
      });

    // Plantilla nueva: el tamaño se toma del ZPL mientras el usuario no lo haya escrito
    this.templateForm.controls.zpl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(zpl => {
        if (this.isEditMode()) return;
        const { widthMm, heightMm } = this.templateForm.controls;
        if (widthMm.dirty || heightMm.dirty) return;
        const suggested = sizeFromZpl(zpl, this.dpi());
        if (suggested) {
          widthMm.setValue(suggested.widthMm);
          heightMm.setValue(suggested.heightMm);
        }
      });
  }

  ngOnDestroy(): void {
    this.revokePreview();
  }

  private load(id: number | null): void {
    this.isLoading.set(true);

    forkJoin({
      settings: this.settingsService.getLabelSettings(),
      attributes: this.attributeService.getAttributes(1, CATALOG_LIMIT, 'all')
    }).subscribe({
      next: ({ settings, attributes }) => {
        this.settings.set(settings);
        this.attributeNames.set((attributes.data ?? []).map(a => a.name));
        if (id === null) {
          this.isLoading.set(false);
          return;
        }
        this.labelTemplateService.getTemplateById(id).subscribe({
          next: (template) => {
            this.applyTemplate(template);
            this.isLoading.set(false);
            this.refreshPreview();
          },
          error: (err) => {
            if (err.status === 404) this.notFound.set(true);
            else this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar la plantilla.'));
            this.isLoading.set(false);
          }
        });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar la configuración de etiquetas.'));
        this.isLoading.set(false);
      }
    });
  }

  private applyTemplate(template: LabelTemplate): void {
    this.template.set(template);
    this.templateForm.reset({
      name: template.name,
      description: template.description ?? '',
      widthMm: template.widthMm,
      heightMm: template.heightMm,
      zpl: template.zpl
    });
  }

  isInvalid(field: keyof typeof this.templateForm.controls): boolean {
    const control = this.templateForm.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  applySizeSuggestion(): void {
    const suggested = this.sizeSuggestion();
    if (!suggested) return;
    this.templateForm.patchValue({ widthMm: suggested.widthMm, heightMm: suggested.heightMm });
    this.templateForm.controls.widthMm.markAsDirty();
    this.templateForm.controls.heightMm.markAsDirty();
  }

  // Inserta un marcador donde está el cursor del ZPL
  insertPlaceholder(placeholder: string): void {
    const control = this.templateForm.controls.zpl;
    const textarea = this.zplInput?.nativeElement;
    const value = control.value;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;

    control.setValue(value.slice(0, start) + placeholder + value.slice(end));
    control.markAsDirty();

    setTimeout(() => {
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
    });
  }

  // --- VISTA PREVIA ---

  loadProducts(): void {
    if (this.isRefreshingProducts()) return;
    this.isRefreshingProducts.set(true);
    this.productService.getProducts(1, CATALOG_LIMIT, { available: 'true' }).subscribe({
      next: (res) => {
        this.products.set(res.data ?? []);
        this.isRefreshingProducts.set(false);
      },
      error: () => this.isRefreshingProducts.set(false)
    });
  }

  onProductSelected(id: number): void {
    this.variantControl.setValue(null);
    this.previewProduct.set(null);
    this.productService.getProductById(id).subscribe({
      next: (product) => {
        this.previewProduct.set(product);
        const first = product.variants.find(v => v.available);
        if (first) this.variantControl.setValue(first.id);
      },
      error: (err) => this.previewError.set(getApiErrorMessage(err, 'Error al cargar el producto.'))
    });
  }

  private previewItem(): { item: LabelPrintItem; context: LabelContext } | null {
    const settings = this.settings();
    const storeName = settings?.storeName ?? '';
    if (this.previewSource.value === 'sample') return sampleLabelItem(this.templateForm.controls.zpl.value, storeName);

    const product = this.previewProduct();
    const variant = product?.variants.find(v => v.id === this.variantControl.value);
    if (!product || !variant) return null;

    // Los atributos de talla inactivos se ignoran al imprimir
    const active = new Set(settings?.sizeAttributes.filter(a => a.available).map(a => a.id) ?? []);
    const sizeAttributeIds = (settings?.sizeAttributeIds ?? []).filter(id => active.has(id));
    return { item: { product, variant, quantity: 1 }, context: { storeName, sizeAttributeIds } };
  }

  async refreshPreview(): Promise<void> {
    const { zpl, widthMm, heightMm } = this.templateForm.getRawValue();
    if (!zpl.trim() || !(Number(widthMm) > 0) || !(Number(heightMm) > 0)) return;

    const source = this.previewItem();
    if (!source) {
      this.previewError.set('Elige un producto y una variante para la vista previa.');
      return;
    }

    // Solo la etiqueta: el bloque de configuración se dibujaría como una etiqueta en blanco
    const label = renderLabel(splitTemplate(zpl).label, source.item.product, source.item.variant, source.context);

    this.isPreviewing.set(true);
    this.previewError.set(null);
    try {
      const url = await this.labelary.preview(label, Number(widthMm), Number(heightMm), this.dpi());
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

  // Ancho de la imagen en pantalla: 4 px por mm, como mucho el ancho del panel
  previewWidthPx(): number {
    return Math.round(Number(this.templateForm.controls.widthMm.value ?? 0) * 4);
  }

  // --- GUARDADO ---

  canSave(): boolean {
    return !this.isSaving() && this.zplErrors().length === 0 && (!this.isEditMode() || this.templateForm.dirty);
  }

  saveTemplate(): void {
    this.templateForm.markAllAsTouched();
    if (this.templateForm.invalid || this.zplErrors().length > 0) return;

    const { name, description, widthMm, heightMm, zpl } = this.templateForm.getRawValue();
    const data = {
      name: name.trim(),
      description: description.trim() || null,
      widthMm: Number(widthMm),
      heightMm: Number(heightMm),
      zpl
    };

    this.isSaving.set(true);
    this.errorMessage.set(null);
    this.errorList.set([]);

    const current = this.template();
    const request = current
      ? this.labelTemplateService.updateTemplate(current.id, data)
      : this.labelTemplateService.createTemplate(data);

    request.subscribe({
      next: (template) => {
        this.isSaving.set(false);
        if (current) {
          this.applyTemplate(template);
          toast.fire({ icon: 'success', title: 'Plantilla actualizada' });
        } else {
          toast.fire({ icon: 'success', title: `Plantilla "${template.name}" creada` });
          this.router.navigate(['/labels/templates', template.id, 'edit'], { replaceUrl: true });
        }
      },
      error: (err) => {
        const problems = getApiErrorList(err, current ? 'Error al actualizar la plantilla.' : 'Error al crear la plantilla.');
        if (problems.length > 1) this.errorList.set(problems);
        else this.errorMessage.set(problems[0]);
        this.isSaving.set(false);
      }
    });
  }

  async toggleAvailability(): Promise<void> {
    const current = this.template();
    if (!current) return;

    if (current.available) {
      const result = await Swal.fire({
        theme: 'dark',
        icon: 'warning',
        title: '¿Eliminar plantilla?',
        text: `La plantilla "${current.name}" quedará inhabilitada y ya no se podrá elegir al imprimir.`,
        showCancelButton: true,
        confirmButtonText: 'Sí, eliminar',
        cancelButtonText: 'Cancelar',
        confirmButtonColor: '#dc3545'
      });
      if (!result.isConfirmed) return;
    }

    const request = current.available
      ? this.labelTemplateService.deleteTemplate(current.id)
      : this.labelTemplateService.updateTemplate(current.id, { available: true });

    this.isSaving.set(true);
    request.subscribe({
      next: (template) => {
        this.isSaving.set(false);
        this.template.set(template);
        toast.fire({ icon: 'success', title: template.available ? 'Plantilla habilitada' : 'Plantilla eliminada' });
      },
      error: (err) => {
        this.isSaving.set(false);
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cambiar el estado de la plantilla.'));
      }
    });
  }
}
