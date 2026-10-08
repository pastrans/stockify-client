import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  Attribute,
  AttributeValue,
  AttributesListResponse,
  AttributeValueRequest,
  CreateAttributeRequest,
  UpdateAttributeRequest,
  UpdateAttributeValueRequest
} from '../../shared/models/attribute.model';

@Injectable({
  providedIn: 'root'
})
export class AttributeService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/attributes`;

  getAttributes(
    page: number = 1,
    limit: number = 10,
    available: 'all' | 'true' | 'false' = 'all'
  ): Observable<AttributesListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (available !== 'all') {
      params = params.set('available', available);
    }

    return this.http.get<AttributesListResponse>(this.apiUrl, { params });
  }

  getAttributeById(id: number): Observable<Attribute> {
    return this.http.get<Attribute>(`${this.apiUrl}/${id}`);
  }

  createAttribute(data: CreateAttributeRequest): Observable<Attribute> {
    return this.http.post<Attribute>(this.apiUrl, data);
  }

  updateAttribute(id: number, data: UpdateAttributeRequest): Observable<Attribute> {
    return this.http.put<Attribute>(`${this.apiUrl}/${id}`, data);
  }

  deleteAttribute(id: number): Observable<Attribute> {
    return this.http.delete<Attribute>(`${this.apiUrl}/${id}`);
  }

  // --- Valores del atributo ---

  addValue(attributeId: number, data: AttributeValueRequest): Observable<AttributeValue> {
    return this.http.post<AttributeValue>(`${this.apiUrl}/${attributeId}/values`, data);
  }

  updateValue(valueId: number, data: UpdateAttributeValueRequest): Observable<AttributeValue> {
    return this.http.put<AttributeValue>(`${this.apiUrl}/values/${valueId}`, data);
  }

  deleteValue(valueId: number): Observable<AttributeValue> {
    return this.http.delete<AttributeValue>(`${this.apiUrl}/values/${valueId}`);
  }
}
