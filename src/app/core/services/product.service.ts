import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateProductRequest,
  Product,
  ProductFilters,
  ProductVariant,
  ProductsListResponse,
  UpdateProductRequest,
  UpdateVariantRequest,
  UpdateVariantStockRequest
} from '../../shared/models/product.model';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/products`;

  getProducts(page: number = 1, limit: number = 10, filters?: Partial<ProductFilters>): Observable<ProductsListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (filters?.available && filters.available !== 'all') {
      params = params.set('available', filters.available);
    }
    if (filters?.status) {
      params = params.set('status', filters.status);
    }
    const search = filters?.search?.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (filters?.posCategoryId != null) {
      params = params.set('posCategoryId', filters.posCategoryId.toString());
    }

    return this.http.get<ProductsListResponse>(this.apiUrl, { params });
  }

  getProductById(id: number): Observable<Product> {
    return this.http.get<Product>(`${this.apiUrl}/${id}`);
  }

  createProduct(data: CreateProductRequest): Observable<Product> {
    return this.http.post<Product>(this.apiUrl, data);
  }

  updateProduct(id: number, data: UpdateProductRequest): Observable<Product> {
    return this.http.put<Product>(`${this.apiUrl}/${id}`, data);
  }

  deleteProduct(id: number): Observable<Product> {
    return this.http.delete<Product>(`${this.apiUrl}/${id}`);
  }

  // --- Variantes y existencias ---

  updateVariant(variantId: number, data: UpdateVariantRequest): Observable<ProductVariant> {
    return this.http.put<ProductVariant>(`${this.apiUrl}/variants/${variantId}`, data);
  }

  updateVariantStock(variantId: number, data: UpdateVariantStockRequest): Observable<ProductVariant> {
    return this.http.patch<ProductVariant>(`${this.apiUrl}/variants/${variantId}/stock`, data);
  }
}
