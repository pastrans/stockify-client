import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import {
  Attribute,
  AttributeValue,
  AttributeValueRequest,
  DISPLAY_TYPE_OPTIONS,
  DisplayType,
  VARIANT_CREATION_OPTIONS,
  VariantCreation
} from '../../../shared/models/attribute.model';
import { AttributeService } from '../../../core/services/attribute.service';
import { getApiErrorMessage } from '../../../shared/utils/api-error';
import { AppValidators } from '../../../shared/utils/app-validators';
import { SequenceInputComponent } from '../../../shared/components/sequence-input/sequence-input.component';

type ValueField = 'valueName' | 'shortName';

const DEFAULT_COLOR = '#000000';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

@Component({
  selector: 'app-attribute-form',
  standalone: true,
  imports: [ReactiveFormsModule, NgTemplateOutlet, RouterLink, SequenceInputComponent],
  templateUrl: './attribute-form.component.html',
  styleUrls: ['./attribute-form.component.css']
})
export class AttributeFormComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly attributeService = inject(AttributeService);

  readonly displayTypeOptions = DISPLAY_TYPE_OPTIONS;
  readonly variantCreationOptions = VARIANT_CREATION_OPTIONS;
  readonly SHORT_NAME_MAX = 8;

  // Estado de la vista
  attribute = signal<Attribute | null>(null);
  isEditMode = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  notFound = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Valor que tiene una petición en curso: id del valor, 'new' para el alta o null
  busyValue = signal<number | 'new' | null>(null);

  // Metadatos del atributo
  attributeForm: FormGroup = this.fb.group({
    // Odoo usa ',' y ':' como separadores al importar las variantes ("Atributo:Valor, …")
    name: ['', [Validators.required, Validators.minLength(3), AppValidators.noOdooSeparators([',', ':'])]],
    sequence: [0, [Validators.required, Validators.min(0)]],
    displayType: ['select' as DisplayType, Validators.required],
    variantCreation: ['dynamically' as VariantCreation, Validators.required],
    available: [true]
  });

  // Filas de valores. En creación se envían junto al atributo; en edición, cada fila es un valor guardado
  valuesArray: FormArray<FormGroup> = this.fb.array<FormGroup>([]);

  // Fila de alta de valor (solo en edición: se envía al pulsar "Agregar")
  newValueForm: FormGroup = this.createValueGroup();

  private readonly displayType = toSignal(this.attributeForm.controls['displayType'].valueChanges, {
    initialValue: this.attributeForm.controls['displayType'].value as DisplayType
  });
  isColor = computed(() => this.displayType() === 'color');

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');

    if (idParam === null) {
      this.addValueRow();
      return;
    }

    this.isEditMode.set(true);
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      this.notFound.set(true);
      return;
    }
    this.loadAttribute(id);
  }

  private loadAttribute(id: number): void {
    this.isLoading.set(true);

    this.attributeService.getAttributeById(id).subscribe({
      next: (attribute) => {
        this.attribute.set(attribute);
        this.attributeForm.reset({
          name: attribute.name,
          sequence: attribute.sequence,
          displayType: attribute.displayType,
          variantCreation: attribute.variantCreation,
          available: attribute.available
        });
        this.valuesArray.clear();
        attribute.values.forEach(value => this.valuesArray.push(this.createValueGroup(value)));
        this.isLoading.set(false);

        if (this.route.snapshot.fragment === 'values') {
          setTimeout(() => document.getElementById('values')?.scrollIntoView({ behavior: 'smooth' }));
        }
      },
      error: (err) => {
        if (err.status === 404) {
          this.notFound.set(true);
        } else {
          this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar el atributo.'));
        }
        this.isLoading.set(false);
      }
    });
  }

  // --- FILAS DE VALORES ---

  private createValueGroup(value?: AttributeValue): FormGroup {
    return this.fb.group({
      id: [value?.id ?? null],
      hasStoredColor: [!!value?.colorHex],
      valueName: [value?.valueName ?? '', [Validators.required, AppValidators.noOdooSeparators([',', ':'])]],
      shortName: [value?.shortName ?? '', [Validators.required, Validators.maxLength(this.SHORT_NAME_MAX), AppValidators.noOdooSeparators([',', ':'])]],
      colorHex: [value?.colorHex ?? DEFAULT_COLOR, Validators.required]
    });
  }

  addValueRow(): void {
    this.valuesArray.push(this.createValueGroup());
  }

  removeValueRow(index: number): void {
    if (this.valuesArray.length > 1) {
      this.valuesArray.removeAt(index);
    }
  }

  private toValueRequest(group: FormGroup): AttributeValueRequest {
    const { valueName, shortName, colorHex } = group.value;
    return {
      valueName: valueName.trim(),
      shortName: shortName.trim().toUpperCase(),
      ...(this.isColor() ? { colorHex } : {})
    };
  }

  // --- VALIDACIÓN PARA LA VISTA ---

  isInvalid(group: FormGroup, field: string): boolean {
    const control = group.get(field);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  private normalize(value: unknown): string {
    return String(value ?? '').trim().toUpperCase();
  }

  // Índices de filas cuyo nombre o código SKU se repite (shortName es único por atributo)
  private duplicateIndexes(field: ValueField): Set<number> {
    const seen = new Map<string, number>();
    const duplicates = new Set<number>();
    this.valuesArray.controls.forEach((group, index) => {
      const key = this.normalize(group.get(field)?.value);
      if (!key) return;
      if (seen.has(key)) {
        duplicates.add(index);
        duplicates.add(seen.get(key)!);
      } else {
        seen.set(key, index);
      }
    });
    return duplicates;
  }

  isDuplicate(index: number, field: ValueField): boolean {
    return this.duplicateIndexes(field).has(index);
  }

  // Algún valor (guardado, nuevo o de la fila de alta) con "," o ":" en el nombre o en el código SKU
  hasValueSeparatorError(): boolean {
    return [...this.valuesArray.controls, this.newValueForm].some(group =>
      ['valueName', 'shortName'].some(field => group.get(field)?.hasError('odooSeparators'))
    );
  }

  hasDuplicates(): boolean {
    return this.duplicateIndexes('valueName').size > 0 || this.duplicateIndexes('shortName').size > 0;
  }

  // En edición, compara la fila de alta contra los valores ya guardados
  isNewValueDuplicate(field: ValueField): boolean {
    const key = this.normalize(this.newValueForm.get(field)?.value);
    return !!key && this.valuesArray.controls.some(group => this.normalize(group.get(field)?.value) === key);
  }

  // Una fila guardada se puede guardar si cambió, o si el atributo es de color y el valor aún no tiene color
  canSaveRow(group: FormGroup): boolean {
    return group.valid && (group.dirty || (this.isColor() && !group.value.hasStoredColor));
  }

  // --- GUARDADO DEL ATRIBUTO ---

  saveAttribute(): void {
    if (this.isEditMode()) {
      this.updateAttribute();
    } else {
      this.createAttribute();
    }
  }

  private createAttribute(): void {
    this.attributeForm.markAllAsTouched();
    this.valuesArray.markAllAsTouched();
    if (this.attributeForm.invalid || this.valuesArray.invalid || this.hasDuplicates()) return;

    const { name, sequence, displayType, variantCreation } = this.attributeForm.value;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.attributeService.createAttribute({
      name: name.trim(),
      sequence: Number(sequence),
      displayType,
      variantCreation,
      values: this.valuesArray.controls.map((group, index) => ({ ...this.toValueRequest(group), sequence: index }))
    }).subscribe({
      next: (attribute) => {
        this.isSaving.set(false);
        toast.fire({ icon: 'success', title: `Atributo "${attribute.name}" creado` });
        this.router.navigate(['/attributes']);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al crear el atributo.'));
        this.isSaving.set(false);
      }
    });
  }

  private updateAttribute(): void {
    const attribute = this.attribute();
    if (!attribute) return;

    this.attributeForm.markAllAsTouched();
    if (this.attributeForm.invalid) return;

    const { name, sequence, displayType, variantCreation, available } = this.attributeForm.value;
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.attributeService.updateAttribute(attribute.id, {
      name: name.trim(),
      sequence: Number(sequence),
      displayType,
      variantCreation,
      available
    }).subscribe({
      next: (updated) => {
        this.attribute.set({ ...attribute, ...updated, values: attribute.values });
        this.attributeForm.markAsPristine();
        this.isSaving.set(false);
        toast.fire({ icon: 'success', title: 'Atributo actualizado' });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al actualizar el atributo.'));
        // Si la API rechazó la inhabilitación, el switch vuelve al estado guardado
        this.attributeForm.controls['available'].setValue(attribute.available);
        this.isSaving.set(false);
      }
    });
  }

  // --- PETICIONES DE VALORES (solo edición) ---

  addValue(): void {
    const attribute = this.attribute();
    if (!attribute) return;

    this.newValueForm.markAllAsTouched();
    if (this.newValueForm.invalid || this.isNewValueDuplicate('valueName') || this.isNewValueDuplicate('shortName')) return;

    const lastSequence = Math.max(-1, ...attribute.values.map(v => v.sequence));
    this.busyValue.set('new');
    this.errorMessage.set(null);

    this.attributeService.addValue(attribute.id, {
      ...this.toValueRequest(this.newValueForm),
      sequence: lastSequence + 1
    }).subscribe({
      next: (value) => {
        this.attribute.set({ ...attribute, values: [...attribute.values, value] });
        this.valuesArray.push(this.createValueGroup(value));
        this.newValueForm.reset({ valueName: '', shortName: '', colorHex: DEFAULT_COLOR });
        this.busyValue.set(null);
        toast.fire({ icon: 'success', title: `Valor "${value.valueName}" agregado` });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al agregar el valor.'));
        this.busyValue.set(null);
      }
    });
  }

  updateValue(group: FormGroup): void {
    const attribute = this.attribute();
    const valueId: number = group.value.id;
    if (!attribute || !this.canSaveRow(group)) return;

    this.busyValue.set(valueId);
    this.errorMessage.set(null);

    this.attributeService.updateValue(valueId, this.toValueRequest(group)).subscribe({
      next: (value) => {
        this.attribute.set({ ...attribute, values: attribute.values.map(v => (v.id === value.id ? value : v)) });
        group.reset({
          id: value.id,
          hasStoredColor: !!value.colorHex,
          valueName: value.valueName,
          shortName: value.shortName,
          colorHex: value.colorHex ?? DEFAULT_COLOR
        });
        this.busyValue.set(null);
        toast.fire({ icon: 'success', title: `Valor "${value.valueName}" actualizado` });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al actualizar el valor.'));
        this.busyValue.set(null);
      }
    });
  }

  async deleteValue(index: number): Promise<void> {
    const attribute = this.attribute();
    const group = this.valuesArray.at(index);
    if (!attribute || !group) return;

    const { id: valueId, valueName } = group.value;
    const result = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: '¿Eliminar valor?',
      text: `El valor "${valueName}" se eliminará del atributo "${attribute.name}".`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (!result.isConfirmed) return;

    this.busyValue.set(valueId);
    this.errorMessage.set(null);

    this.attributeService.deleteValue(valueId).subscribe({
      next: () => {
        this.attribute.set({ ...attribute, values: attribute.values.filter(v => v.id !== valueId) });
        const currentIndex = this.valuesArray.controls.findIndex(g => g.value.id === valueId);
        if (currentIndex >= 0) this.valuesArray.removeAt(currentIndex);
        this.busyValue.set(null);
        toast.fire({ icon: 'success', title: `Valor "${valueName}" eliminado` });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al eliminar el valor.'));
        this.busyValue.set(null);
      }
    });
  }
}
