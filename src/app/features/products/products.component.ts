import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbDropdownModule, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { debounceTime, distinctUntilChanged } from 'rxjs';
import Swal from 'sweetalert2';
import {
  PRODUCT_STATUS_OPTIONS,
  Product,
  ProductStatus,
  ProductStatusOption
} from '../../shared/models/product.model';
import { ODOO_COLORS, PosCategory } from '../../shared/models/pos-category.model';
import { ProductService } from '../../core/services/product.service';
import { PosCategoryService } from '../../core/services/pos-category.service';
import { getApiErrorMessage } from '../../shared/utils/api-error';
import { ImgFallbackDirective } from '../../shared/directives/img-fallback.directive';

type AvailabilityFilter = 'all' | 'active' | 'inactive';
type ViewMode = 'table' | 'kanban';

interface CategoryOption {
  id: number;
  label: string;
  hex: string | null;
}

const VIEW_STORAGE_KEY = 'stockify.products.view';

@Component({
  selector: 'app-products',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule, DecimalPipe, NgTemplateOutlet, NgbDropdownModule, NgbPaginationModule, ImgFallbackDirective],
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.css']
})
export class ProductsComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly posCategoryService = inject(PosCategoryService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly statusOptions = PRODUCT_STATUS_OPTIONS;
  private readonly CATEGORY_OPTIONS_LIMIT = 100;

  // Estados Reactivos con Signals
  products = signal<Product[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  viewMode = signal<ViewMode>(this.readStoredView());

  // Paginación (12 encaja en las columnas del kanban: 2, 3 o 4 por fila)
  currentPage = signal<number>(1);
  pageSize = signal<number>(12);
  totalRecords = signal<number>(0);

  // Filtro de habilitados (parámetro `available` de la API)
  availabilityFilter = signal<AvailabilityFilter>('all');

  // Filtros extra de productos: búsqueda, estado del ciclo de vida y categoría POS
  filtersForm = this.fb.group({
    search: [''],
    status: [null as ProductStatus | null],
    posCategoryId: [null as number | null]
  });

  // Categorías POS para el filtro y para pintar las etiquetas con su color de Odoo
  categories = signal<PosCategory[]>([]);
  categoryOptions = computed<CategoryOption[]>(() => {
    const byId = new Map(this.categories().map(c => [c.id, c]));
    return this.categories()
      .map(c => {
        const parent = c.parentId !== null ? byId.get(c.parentId) : undefined;
        return {
          id: c.id,
          label: parent ? `${parent.name} / ${c.name}` : c.name,
          hex: ODOO_COLORS[c.color]?.hex ?? null
        };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  });
  private categoryById = computed(() => new Map(this.categoryOptions().map(c => [c.id, c])));

  constructor() {
    this.filtersForm.valueChanges
      .pipe(
        debounceTime(350),
        distinctUntilChanged((a, b) => JSON.stringify(a) === JSON.stringify(b)),
        takeUntilDestroyed()
      )
      .subscribe(() => this.loadProducts(1));
  }

  ngOnInit(): void {
    this.loadProducts();
    this.loadCategories();
  }

  loadProducts(page: number = this.currentPage()): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const available = { all: 'all', active: 'true', inactive: 'false' } as const;
    const { search, status, posCategoryId } = this.filtersForm.getRawValue();

    this.productService.getProducts(page, this.pageSize(), {
      available: available[this.availabilityFilter()],
      search: search ?? '',
      status,
      posCategoryId
    }).subscribe({
      next: (res) => {
        this.products.set(res.data ?? []);
        this.currentPage.set(res.page);
        this.totalRecords.set(res.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar productos.'));
        this.isLoading.set(false);
      }
    });
  }

  private loadCategories(): void {
    this.posCategoryService.getCategories(1, this.CATEGORY_OPTIONS_LIMIT, 'true').subscribe({
      next: (res) => this.categories.set(res.data ?? []),
      error: (err) => this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar categorías POS.'))
    });
  }

  onPageChange(newPage: number): void {
    this.currentPage.set(newPage);
    this.loadProducts(newPage);
  }

  setAvailabilityFilter(filter: AvailabilityFilter): void {
    this.availabilityFilter.set(filter);
    this.loadProducts(1);
  }

  hasExtraFilters(): boolean {
    const { search, status, posCategoryId } = this.filtersForm.getRawValue();
    return !!search?.trim() || status !== null || posCategoryId !== null;
  }

  clearFilters(): void {
    this.filtersForm.reset({ search: '', status: null, posCategoryId: null });
  }

  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, mode);
    } catch {
      // Sin almacenamiento disponible: la vista solo dura esta sesión
    }
  }

  private readStoredView(): ViewMode {
    try {
      return localStorage.getItem(VIEW_STORAGE_KEY) === 'kanban' ? 'kanban' : 'table';
    } catch {
      return 'table';
    }
  }

  // --- DATOS DERIVADOS PARA LA VISTA ---

  getStatusOption(status: ProductStatus): ProductStatusOption | undefined {
    return this.statusOptions.find(o => o.value === status);
  }

  getCategories(product: Product): CategoryOption[] {
    return product.posCategoryIds
      .map(id => this.categoryById().get(id))
      .filter((c): c is CategoryOption => !!c);
  }

  // Imagen principal o, si no tiene, la primera imagen de sus variantes (si no carga, appImgFallback)
  getImageUrl(product: Product): string | null {
    return product.mainImageUrl ?? product.variants.find(v => v.imageUrl)?.imageUrl ?? null;
  }

  getStockStore(product: Product): number {
    return product.variants.reduce((sum, v) => sum + v.stockStore, 0);
  }

  getStockWarehouse(product: Product): number {
    return product.variants.reduce((sum, v) => sum + v.stockWarehouse, 0);
  }

  // --- ACCIONES ---

  goToEdit(product: Product): void {
    this.router.navigate(['/products', product.id, 'edit']);
  }

  async deleteProduct(product: Product): Promise<void> {
    const result = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: '¿Eliminar producto?',
      text: `El producto "${product.name}" y sus variantes quedarán inhabilitados.`,
      showCancelButton: true,
      confirmButtonText: 'Sí, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#dc3545'
    });
    if (!result.isConfirmed) return;

    this.isLoading.set(true);
    this.productService.deleteProduct(product.id).subscribe({
      next: () => this.loadProducts(),
      error: (err) => {
        this.isLoading.set(false);
        Swal.fire({
          theme: 'dark',
          icon: 'error',
          title: 'No se pudo eliminar',
          text: getApiErrorMessage(err, 'Error al eliminar el producto.'),
          confirmButtonText: 'Entendido'
        });
      }
    });
  }
}
