import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AbstractControl, FormArray, FormControl, FormGroup, ReactiveFormsModule, ValidationErrors } from '@angular/forms';
import { Attribute, AttributeValue } from '../../../../shared/models/attribute.model';
import { AttributeLineRequest, Product } from '../../../../shared/models/product.model';
import { SelectOption } from '../../../../shared/models/select-option.model';
import { SearchSelectComponent } from '../../../../shared/components/search-select/search-select.component';
import { MultiSearchSelectComponent } from '../../../../shared/components/multi-search-select/multi-search-select.component';

export type AttributeLineGroup = FormGroup<{
  attributeId: FormControl<number | null>;
  valueIds: FormControl<number[]>;
}>;

// Una línea necesita atributo y al menos un valor (la API rechaza líneas vacías)
const completeLineValidator = (group: AbstractControl): ValidationErrors | null => {
  const { attributeId, valueIds } = group.value;
  return attributeId !== null && valueIds?.length > 0 ? null : { incompleteLine: true };
};

export function createAttributeLineGroup(attributeId: number | null = null, valueIds: number[] = []): AttributeLineGroup {
  return new FormGroup(
    {
      attributeId: new FormControl<number | null>(attributeId),
      valueIds: new FormControl<number[]>(valueIds, { nonNullable: true })
    },
    { validators: completeLineValidator }
  );
}

// El orden de las filas es el orden del atributo en el SKU
export function toAttributeLineRequests(lines: FormArray<AttributeLineGroup>): AttributeLineRequest[] {
  return lines.controls.map((group, index) => ({
    attributeId: group.controls.attributeId.value!,
    valueIds: group.controls.valueIds.value,
    sequence: index
  }));
}

/**
 * Editor de las líneas de atributos del producto (pestaña "Atributos").
 * El FormArray pertenece al formulario padre, que lo envía al guardar.
 */
@Component({
  selector: 'app-product-attribute-lines',
  standalone: true,
  imports: [ReactiveFormsModule, SearchSelectComponent, MultiSearchSelectComponent],
  templateUrl: './product-attribute-lines.component.html'
})
export class ProductAttributeLinesComponent {
  @Input({ required: true }) lines!: FormArray<AttributeLineGroup>;
  // Catálogo de atributos habilitados
  @Input() attributes: Attribute[] = [];
  // Producto guardado (null al crear): define qué está bloqueado
  @Input() product: Product | null = null;
  @Input() skuPrefix = '';
  @Input() refreshing = false;
  // Total de atributos habilitados en la API (puede ser mayor que los cargados en `attributes`)
  @Input() catalogTotal = 0;

  // El catálogo llegó recortado: hay atributos que no aparecen en el selector
  get isCatalogTruncated(): boolean {
    return this.catalogTotal > this.attributes.length;
  }

  // Se emite al abrir un select: el padre recarga el catálogo para traer atributos y valores nuevos
  @Output() refresh = new EventEmitter<void>();

  // --- REGLAS DE BLOQUEO ---

  get isLocked(): boolean {
    return !!this.product?.isLocked;
  }

  get isSynced(): boolean {
    return this.product?.status === 'synced';
  }

  // Con el producto bloqueado no se pueden añadir ni quitar atributos (dimensiones)
  isPersistedLine(group: AttributeLineGroup): boolean {
    const attributeId = group.controls.attributeId.value;
    return !!this.product?.attributeLines.some(l => l.attributeId === attributeId);
  }

  canChangeLine(group: AttributeLineGroup): boolean {
    return !(this.isLocked && this.isPersistedLine(group));
  }

  // Un valor no se puede quitar si alguna variante activa con ese valor tiene existencias
  isValueLocked(valueId: number): boolean {
    return !!this.product?.variants.some(v => v.totalStock > 0 && v.combination.some(c => c.id === valueId));
  }

  // --- CATÁLOGO ---

  private findAttribute(attributeId: number | null): Attribute | undefined {
    return this.attributes.find(a => a.id === attributeId);
  }

  attributeName(attributeId: number | null): string {
    return this.findAttribute(attributeId)?.name
      ?? this.product?.attributeLines.find(l => l.attributeId === attributeId)?.attributeName
      ?? '';
  }

  // Atributos que se pueden elegir en una fila: los que no usa ninguna otra fila
  attributeOptions(group: AttributeLineGroup): SelectOption[] {
    const used = new Set(
      this.lines.controls.filter(g => g !== group).map(g => g.controls.attributeId.value)
    );
    return this.attributes
      .filter(a => !used.has(a.id))
      .map(a => ({ value: a.id, label: a.name }));
  }

  /**
   * Valores habilitados del catálogo más los ya elegidos que hayan dejado de estarlo
   * (siguen en el producto hasta que se quiten). Los que tienen existencias quedan fijos.
   */
  valueOptions(group: AttributeLineGroup): SelectOption[] {
    const attributeId = group.controls.attributeId.value;
    const selected = new Set(group.controls.valueIds.value);
    const catalog = this.findAttribute(attributeId)?.values ?? [];
    const persisted = this.product?.attributeLines.find(l => l.attributeId === attributeId)?.values ?? [];

    const values: AttributeValue[] = catalog.filter(v => v.available || selected.has(v.id));
    persisted
      .filter(v => selected.has(v.id) && !values.some(c => c.id === v.id))
      .forEach(v => values.push(v));

    return values.map(v => {
      const locked = selected.has(v.id) && this.isValueLocked(v.id);
      return {
        value: v.id,
        label: v.valueName,
        hint: v.shortName,
        colorHex: v.colorHex,
        disabled: locked,
        ...(locked ? { disabledReason: 'Tiene existencias: no se puede quitar' } : {})
      };
    });
  }

  // --- ACCIONES ---

  addLine(): void {
    this.lines.push(createAttributeLineGroup());
    this.lines.markAsDirty();
  }

  removeLine(index: number): void {
    this.lines.removeAt(index);
    this.lines.markAsDirty();
  }

  // El control ya tiene el atributo nuevo: se vacían sus valores y se reubica la fila
  onAttributeSelected(index: number, attributeId: number): void {
    const group = this.lines.at(index);
    group.controls.valueIds.setValue([]);

    // Una línea nueva se coloca según la secuencia global del atributo (orden por defecto del SKU)
    const sequence = this.findAttribute(attributeId)?.sequence ?? 0;
    const target = this.lines.controls.findIndex(
      (g, i) => i !== index && (this.findAttribute(g.controls.attributeId.value)?.sequence ?? -1) > sequence
    );
    if (target !== -1 && target < index) {
      this.lines.removeAt(index);
      this.lines.insert(target, group);
    }
    this.lines.markAsDirty();
  }

  moveLine(index: number, direction: -1 | 1): void {
    const target = index + direction;
    if (target < 0 || target >= this.lines.length) return;
    const group = this.lines.at(index);
    this.lines.removeAt(index);
    this.lines.insert(target, group);
    this.lines.markAsDirty();
  }

  // --- VISTA PREVIA DE LA MATRIZ ---

  private completeLines(): AttributeLineGroup[] {
    return this.lines.controls.filter(g => g.valid);
  }

  variantCount(): number {
    const lines = this.completeLines();
    return lines.length === 0 ? 0 : lines.reduce((total, g) => total * g.controls.valueIds.value.length, 1);
  }

  // SKU de la primera combinación, para mostrar el formato resultante
  sampleSku(): string {
    const prefix = (this.skuPrefix || 'PREFIJO').trim().toUpperCase();
    const codes = this.completeLines().map(g => {
      const firstId = g.controls.valueIds.value[0];
      return this.valueOptions(g).find(o => o.value === firstId)?.hint ?? '';
    });
    return [prefix, ...codes].join('-');
  }

  hasIncompleteLines(): boolean {
    return this.lines.controls.some(g => g.invalid);
  }

  canAddLine(): boolean {
    return !this.isLocked && this.lines.length < this.attributes.length;
  }
}
