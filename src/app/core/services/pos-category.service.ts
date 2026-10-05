import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PosCategory,
  PosCategoriesListResponse,
  CreatePosCategoryRequest,
  UpdatePosCategoryRequest
} from '../../shared/models/pos-category.model';

@Injectable({
  providedIn: 'root'
})
export class PosCategoryService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/pos-categories`;

  getCategories(
    page: number = 1,
    limit: number = 10,
    available: 'all' | 'true' | 'false' = 'all'
  ): Observable<PosCategoriesListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (available !== 'all') {
      params = params.set('available', available);
    }

    return this.http.get<PosCategoriesListResponse>(this.apiUrl, { params });
  }

  getCategoryById(id: number): Observable<PosCategory> {
    return this.http.get<PosCategory>(`${this.apiUrl}/${id}`);
  }

  createCategory(data: CreatePosCategoryRequest): Observable<PosCategory> {
    return this.http.post<PosCategory>(this.apiUrl, data);
  }

  updateCategory(id: number, data: UpdatePosCategoryRequest): Observable<PosCategory> {
    return this.http.put<PosCategory>(`${this.apiUrl}/${id}`, data);
  }

  deleteCategory(id: number): Observable<PosCategory> {
    return this.http.delete<PosCategory>(`${this.apiUrl}/${id}`);
  }
}
