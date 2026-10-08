import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { NgbDropdownModule, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import Swal from 'sweetalert2';
import {
  Attribute,
  DISPLAY_TYPE_OPTIONS,
  DisplayType,
  VARIANT_CREATION_OPTIONS,
  VariantCreation
} from '../../shared/models/attribute.model';
import { AttributeService } from '../../core/services/attribute.service';
import { getApiErrorMessage } from '../../shared/utils/api-error';

type StatusFilter = 'all' | 'active' | 'inactive';

@Component({
  selector: 'app-attributes',
  standalone: true,
  imports: [RouterLink, NgbDropdownModule, NgbPaginationModule],
  templateUrl: './attributes.component.html',
  styleUrls: ['./attributes.component.css']
})
export class AttributesComponent implements OnInit {
  private readonly attributeService = inject(AttributeService);
  private readonly router = inject(Router);

  // Cantidad de valores que se muestran como chips antes de resumir con "+N"
  readonly VALUES_PREVIEW = 5;

  // Estados Reactivos con Signals
  attributes = signal<Attribute[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Paginación
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  totalRecords = signal<number>(0);

  // Filtro de estado (parámetro `available` de la API)
  statusFilter = signal<StatusFilter>('all');

  ngOnInit(): void {
    this.loadAttributes();
  }

  loadAttributes(page: number = this.currentPage()): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const available = { all: 'all', active: 'true', inactive: 'false' } as const;

    this.attributeService.getAttributes(page, this.pageSize(), available[this.statusFilter()]).subscribe({
      next: (res) => {
        this.attributes.set(res.data ?? []);
        this.currentPage.set(res.page);
        this.totalRecords.set(res.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar atributos.'));
        this.isLoading.set(false);
      }
    });
  }

  onPageChange(newPage: number): void {
    this.currentPage.set(newPage);
    this.loadAttributes(newPage);
  }

  setStatusFilter(status: StatusFilter): void {
    this.statusFilter.set(status);
    this.loadAttributes(1);
  }

  getDisplayTypeLabel(type: DisplayType): string {
    return DISPLAY_TYPE_OPTIONS.find(o => o.value === type)?.label ?? type;
  }

  getVariantCreationLabel(mode: VariantCreation): string {
    return VARIANT_CREATION_OPTIONS.find(o => o.value === mode)?.label ?? mode;
  }

  goToEdit(attribute: Attribute, fragment?: string): void {
    this.router.navigate(['/attributes', attribute.id, 'edit'], fragment ? { fragment } : {});
  }

  async deleteAttribute(attribute: Attribute): Promise<void> {
    const result = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: '¿Eliminar atributo?',
      text: `El atributo "${attribute.name}" quedará inhabilitado.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (!result.isConfirmed) return;

    this.isLoading.set(true);
    this.attributeService.deleteAttribute(attribute.id).subscribe({
      next: () => this.loadAttributes(),
      error: (err) => {
        this.isLoading.set(false);
        Swal.fire({
          theme: 'dark',
          icon: 'error',
          title: 'No se pudo eliminar',
          text: getApiErrorMessage(err, 'Error al eliminar atributo.'),
          confirmButtonText: 'Entendido'
        });
      }
    });
  }
}
