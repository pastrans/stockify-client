import { Component, EventEmitter, Input, Output, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable, concat, last } from 'rxjs';
import Swal from 'sweetalert2';
import { Product, ProductVariant } from '../../../../shared/models/product.model';
import { Attribute, AttributeValue } from '../../../../shared/models/attribute.model';
import { AppliedImage, ImageChange, isImageBlocking, toUploadIdField } from '../../../../shared/models/upload.model';
import { ProductService } from '../../../../core/services/product.service';
import { ImageUploadComponent } from '../../../../shared/components/image-upload/image-upload.component';
import { getApiErrorMessage } from '../../../../shared/utils/api-error';

type VariantRow = FormGroup<{
  stockStore: FormControl<number>;
  stockWarehouse: FormControl<number>;
  barcode: FormControl<string>;
}>;

// Variantes de un mismo color (valor del único atributo de tipo color del producto)
interface ColorGroup {
  value: AttributeValue;
  variants: ProductVariant[];
}

const stockValidators =[Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)];

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

/**
 * Pestaña "Variantes y existencias": conteo Tienda/Bodega, código de barras e imagen por variante.
 * Guarda por su cuenta (PATCH /variants/:id/stock y PUT /variants/:id) y emite `saved`
 * para que el padre recargue el producto, cuyo estado puede cambiar con el stock.
 */
@Component({
  selector: 'app-product-variants',
  standalone: true,
  imports: [ReactiveFormsModule, NgTemplateOutlet, ImageUploadComponent],
  templateUrl: './product-variants.component.html',
  styleUrls: ['./product-variants.component.css']
})
export class ProductVariantsComponent {
  private readonly productService = inject(ProductService);

  @Input({ required: true }) set product(product: Product) {
    this.current = product;
    this.productSig.set(product);
    this.variants.set(product.variants);
    this.rows = new FormArray(product.variants.map(v => this.createRow(v)));
    this.imageChanges.set(new Map());
    this.appliedImages.set(new Map());
    this.colorUploads.clear();
    // Fuerza a recrear las filas para que los selectores de imagen vuelvan a su estado inicial
    this.renderVersion.update(v => v + 1);
  }

  // Catálogo de atributos del formulario: indica cuál de las líneas del producto es de color
  @Input() set attributes(attributes: Attribute[]) {
    this.attributesSig.set(attributes);
  }

  @Output() saved = new EventEmitter<void>();

  private current!: Product;
  private productSig = signal<Product | null>(null);
  private attributesSig = signal<Attribute[]>([]);
  variants = signal<ProductVariant[]>([]);
  rows = new FormArray<VariantRow>([]);
  isSaving = signal<boolean>(false);
  renderVersion = signal<number>(0);
  errorMessage = signal<string | null>(null);

  // Cambios de imagen por id de variante (solo las que se tocaron)
  private imageChanges = signal<ReadonlyMap<number, ImageChange>>(new Map());

  // Fotos de color aplicadas a variantes (por id de variante) y la última aplicada por color
  appliedImages = signal<ReadonlyMap<number, AppliedImage>>(new Map());
  private colorUploads = new Map<number, string>();

  /**
   * "Fotos por color": solo si el producto tiene exactamente un atributo de tipo color
   * y algún color tiene dos o más variantes. Un grupo por cada color con variantes.
   */
  colorGroups = computed<ColorGroup[]>(() => {
    const product = this.productSig();
    if (!product) return [];

    const colorAttributeIds = new Set(this.attributesSig().filter(a => a.displayType === 'color').map(a => a.id));
    const colorLines = product.attributeLines.filter(l => colorAttributeIds.has(l.attributeId));
    if (colorLines.length !== 1) return [];

    const groups = colorLines[0].values
      .map(value => ({
        value,
        variants: product.variants.filter(v => v.combination.some(c => c.id === value.id))
      }))
      .filter(group => group.variants.length > 0);

    return groups.some(group => group.variants.length >= 2) ? groups : [];
  });

  // Un producto sincronizado tiene SKUs y códigos de barras congelados
  get isSynced(): boolean {
    return this.current?.status === 'synced';
  }

  private createRow(variant: ProductVariant): VariantRow {
    const barcode = new FormControl(variant.barcode, { nonNullable: true, validators: Validators.required });
    if (this.isSynced) barcode.disable();

    return new FormGroup({
      stockStore: new FormControl(variant.stockStore, { nonNullable: true, validators: stockValidators }),
      stockWarehouse: new FormControl(variant.stockWarehouse, { nonNullable: true, validators: stockValidators }),
      barcode
    });
  }

  // --- DATOS PARA LA VISTA ---

  combinationLabel(variant: ProductVariant): string {
    return variant.combination.map(c => c.valueName).join(' / ') || 'Variante única';
  }

  totalStore(): number {
    return this.rows.controls.reduce((sum, row) => sum + (Number(row.controls.stockStore.value) || 0), 0);
  }

  totalWarehouse(): number {
    return this.rows.controls.reduce((sum, row) => sum + (Number(row.controls.stockWarehouse.value) || 0), 0);
  }

  isInvalid(row: VariantRow, field: 'stockStore' | 'stockWarehouse' | 'barcode'): boolean {
    const control = row.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  isRowChanged(index: number): boolean {
    const variant = this.variants()[index];
    return this.rows.at(index).dirty || this.imageChanges().has(variant.id);
  }

  // --- IMÁGENES ---

  onImageChange(variant: ProductVariant, change: ImageChange): void {
    this.imageChanges.update(map => {
      const next = new Map(map);
      if (change.status === 'unchanged') next.delete(variant.id);
      else next.set(variant.id, change);
      return next;
    });
  }

  // --- FOTOS POR COLOR ---

  /**
   * Tiene foto propia: la guardada (si no se quitó) o una subida en esta fila. No cuenta la foto
   * aplicada desde su color, que se reemplaza sin preguntar al cambiar la foto del color.
   */
  private hasOwnPhoto(variant: ProductVariant, colorUploadId: string | undefined): boolean {
    const change = this.imageChanges().get(variant.id);
    if (!change) return !!variant.imageUrl;
    if (change.status === 'removed') return false;
    return !(change.status === 'ready' && change.uploadId === colorUploadId);
  }

  async onColorImageChange(group: ColorGroup, change: ImageChange): Promise<void> {
    const previousUploadId = this.colorUploads.get(group.value.id);

    // Se descartó la foto del color: se quita de las variantes que todavía la tienen
    if (change.status === 'unchanged') {
      if (previousUploadId) this.unapplyColorImage(group, previousUploadId);
      this.colorUploads.delete(group.value.id);
      return;
    }
    if (change.status !== 'ready') return;

    const withPhoto = group.variants.filter(v => this.hasOwnPhoto(v, previousUploadId));
    let targets = group.variants.filter(v => !withPhoto.includes(v));

    if (withPhoto.length > 0) {
      const result = await Swal.fire({
        theme: 'dark',
        icon: 'question',
        title: `Foto de "${group.value.valueName}"`,
        text: `${withPhoto.length} de ${group.variants.length} variantes ya tienen foto. ¿Reemplazarlas también?`,
        showDenyButton: true,
        showCancelButton: true,
        confirmButtonText: 'Reemplazar todas',
        denyButtonText: 'Solo las que no tienen',
        cancelButtonText: 'Cancelar'
      });
      if (result.isDismissed) return;
      if (result.isConfirmed) targets = group.variants;
    }

    this.colorUploads.set(group.value.id, change.uploadId);
    this.applyImage(targets, { uploadId: change.uploadId, previewUrl: change.previewUrl ?? null });

    if (targets.length > 0) {
      toast.fire({ icon: 'success', title: `Foto aplicada a ${targets.length} variantes de "${group.value.valueName}"` });
    }
  }

  private applyImage(targets: ProductVariant[], image: AppliedImage): void {
    if (targets.length === 0) return;
    const applied = new Map(this.appliedImages());
    const changes = new Map(this.imageChanges());
    targets.forEach(variant => {
      // Objeto nuevo por variante: la fila lo detecta como cambio aunque se repita el uploadId
      applied.set(variant.id, { ...image });
      changes.set(variant.id, { status: 'ready', uploadId: image.uploadId });
    });
    this.appliedImages.set(applied);
    this.imageChanges.set(changes);
  }

  private unapplyColorImage(group: ColorGroup, uploadId: string): void {
    const applied = new Map(this.appliedImages());
    const changes = new Map(this.imageChanges());
    group.variants.forEach(variant => {
      const change = changes.get(variant.id);
      if (change?.status === 'ready' && change.uploadId === uploadId) {
        changes.delete(variant.id);
        applied.delete(variant.id);
      }
    });
    this.appliedImages.set(applied);
    this.imageChanges.set(changes);
  }

  hasBlockingImage(): boolean {
    return [...this.imageChanges().values()].some(isImageBlocking);
  }

  hasChanges(): boolean {
    return this.rows.dirty || this.imageChanges().size > 0;
  }

  canSave(): boolean {
    return this.hasChanges() && this.rows.valid && !this.hasBlockingImage() && !this.isSaving();
  }

  // --- GUARDADO ---

  save(): void {
    this.rows.markAllAsTouched();
    if (!this.canSave()) return;

    const requests: Observable<unknown>[] = [];
    this.variants().forEach((variant, index) => {
      const row = this.rows.at(index);
      const { stockStore, stockWarehouse } = row.getRawValue();

      if (Number(stockStore) !== variant.stockStore || Number(stockWarehouse) !== variant.stockWarehouse) {
        requests.push(this.productService.updateVariantStock(variant.id, {
          stockStore: Number(stockStore),
          stockWarehouse: Number(stockWarehouse)
        }));
      }

      const barcode = row.controls.barcode.enabled ? row.controls.barcode.value.trim() : variant.barcode;
      const change = this.imageChanges().get(variant.id);
      const imageUploadId = change ? toUploadIdField(change) : undefined;

      if (barcode !== variant.barcode || imageUploadId !== undefined) {
        requests.push(this.productService.updateVariant(variant.id, {
          ...(barcode !== variant.barcode ? { barcode } : {}),
          ...(imageUploadId !== undefined ? { imageUploadId } : {})
        }));
      }
    });

    if (requests.length === 0) {
      this.rows.markAsPristine();
      return;
    }

    this.isSaving.set(true);
    this.errorMessage.set(null);

    // En serie: cada cambio de stock recalcula el estado del producto
    concat(...requests).pipe(last()).subscribe({
      next: () => {
        this.isSaving.set(false);
        toast.fire({ icon: 'success', title: 'Variantes actualizadas' });
        this.saved.emit();
      },
      error: (err) => {
        this.isSaving.set(false);
        // Se conservan los cambios en pantalla para corregir y reintentar; reenviar lo ya guardado es inocuo
        this.errorMessage.set(getApiErrorMessage(err, 'Error al guardar las variantes.'));
      }
    });
  }

  discard(): void {
    this.product = this.current;
  }
}
