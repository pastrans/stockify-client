import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CreateLabelTemplateRequest,
  LabelTemplate,
  LabelTemplateFilters,
  LabelTemplatesListResponse,
  UpdateLabelTemplateRequest
} from '../../shared/models/label-template.model';

@Injectable({
  providedIn: 'root'
})
export class LabelTemplateService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/label-templates`;

  getTemplates(page: number = 1, limit: number = 10, filters?: Partial<LabelTemplateFilters>): Observable<LabelTemplatesListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (filters?.available && filters.available !== 'all') {
      params = params.set('available', filters.available);
    }
    const search = filters?.search?.trim();
    if (search) {
      params = params.set('search', search);
    }

    return this.http.get<LabelTemplatesListResponse>(this.apiUrl, { params });
  }

  getTemplateById(id: number): Observable<LabelTemplate> {
    return this.http.get<LabelTemplate>(`${this.apiUrl}/${id}`);
  }

  createTemplate(data: CreateLabelTemplateRequest): Observable<LabelTemplate> {
    return this.http.post<LabelTemplate>(this.apiUrl, data);
  }

  updateTemplate(id: number, data: UpdateLabelTemplateRequest): Observable<LabelTemplate> {
    return this.http.put<LabelTemplate>(`${this.apiUrl}/${id}`, data);
  }

  // Soft-delete: la plantilla queda con available = false
  deleteTemplate(id: number): Observable<LabelTemplate> {
    return this.http.delete<LabelTemplate>(`${this.apiUrl}/${id}`);
  }
}
