import { Component, OnInit, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbDropdownModule, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import Swal from 'sweetalert2';
import { LabelTemplate } from '../../../shared/models/label-template.model';
import { LabelTemplateService } from '../../../core/services/label-template.service';
import { getApiErrorMessage } from '../../../shared/utils/api-error';
import { AvailabilityFilter, toAvailableParam } from '../../../shared/models/list-filter.model';
import { ListFiltersComponent } from '../../../shared/components/list-filters/list-filters.component';
import { SearchInputComponent } from '../../../shared/components/search-input/search-input.component';

const toast = Swal.mixin({
  theme: 'dark',
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true
});

// Listado de plantillas de etiqueta (US-L3)
@Component({
  selector: 'app-label-templates',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, NgbDropdownModule, NgbPaginationModule, ListFiltersComponent, SearchInputComponent],
  templateUrl: './label-templates.component.html',
  styleUrls: ['./label-templates.component.css']
})
export class LabelTemplatesComponent implements OnInit {
  private readonly labelTemplateService = inject(LabelTemplateService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  templates = signal<LabelTemplate[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  totalRecords = signal<number>(0);

  availabilityFilter = signal<AvailabilityFilter>('all');

  // Búsqueda por nombre de la plantilla
  filtersForm = this.fb.nonNullable.group({
    search: ['']
  });

  constructor() {
    this.filtersForm.valueChanges
      .pipe(
        debounceTime(350),
        distinctUntilChanged((a, b) => a.search === b.search),
        takeUntilDestroyed()
      )
      .subscribe(() => this.loadTemplates(1));
  }

  ngOnInit(): void {
    this.loadTemplates();
  }

  loadTemplates(page: number = this.currentPage()): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.labelTemplateService.getTemplates(page, this.pageSize(), {
      available: toAvailableParam(this.availabilityFilter()),
      search: this.filtersForm.controls.search.value
    }).subscribe({
      next: (res) => {
        this.templates.set(res.data ?? []);
        this.currentPage.set(res.page);
        this.totalRecords.set(res.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar las plantillas.'));
        this.isLoading.set(false);
      }
    });
  }

  onPageChange(newPage: number): void {
    this.currentPage.set(newPage);
    this.loadTemplates(newPage);
  }

  setAvailabilityFilter(filter: AvailabilityFilter): void {
    this.availabilityFilter.set(filter);
    this.loadTemplates(1);
  }

  hasExtraFilters(): boolean {
    return !!this.filtersForm.controls.search.value.trim();
  }

  clearFilters(): void {
    this.filtersForm.reset({ search: '' });
  }

  goToEdit(template: LabelTemplate): void {
    this.router.navigate(['/labels/templates', template.id, 'edit']);
  }

  // Soft-delete: la plantilla deja de aparecer al imprimir, pero se puede reactivar
  async deleteTemplate(template: LabelTemplate): Promise<void> {
    const result = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: '¿Eliminar plantilla?',
      text: `La plantilla "${template.name}" quedará inhabilitada y ya no se podrá elegir al imprimir.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (!result.isConfirmed) return;

    this.isLoading.set(true);
    this.labelTemplateService.deleteTemplate(template.id).subscribe({
      next: () => {
        toast.fire({ icon: 'success', title: `Plantilla "${template.name}" eliminada` });
        this.loadTemplates();
      },
      error: (err) => this.showActionError(err, 'No se pudo eliminar', 'Error al eliminar la plantilla.')
    });
  }

  reactivateTemplate(template: LabelTemplate): void {
    this.isLoading.set(true);
    this.labelTemplateService.updateTemplate(template.id, { available: true }).subscribe({
      next: () => {
        toast.fire({ icon: 'success', title: `Plantilla "${template.name}" habilitada` });
        this.loadTemplates();
      },
      error: (err) => this.showActionError(err, 'No se pudo habilitar', 'Error al habilitar la plantilla.')
    });
  }

  private showActionError(err: HttpErrorResponse, title: string, fallback: string): void {
    this.isLoading.set(false);
    Swal.fire({
      theme: 'dark',
      icon: 'error',
      title,
      text: getApiErrorMessage(err, fallback),
      confirmButtonText: 'Entendido'
    });
  }
}
