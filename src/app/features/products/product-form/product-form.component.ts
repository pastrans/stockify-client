import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PRODUCT_STATUS_OPTIONS, Product } from '../../../shared/models/product.model';
import { ProductService } from '../../../core/services/product.service';
import { getApiErrorMessage } from '../../../shared/utils/api-error';

@Component({
  selector: 'app-product-form',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './product-form.component.html'
})
export class ProductFormComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly productService = inject(ProductService);

  // Estado de la vista
  product = signal<Product | null>(null);
  isEditMode = signal<boolean>(false);
  isLoading = signal<boolean>(false);
  notFound = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  status = computed(() => {
    const product = this.product();
    return product ? PRODUCT_STATUS_OPTIONS.find(o => o.value === product.status) : undefined;
  });

  ngOnInit(): void {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam === null) return;

    this.isEditMode.set(true);
    const id = Number(idParam);
    if (!Number.isInteger(id) || id <= 0) {
      this.notFound.set(true);
      return;
    }
    this.loadProduct(id);
  }

  private loadProduct(id: number): void {
    this.isLoading.set(true);

    this.productService.getProductById(id).subscribe({
      next: (product) => {
        this.product.set(product);
        this.isLoading.set(false);
      },
      error: (err) => {
        if (err.status === 404) {
          this.notFound.set(true);
        } else {
          this.errorMessage.set(getApiErrorMessage(err, 'Error al cargar el producto.'));
        }
        this.isLoading.set(false);
      }
    });
  }
}
