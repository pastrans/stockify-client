import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { forkJoin, map, startWith } from 'rxjs';
import Swal from 'sweetalert2';
import { SettingsService } from '../../core/services/settings.service';
import { ProductService } from '../../core/services/product.service';
import { ExportLanguage, ExportSettings } from '../../shared/models/export-settings.model';
import { getApiErrorMessage } from '../../shared/utils/api-error';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

// Texto con al menos un carácter que no sea espacio (la API rechaza los textos vacíos)
const NOT_BLANK = /\S/;
// Mismo patrón que la API: un punto lo interpretaría Odoo como separador de módulo
const EXTERNAL_ID_PREFIX = /^[A-Za-z0-9_-]+$/;

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [ReactiveFormsModule, DatePipe],
  templateUrl: './settings.component.html'
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly settingsService = inject(SettingsService);
  private readonly productService = inject(ProductService);

  readonly languageOptions: { value: ExportLanguage; label: string; hint: string }[] = [
    { value: 'en', label: 'Inglés', hint: 'Odoo reconoce estos encabezados en cualquier idioma' },
    { value: 'es', label: 'Español', hint: 'Etiquetas de Odoo en español de Latinoamérica' }
  ];

  settings = signal<ExportSettings | null>(null);
  // Productos sincronizados (activos o no): mientras haya alguno, el prefijo no se puede cambiar
  syncedCount = signal<number>(0);
  isLoading = signal<boolean>(false);
  isSaving = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  isPrefixLocked = computed(() => this.syncedCount() > 0);

  settingsForm: FormGroup = this.fb.nonNullable.group({
    language: ['en' as ExportLanguage, Validators.required],
    maxRowsPerFile: [1000, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
    storeLocation: ['', [Validators.required, Validators.pattern(NOT_BLANK)]],
    warehouseLocation: ['', [Validators.required, Validators.pattern(NOT_BLANK)]],
    linkedPosConfig: ['', [Validators.required, Validators.pattern(NOT_BLANK)]],
    attributeCategory: ['', [Validators.required, Validators.pattern(NOT_BLANK)]],
    externalIdPrefix: ['', [Validators.required, Validators.pattern(EXTERNAL_ID_PREFIX)]]
  });

  // Ejemplo de External ID con el prefijo que se está escribiendo
  private readonly prefixValue = toSignal(
    this.settingsForm.controls['externalIdPrefix'].valueChanges.pipe(
      startWith(this.settingsForm.controls['externalIdPrefix'].value),
      map(value => String(value ?? '').trim())
    ),
    { initialValue: '' }
  );
  externalIdExample = computed(() => `${this.prefixValue() || 'prefijo'}-tmpl-000045`);

  ngOnInit(): void {
    this.loadSettings();
  }

  loadSettings(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    forkJoin({
      settings: this.settingsService.getExportSettings(),
      synced: this.productService.getProducts(1, 1, { status: 'synced' })
    }).subscribe({
      next: ({ settings, synced }) => {
        this.syncedCount.set(synced.total);
        this.applySettings(settings);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar la configuración de exportación.'));
        this.isLoading.set(false);
      }
    });
  }

  private applySettings(settings: ExportSettings): void {
    this.settings.set(settings);
    const { updatedAt, ...values } = settings;
    this.settingsForm.reset(values);

    const prefix = this.settingsForm.controls['externalIdPrefix'];
    if (this.isPrefixLocked()) {
      prefix.disable();
    } else {
      prefix.enable();
    }
  }

  isInvalid(field: string): boolean {
    const control = this.settingsForm.get(field);
    return !!control && control.invalid && (control.touched || control.dirty);
  }

  saveSettings(): void {
    this.settingsForm.markAllAsTouched();
    if (this.settingsForm.invalid) return;

    // getRawValue incluye el prefijo aunque esté deshabilitado: la API acepta reenviar el mismo
    const raw = this.settingsForm.getRawValue();
    this.isSaving.set(true);
    this.errorMessage.set(null);

    this.settingsService.updateExportSettings({
      language: raw.language,
      maxRowsPerFile: Number(raw.maxRowsPerFile),
      storeLocation: raw.storeLocation.trim(),
      warehouseLocation: raw.warehouseLocation.trim(),
      linkedPosConfig: raw.linkedPosConfig.trim(),
      attributeCategory: raw.attributeCategory.trim(),
      externalIdPrefix: raw.externalIdPrefix.trim()
    }).subscribe({
      next: (settings) => {
        this.applySettings(settings);
        this.isSaving.set(false);
        toast.fire({ icon: 'success', title: 'Configuración de exportación guardada' });
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al guardar la configuración de exportación.'));
        this.isSaving.set(false);
      }
    });
  }

  // Descarta los cambios sin guardar
  resetForm(): void {
    const current = this.settings();
    if (current) this.applySettings(current);
  }
}
