import { Component, OnInit, inject, TemplateRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalModule, NgbModalRef, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { PosCategory, ODOO_COLORS, OdooColor } from '../../shared/models/pos-category.model';
import { PosCategoryService } from '../../core/services/pos-category.service';

@Component({
  selector: 'app-pos-categories',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule, NgbPaginationModule],
  templateUrl: './pos-categories.component.html',
  styleUrls: ['./pos-categories.component.css']
})
export class PosCategoriesComponent implements OnInit {
  private readonly modalService = inject(NgbModal);
  private readonly fb = inject(FormBuilder);
  private readonly posCategoryService = inject(PosCategoryService);

  // El endpoint no permite búsqueda por nombre: se cargan todas para el selector de padre
  private readonly PARENT_OPTIONS_LIMIT = 100;

  readonly odooColors = ODOO_COLORS;

  // Estados Reactivos con Signals
  categories = signal<PosCategory[]>([]);
  allCategories = signal<PosCategory[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Paginación
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  totalRecords = signal<number>(0);

  // Filtros de estado reactivos
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');

  filteredCategories = computed(() => {
    const list = this.categories();
    const filter = this.statusFilter();
    if (filter === 'active') return list.filter(c => c.available);
    if (filter === 'inactive') return list.filter(c => !c.available);
    return list;
  });

  categoryNames = computed(() => {
    const map = new Map<number, string>();
    this.allCategories().forEach(c => map.set(c.id, c.name));
    return map;
  });

  // Modal y Formulario
  isEditMode = false;
  selectedCategory: PosCategory | null = null;
  modalRef: NgbModalRef | null = null;

  // Una categoría no puede ser su propio padre
  parentOptions = computed(() => {
    const selectedId = this.selectedCategoryId();
    return this.allCategories().filter(c => c.id !== selectedId);
  });
  private selectedCategoryId = signal<number | null>(null);

  categoryForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    sequence: [0, [Validators.required, Validators.min(0)]],
    color: [0, Validators.required],
    parentId: [null],
    available: [true]
  });

  ngOnInit(): void {
    this.loadCategories();
    this.loadParentOptions();
  }

  loadCategories(page: number = this.currentPage()): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.posCategoryService.getCategories(page, this.pageSize()).subscribe({
      next: (res) => {
        this.categories.set(res.data ?? []);
        this.currentPage.set(res.page);
        this.totalRecords.set(res.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Error al cargar categorías.');
        this.isLoading.set(false);
      }
    });
  }

  loadParentOptions(): void {
    this.posCategoryService.getCategories(1, this.PARENT_OPTIONS_LIMIT).subscribe({
      next: (res) => this.allCategories.set(res.data ?? []),
      error: (err) => this.errorMessage.set(err.error?.message || 'Error al cargar categorías padre.')
    });
  }

  onPageChange(newPage: number): void {
    this.currentPage.set(newPage);
    this.loadCategories(newPage);
  }

  setStatusFilter(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
  }

  getColor(index: number): OdooColor {
    return this.odooColors[index] ?? this.odooColors[0];
  }

  getParentName(parentId: number | null): string | null {
    if (parentId === null) return null;
    return this.categoryNames().get(parentId) ?? `#${parentId}`;
  }

  selectColor(index: number): void {
    this.categoryForm.patchValue({ color: index });
  }

  openModal(content: TemplateRef<unknown>, category?: PosCategory): void {
    this.isEditMode = !!category;
    this.errorMessage.set(null);

    if (category) {
      this.selectedCategory = category;
      this.selectedCategoryId.set(category.id);
      this.categoryForm.reset({
        name: category.name,
        sequence: category.sequence,
        color: category.color,
        parentId: category.parentId,
        available: category.available
      });
    } else {
      this.selectedCategory = null;
      this.selectedCategoryId.set(null);
      this.categoryForm.reset({
        name: '',
        sequence: 0,
        color: 0,
        parentId: null,
        available: true
      });
    }

    this.modalRef = this.modalService.open(content, { centered: true });
  }

  saveCategory(): void {
    if (this.categoryForm.invalid) {
      this.categoryForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const { name, sequence, color, parentId, available } = this.categoryForm.value;
    const payload = {
      name,
      sequence: Number(sequence),
      color: Number(color),
      parentId: parentId === null ? null : Number(parentId)
    };

    const request$ = this.isEditMode && this.selectedCategory
      ? this.posCategoryService.updateCategory(this.selectedCategory.id, { ...payload, available })
      : this.posCategoryService.createCategory(payload);

    request$.subscribe({
      next: () => {
        this.isLoading.set(false);
        this.modalRef?.close();
        this.loadCategories(this.isEditMode ? this.currentPage() : 1);
        this.loadParentOptions();
      },
      error: (err) => {
        const fallback = this.isEditMode ? 'Error al actualizar categoría.' : 'Error al crear categoría.';
        this.errorMessage.set(err.error?.message || fallback);
        this.isLoading.set(false);
      }
    });
  }

  deleteCategory(category: PosCategory): void {
    if (confirm(`¿Estás seguro de que deseas eliminar la categoría "${category.name}"?`)) {
      this.isLoading.set(true);
      this.posCategoryService.deleteCategory(category.id).subscribe({
        next: () => {
          this.loadCategories();
          this.loadParentOptions();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Error al eliminar categoría.');
          this.isLoading.set(false);
        }
      });
    }
  }
}
