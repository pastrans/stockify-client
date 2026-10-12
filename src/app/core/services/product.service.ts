import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { Product, ProductFilters, ProductsListResponse } from '../../shared/models/product.model';

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

  deleteProduct(id: number): Observable<Product> {
    return this.http.delete<Product>(`${this.apiUrl}/${id}`);
  }
}
