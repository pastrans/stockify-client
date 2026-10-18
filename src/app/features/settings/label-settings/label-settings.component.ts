import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { forkJoin } from 'rxjs';
import Swal from 'sweetalert2';
import { SettingsService } from '../../../core/services/settings.service';
import { AttributeService } from '../../../core/services/attribute.service';
import { Attribute } from '../../../shared/models/attribute.model';
import { LabelSettings, PRINTER_DPI_OPTIONS, PrinterDpi, SizeAttributeRef } from '../../../shared/models/label-settings.model';
import { SelectOption } from '../../../shared/models/select-option.model';
import { SearchSelectComponent } from '../../../shared/components/search-select/search-select.component';
import { getApiErrorMessage } from '../../../shared/utils/api-error';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

const STORE_NAME_MAX_LENGTH = 60;

// Pestaña "Etiquetas" de Configuración (US-L2)
@Component({
  selector: 'app-label-settings',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe, SearchSelectComponent],
  templateUrl: './label-settings.component.html'
})
export class LabelSettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  private readonly attributeService = inject(AttributeService);

  // Los atributos se cargan todos para el selector de tallas
  private readonly ATTRIBUTES_LIMIT = 100;

  readonly dpiOptions = PRINTER_DPI_OPTIONS;
  readonly storeNameMaxLength = STORE_NAME_MAX_LENGTH;

  settings = signal<LabelSettings | null>(null);
  attributes = signal<Attribute[]>([]);
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  isRefreshingAttributes = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Atributos de talla en orden de prioridad (se editan aparte del formulario: el orden importa)
  sizeAttributeIds = signal<number[]>([]);

  settingsForm = this.fb.nonNullable.group({
    printerDpi: [203 as PrinterDpi, Validators.required],
    storeName: ['', Validators.maxLength(STORE_NAME_MAX_LENGTH)]
  });

  // Selector para agregar un atributo a la lista de tallas
  addSizeControl = new FormControl<number | null>(null);

  // Lista de tallas con su nombre: del catálogo de atributos o, si no está, de la respuesta de la API
  sizeAttributes = computed<SizeAttributeRef[]>(() => {
    const byId = new Map<number, SizeAttributeRef>();
    this.settings()?.sizeAttributes.forEach(a => byId.set(a.id, a));
    this.attributes().forEach(a => byId.set(a.id, { id: a.id, name: a.name, available: a.available }));
    return this.sizeAttributeIds()
      .map(id => byId.get(id))
      .filter((a): a is SizeAttributeRef => !!a);
  });

  // Atributos activos que aún no están en la lista
  addSizeOptions = computed<SelectOption[]>(() => {
    const selected = new Set(this.sizeAttributeIds());
    return this.attributes()
      .filter(a => a.available && !selected.has(a.id))
      .map(a => ({ value: a.id, label: a.name }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      settings: this.settingsService.getLabelSettings(),
      attributes: this.attributeService.getAttributes(1, this.ATTRIBUTES_LIMIT, 'all')
    }).subscribe({
      next: ({ settings, attributes }) => {
        this.attributes.set(attributes.data ?? []);
        this.applySettings(settings);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar la configuración de etiquetas.'));
        this.isLoading.set(false);
      }
    });
  }

  // Recarga los atributos al abrir el selector, para traer los creados en otra pestaña
  refreshAttributes(): void {
    if (this.isRefreshingAttributes()) return;
    this.isRefreshingAttributes.set(true);
    this.attributeService.getAttributes(1, this.ATTRIBUTES_LIMIT, 'all').subscribe({
      next: (res) => {
        this.attributes.set(res.data ?? []);
        this.isRefreshingAttributes.set(false);
      },
      error: () => this.isRefreshingAttributes.set(false)
    });
  }

  private applySettings(settings: LabelSettings): void {
    this.settings.set(settings);
    this.settingsForm.reset({ printerDpi: settings.printerDpi, storeName: settings.storeName });
    this.sizeAttributeIds.set([...settings.sizeAttributeIds]);
  }

  // --- LISTA DE TALLAS ---

  addSizeAttribute(id: number | null): void {
    if (id === null) return;
    this.sizeAttributeIds.update(ids => ids.includes(id) ? ids : [...ids, id]);
    // Se limpia después del ciclo actual para que el selector termine de procesar la selección
    setTimeout(() => this.addSizeControl.setValue(null));
  }

  moveSizeAttribute(index: number, direction: -1 | 1): void {
    const target = index + direction;
    this.sizeAttributeIds.update(ids => {
      if (target < 0 || target >= ids.length) return ids;
      const next = [...ids];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  removeSizeAttribute(id: number): void {
    this.sizeAttributeIds.update(ids => ids.filter(current => current !== id));
  }

  // --- GUARDADO ---

  hasChanges(): boolean {
    const saved = this.settings()?.sizeAttributeIds ?? [];
    const current = this.sizeAttributeIds();
    const sizesChanged = saved.length !== current.length || saved.some((id, i) => id !== current[i]);
    return this.settingsForm.dirty || sizesChanged;
  }

  isInvalid(field: 'storeName'): boolean {
    const control = this.settingsForm.controls[field];
    return control.invalid && (control.touched || control.dirty);
  }

  saveSettings(): void {
    this.settingsForm.markAllAsTouched();
    if (this.settingsForm.invalid) return;

    const { printerDpi, storeName } = this.settingsForm.getRawValue();
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.settingsService.updateLabelSettings({
      printerDpi: Number(printerDpi) as PrinterDpi,
      storeName: storeName.trim(),
      sizeAttributeIds: this.sizeAttributeIds()
    }).subscribe({
      next: (settings) => {
        this.applySettings(settings);
        this.isSaving.set(false);
        toast.fire({ icon: 'success', title: 'Configuración de etiquetas guardada' });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al guardar la configuración de etiquetas.'));
        this.isSaving.set(false);
      }
    });
  }

  resetForm(): void {
    const current = this.settings();
    if (current) this.applySettings(current);
  }
}
