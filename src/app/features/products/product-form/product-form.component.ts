import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import { PRODUCT_STATUS_OPTIONS, Product } from '../../../shared/models/product.model';
import { Attribute } from '../../../shared/models/attribute.model';
import { ODOO_COLORS, PosCategory } from '../../../shared/models/pos-category.model';
import { ImageChange, isImageBlocking, toUploadIdField } from '../../../shared/models/upload.model';
import { SelectOption } from '../../../shared/models/select-option.model';
import { ProductService } from '../../../core/services/product.service';
import { AttributeService } from '../../../core/services/attribute.service';
import { PosCategoryService } from '../../../core/services/pos-category.service';
import { getApiErrorMessage } from '../../../shared/utils/api-error';
import { AppValidators } from '../../../shared/utils/app-validators';
import { ImageUploadComponent } from '../../../shared/components/image-upload/image-upload.component';
import { MultiSearchSelectComponent } from '../../../shared/components/multi-search-select/multi-search-select.component';
import {
  AttributeLineGroup,
  ProductAttributeLinesComponent,
  createAttributeLineGroup,
  toAttributeLineRequests
} from './product-attribute-lines/product-attribute-lines.component';
import { ProductVariantsComponent } from './product-variants/product-variants.component';
import { ProductOdooActionsService } from '../product-odoo-actions.service';
import { ProductLabelsComponent } from './product-labels/product-labels.component';

type FormTab = 'general' | 'attributes' | 'variants' | 'labels';

// Letras, números y guiones; sin guion al inicio ni al final (el guion separa las partes del SKU)
const SKU_PREFIX_PATTERN = /^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$/;

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    NgTemplateOutlet,
    RouterLink,
    NgbDropdownModule,
    ImageUploadComponent,
    MultiSearchSelectComponent,
    ProductAttributeLinesComponent,
    ProductVariantsComponent,
    ProductLabelsComponent
  ],
  templateUrl: './product-form.component.html',
  styleUrls: ['./product-form.component.css']
})
export class ProductFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly productService = inject(ProductService);
  private readonly attributeService = inject(AttributeService);
  private readonly posCategoryService = inject(PosCategoryService);
  readonly odooActions = inject(ProductOdooActionsService);

  private readonly CATALOG_LIMIT = 100;

  // Estado de la vista
  product = signal<Product | null>(null);
  // Acción de Odoo en curso (exportar, sincronizar o quitar sincronización)
  isOdooBusy = signal<boolean>(false);
  isEditMode = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  notFound = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  activeTab = signal<FormTab>('general');
  // La pestaña de etiquetas se monta la primera vez que se abre (pide plantillas y vista previa)
  labelsTabVisited = signal<boolean>(false);
  // Solo hay etiquetas que imprimir si el producto tiene variantes activas (RF-26)
  hasActiveVariants = computed(() => !!this.product()?.variants.some(v => v.available));

  // Catálogos
  attributes = signal<Attribute[]>([]);
  categories = signal<PosCategory[]>([]);
  isRefreshingAttributes = signal<boolean>(false);
  // Total de atributos habilitados según la API: si supera CATALOG_LIMIT, no todos se cargaron
  attributesTotal = signal<number>(0);
  isRefreshingCategories = signal<boolean>(false);

  // Imagen principal: estado de la subida en curso (si la hay)
  mainImageChange = signal<ImageChange>({ status: 'unchanged' });

  productForm = this.fb.nonNullable.group(
    {
      name: ['', [Validators.required, Validators.minLength(2)]],
      skuPrefix: ['', [Validators.required, Validators.pattern(SKU_PREFIX_PATTERN)]],
      costPrice: [0, [Validators.required, Validators.min(0), AppValidators.maxDecimals(2)]],
      salePrice: [0, [Validators.required, Validators.min(0), AppValidators.maxDecimals(2)]],
      description: [''],
      posCategoryIds: [[] as number[]]
    },
    // El costo debe ser menor que el precio de venta
    { validators: AppValidators.lessThan('costPrice', 'salePrice') }
  );

  attributeLines = new FormArray<AttributeLineGroup>([]);

  status = computed(() => {
    const product = this.product();
    return product ? PRODUCT_STATUS_OPTIONS.find(o => o.value === product.status) : undefined;
  });

  categoryOptions = computed<SelectOption[]>(() => {
    const byId = new Map(this.categories().map(c => [c.id, c]));
    return this.categories()
      .map(c => {
        const parent = c.parentId !== null ? byId.get(c.parentId) : undefined;
        return {
          value: c.id,
          label: parent ? `${parent.name} / ${c.name}` : c.name,
          colorHex: ODOO_COLORS[c.color]?.hex ?? null
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  ngOnInit(): void {
    this.loadCatalogs();

    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === null) return;

    this.isEditMode.set(true);
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      this.notFound.set(true);
      return;
    }
    const fragment = this.route.snapshot.fragment;
    if (fragment === 'variants' || fragment === 'labels') {
      this.setTab(fragment);
    }
    this.loadProduct(id);
  }

  private loadCatalogs(): void {
    this.loadAttributes();
    this.loadCategories();
  }

  /**
   * Los catálogos se recargan cada vez que se abre su select, para traer lo creado en otra
   * pestaña sin recargar la página ni perder el formulario. Si ya hay una carga en curso, se reutiliza.
   */
  loadAttributes(): void {
    if (this.isRefreshingAttributes()) return;
    this.isRefreshingAttributes.set(true);
    this.attributeService.getAttributes(1, this.CATALOG_LIMIT, 'true').subscribe({
      next: (res) => {
        this.attributes.set(res.data ?? []);
        this.attributesTotal.set(res.total);
        this.isRefreshingAttributes.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar los atributos.'));
        this.isRefreshingAttributes.set(false);
      }
    });
  }

  loadCategories(): void {
    if (this.isRefreshingCategories()) return;
    this.isRefreshingCategories.set(true);
    this.posCategoryService.getCategories(1, this.CATALOG_LIMIT, 'true').subscribe({
      next: (res) => {
        this.categories.set(res.data ?? []);
        this.isRefreshingCategories.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar las categorías POS.'));
        this.isRefreshingCategories.set(false);
      }
    });
  }

  private loadProduct(id: number): void {
    this.isLoading.set(true);

    this.productService.getProductById(id).subscribe({
      next: (product) => {
        this.applyProduct(product);
        this.isLoading.set(false);
      },
      error: (err) => {
        if (err.status === 404) {
          this.notFound.set(true);
        } else {
          this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar el producto.'));
        }
        this.isLoading.set(false);
      }
    });
  }

  /**
   * Muestra el producto recibido. Si el formulario tiene cambios sin guardar (p. ej. al guardar
   * existencias desde la otra pestaña), se conservan y solo se actualizan los bloqueos.
   */
  private applyProduct(product: Product): void {
    this.product.set(product);
    const keepEdits = this.productForm.dirty || this.attributeLines.dirty;

    if (!keepEdits) {
      this.productForm.reset({
        name: product.name,
        skuPrefix: product.skuPrefix,
        costPrice: product.costPrice,
        salePrice: product.salePrice,
        description: product.description ?? '',
        posCategoryIds: product.posCategoryIds
      });
      this.attributeLines.clear();
      product.attributeLines.forEach(line =>
        this.attributeLines.push(createAttributeLineGroup(line.attributeId, line.values.map(v => v.id)))
      );
      this.attributeLines.markAsPristine();
    }

    // Con el producto bloqueado el prefijo SKU es inmutable
    const skuPrefix = this.productForm.controls.skuPrefix;
    if (product.isLocked) skuPrefix.disable();
    else skuPrefix.enable();
  }

  // --- VALIDACIÓN PARA LA VISTA ---

  isInvalid(field: keyof typeof this.productForm.controls): boolean {
    const control = this.productForm.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  priceError(field: 'costPrice' | 'salePrice'): string | null {
    const control = this.productForm.controls[field];
    if (!(control.touched || control.dirty)) return null;
    if (control.hasError('required')) return 'El precio es requerido.';
    if (control.hasError('min')) return 'Debe ser mayor o igual a 0.';
    if (control.hasError('maxDecimals')) return 'Máximo 2 decimales (ej. 10.99).';
    return null;
  }

  // El error es del grupo: se muestra en el costo en cuanto se toca cualquiera de los dos precios
  isCostNotLessThanSale(): boolean {
    const { costPrice, salePrice } = this.productForm.controls;
    const touched = costPrice.touched || costPrice.dirty || salePrice.touched || salePrice.dirty;
    return this.productForm.hasError('lessThan') && touched;
  }

  // Errores de la pestaña General, para marcarla cuando se intenta guardar desde otra
  hasGeneralErrors(): boolean {
    const { costPrice, salePrice, description, posCategoryIds } = this.productForm.controls;
    return [costPrice, salePrice, description, posCategoryIds].some(c => c.invalid && c.touched)
      || this.isCostNotLessThanSale();
  }

  hasAttributeErrors(): boolean {
    return this.attributeLines.invalid && this.attributeLines.dirty;
  }

  hasChanges(): boolean {
    return this.productForm.dirty || this.attributeLines.dirty || this.mainImageChange().status !== 'unchanged';
  }

  isImageBlocking(): boolean {
    return isImageBlocking(this.mainImageChange());
  }

  canSave(): boolean {
    return !this.isSaving() && !this.isImageBlocking() && (!this.isEditMode() || this.hasChanges());
  }

  // --- GUARDADO ---

  saveProduct(): void {
    this.productForm.markAllAsTouched();
    this.attributeLines.markAsDirty();
    if (this.productForm.invalid || this.attributeLines.invalid || !this.canSave()) return;

    if (this.isEditMode()) {
      this.updateProduct();
    } else {
      this.createProduct();
    }
  }

  private createProduct(): void {
    const { name, skuPrefix, costPrice, salePrice, description, posCategoryIds } = this.productForm.getRawValue();
    const mainImageUploadId = toUploadIdField(this.mainImageChange());

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.productService.createProduct({
      name: name.trim(),
      skuPrefix: skuPrefix.trim().toUpperCase(),
      costPrice: Number(costPrice),
      salePrice: Number(salePrice),
      description: description.trim() || null,
      posCategoryIds,
      attributeLines: toAttributeLineRequests(this.attributeLines),
      ...(mainImageUploadId ? { mainImageUploadId } : {})
    }).subscribe({
      next: (product) => {
        this.isSaving.set(false);
        toast.fire({ icon: 'success', title: `Producto "${product.name}" creado` });
        // Se abre en edición, en la pestaña de variantes recién generadas
        this.router.navigate(['/products', product.id, 'edit'], { replaceUrl: true, fragment: 'variants' });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al crear el producto.'));
        this.isSaving.set(false);
      }
    });
  }

  private updateProduct(): void {
    const product = this.product();
    if (!product) return;

    const { name, skuPrefix, costPrice, salePrice, description, posCategoryIds } = this.productForm.getRawValue();
    const mainImageUploadId = toUploadIdField(this.mainImageChange());
    const skuPrefixControl = this.productForm.controls.skuPrefix;

    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.productService.updateProduct(product.id, {
      name: name.trim(),
      ...(skuPrefixControl.enabled ? { skuPrefix: skuPrefix.trim().toUpperCase() } : {}),
      costPrice: Number(costPrice),
      salePrice: Number(salePrice),
      description: description.trim() || null,
      posCategoryIds,
      // La matriz solo se envía si cambió, para no regenerar variantes sin necesidad
      ...(this.attributeLines.dirty ? { attributeLines: toAttributeLineRequests(this.attributeLines) } : {}),
      ...(mainImageUploadId !== undefined ? { mainImageUploadId } : {})
    }).subscribe({
      next: (updated) => {
        this.productForm.markAsPristine();
        this.attributeLines.markAsPristine();
        this.mainImageChange.set({ status: 'unchanged' });
        this.applyProduct(updated);
        this.isSaving.set(false);
        toast.fire({ icon: 'success', title: 'Producto actualizado' });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al actualizar el producto.'));
        this.isSaving.set(false);
      }
    });
  }

  setTab(tab: FormTab): void {
    this.activeTab.set(tab);
    if (tab === 'labels') this.labelsTabVisited.set(true);
  }

  // --- ACCIONES DE ODOO (US-F5) ---

  async runOdooAction(action: 'export' | 'sync' | 'unsync'): Promise<void> {
    const product = this.product();
    if (!product || this.isOdooBusy()) return;

    // La exportación y la sincronización usan los datos guardados, no los del formulario
    if (this.hasChanges()) {
      const confirm = await Swal.fire({
        theme: 'dark',
        icon: 'warning',
        title: 'Hay cambios sin guardar',
        text: 'La acción usará los datos guardados del producto, sin los cambios del formulario. ¿Continuar?',
        showCancelButton: true,
        confirmButtonText: 'Continuar',
        cancelButtonText: 'Cancelar'
      });
      if (!confirm.isConfirmed) return;
    }

    this.isOdooBusy.set(true);
    try {
      const changed = action === 'export'
        ? await this.odooActions.exportProduct(product)
        : action === 'sync'
          ? await this.odooActions.syncProduct(product)
          : await this.odooActions.unsyncProduct(product);
      if (changed) this.reloadProduct();
    } finally {
      this.isOdooBusy.set(false);
    }
  }

  // Tras guardar existencias se recarga: el stock puede cambiar el estado y los bloqueos
  onVariantsSaved(): void {
    this.reloadProduct();
  }

  private reloadProduct(): void {
    const product = this.product();
    if (!product) return;

    this.productService.getProductById(product.id).subscribe({
      next: (updated) => this.applyProduct(updated),
      error: (err) => this.errorMessage.set(getApiErrorMessage(err, 'Error al recargar el producto.'))
    });
  }
}
