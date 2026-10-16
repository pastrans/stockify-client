import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { NgbDropdownModule, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { Observable, catchError, debounceTime, distinctUntilChanged, forkJoin, map, of } from 'rxjs';
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
import { ExportService } from '../../core/services/export.service';
import { ProductOdooActionsService } from './product-odoo-actions.service';
import { getApiErrorMessage } from '../../shared/utils/api-error';
import { showApiErrorAlert } from '../../shared/utils/error-alert';
import { downloadBlob } from '../../shared/utils/download-file';
import { ImgFallbackDirective } from '../../shared/directives/img-fallback.directive';
import { AvailabilityFilter, toAvailableParam } from '../../shared/models/list-filter.model';
import { ListFiltersComponent } from '../../shared/components/list-filters/list-filters.component';
import { SearchInputComponent } from '../../shared/components/search-input/search-input.component';

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
  imports: [
    RouterLink,
    ReactiveFormsModule,
    DatePipe,
    DecimalPipe,
    NgTemplateOutlet,
    NgbDropdownModule,
    NgbPaginationModule,
    ImgFallbackDirective,
    ListFiltersComponent,
    SearchInputComponent
  ],
  templateUrl: './products.component.html',
  styleUrls: ['./products.component.css']
})
export class ProductsComponent implements OnInit {
  private readonly productService = inject(ProductService);
  private readonly posCategoryService = inject(PosCategoryService);
  private readonly exportService = inject(ExportService);
  readonly odooActions = inject(ProductOdooActionsService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly statusOptions = PRODUCT_STATUS_OPTIONS;
  private readonly CATEGORY_OPTIONS_LIMIT = 100;

  // Estados Reactivos con Signals
  products = signal<Product[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  // Generar el .zip puede tardar con muchos productos
  isExporting = signal<boolean>(false);
  isSyncingExport = signal<boolean>(false);
  // Producto con una acción de Odoo en curso (exportar, sincronizar o quitar sincronización)
  busyProductId = signal<number | null>(null);
  // Exportación total pendiente de marcar como sincronizada (US-F4)
  readonly lastExport = this.exportService.lastExport;
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

    const { search, status, posCategoryId } = this.filtersForm.getRawValue();

    this.productService.getProducts(page, this.pageSize(), {
      available: toAvailableParam(this.availabilityFilter()),
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

  // Exportación total: productos activos no sincronizados (US-F3)
  exportToOdoo(): void {
    if (this.isExporting()) return;
    this.isExporting.set(true);

    this.exportService.exportFull().subscribe({
      next: (result) => {
        this.isExporting.set(false);
        downloadBlob(result.blob, result.fileName);
        this.exportService.saveLastExport(result);
        this.showExportNextSteps(result.fileName);
      },
      error: (err) => {
        this.isExporting.set(false);
        showApiErrorAlert(err, 'No se pudo exportar', 'Error al generar la exportación a Odoo.');
      }
    });
  }

  private showExportNextSteps(fileName: string): void {
    const container = document.createElement('div');
    container.className = 'text-start small';

    const downloaded = document.createElement('p');
    downloaded.append('Se descargó ');
    const name = document.createElement('code');
    name.textContent = fileName;
    downloaded.append(name, '.');
    container.appendChild(downloaded);

    const steps = document.createElement('ol');
    steps.className = 'mb-0 ps-3';
    [
      'Importa los archivos en Odoo en orden (1 → 4). Si un archivo viene en partes (-01, -02…), importa todas antes de pasar al siguiente.',
      'Después de importar las Existencias, pulsa "Aplicar todo" en Inventario físico.',
      'Si todo se importó sin errores, vuelve aquí y marca la exportación como sincronizada.'
    ].forEach(text => {
      const item = document.createElement('li');
      item.className = 'mb-1';
      item.textContent = text;
      steps.appendChild(item);
    });
    container.appendChild(steps);

    Swal.fire({
      theme: 'dark',
      icon: 'success',
      title: 'Exportación generada',
      html: container,
      confirmButtonText: 'Entendido',
      showDenyButton: true,
      denyButtonText: 'Ver guía de importación',
      denyButtonColor: '#0dcaf0',
      width: '40rem'
    }).then(result => {
      if (result.isDenied) this.router.navigate(['/odoo-guide']);
    });
  }

  // Marca como sincronizados los productos de la última exportación que no cambiaron después (US-F4)
  async syncLastExport(): Promise<void> {
    const pending = this.lastExport();
    if (!pending || this.isSyncingExport()) return;

    const confirm = await Swal.fire({
      theme: 'dark',
      icon: 'question',
      title: '¿Marcar la exportación como sincronizada?',
      text: '¿Importaste los 4 archivos en Odoo sin errores y aplicaste el inventario ("Aplicar todo")?',
      showCancelButton: true,
      confirmButtonText: 'Sí, marcar como sincronizada',
      cancelButtonText: 'Cancelar'
    });
    if (!confirm.isConfirmed) return;

    this.isSyncingExport.set(true);
    this.productService.syncExported(pending.generatedAt).subscribe({
      next: (result) => {
        this.exportService.clearLastExport();
        this.loadProducts();
        this.loadSkippedProducts(result.skippedIds).subscribe(skipped => {
          this.isSyncingExport.set(false);
          this.showSyncExportResult(result.updatedCount, skipped);
        });
      },
      error: (err) => {
        this.isSyncingExport.set(false);
        showApiErrorAlert(err, 'No se pudo marcar la exportación', 'Error al marcar la exportación como sincronizada.');
      }
    });
  }

  async discardLastExport(): Promise<void> {
    const confirm = await Swal.fire({
      theme: 'dark',
      icon: 'warning',
      title: '¿Descartar la exportación pendiente?',
      text: 'Los productos no se marcarán como sincronizados. Hazlo solo si no vas a importar ese archivo en Odoo.',
      showCancelButton: true,
      confirmButtonText: 'Sí, descartar',
      cancelButtonText: 'Cancelar'
    });
    if (confirm.isConfirmed) this.exportService.clearLastExport();
  }

  // Nombre de cada producto omitido; si no se puede cargar, se muestra solo su id
  private loadSkippedProducts(ids: number[]): Observable<{ id: number; label: string }[]> {
    if (ids.length === 0) return of([]);
    return forkJoin(ids.map(id =>
      this.productService.getProductById(id).pipe(
        map(product => ({ id, label: `${product.name} (${product.skuPrefix})` })),
        catchError(() => of({ id, label: `Producto #${id}` }))
      )
    ));
  }

  private showSyncExportResult(updatedCount: number, skipped: { id: number; label: string }[]): void {
    const container = document.createElement('div');
    container.className = 'text-start small';

    const summary = document.createElement('p');
    summary.textContent = updatedCount === 0
      ? 'No se marcó ningún producto: los de esa exportación ya estaban sincronizados o cambiaron después de exportar.'
      : `Se ${updatedCount === 1 ? 'marcó 1 producto' : `marcaron ${updatedCount} productos`} como sincronizados.`;
    container.appendChild(summary);

    if (skipped.length > 0) {
      const warning = document.createElement('p');
      warning.className = 'text-warning mb-2';
      warning.textContent = skipped.length === 1
        ? 'Este producto cambió después de exportar y no se marcó. Vuelve a exportarlo e impórtalo antes de marcarlo:'
        : `Estos ${skipped.length} productos cambiaron después de exportar y no se marcaron. Vuelve a exportarlos e impórtalos antes de marcarlos:`;
      container.appendChild(warning);

      const list = document.createElement('ul');
      list.className = 'mb-0 ps-3';
      for (const product of skipped) {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = `/products/${product.id}/edit`;
        link.textContent = product.label;
        // Navegación interna sin recargar la aplicación
        link.addEventListener('click', (event) => {
          event.preventDefault();
          Swal.close();
          this.router.navigate(['/products', product.id, 'edit']);
        });
        item.appendChild(link);
        list.appendChild(item);
      }
      container.appendChild(list);
    }

    Swal.fire({
      theme: 'dark',
      icon: skipped.length > 0 ? 'warning' : 'success',
      title: 'Exportación sincronizada',
      html: container,
      confirmButtonText: 'Entendido',
      width: '40rem'
    });
  }

  // Acciones de Odoo de un producto desde el menú de opciones (US-F5)
  async runOdooAction(product: Product, action: 'export' | 'sync' | 'unsync'): Promise<void> {
    if (this.busyProductId() !== null) return;
    this.busyProductId.set(product.id);
    try {
      const changed = action === 'export'
        ? await this.odooActions.exportProduct(product)
        : action === 'sync'
          ? await this.odooActions.syncProduct(product)
          : await this.odooActions.unsyncProduct(product);
      if (changed) this.loadProducts();
    } finally {
      this.busyProductId.set(null);
    }
  }

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
