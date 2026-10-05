import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  User,
  UsersListResponse,
  CreateUserRequest,
  UpdateUserRequest
} from '../../shared/models/user.model';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `${environment.apiUrl}/users`;

  getUsers(
    page: number = 1,
    limit: number = 10,
    available: 'all' | 'true' | 'false' = 'all'
  ): Observable<UsersListResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (available !== 'all') {
      params = params.set('available', available);
    }

    return this.http.get<UsersListResponse>(this.apiUrl, { params });
  }

  getUserById(id: number): Observable<User> {
    return this.http.get<User>(`${this.apiUrl}/${id}`);
  }

  createUser(data: Omit<CreateUserRequest, 'role'>): Observable<User> {
    // Rol fijado siempre en ADMIN
    const payload: CreateUserRequest = {
      ...data,
      role: 'ADMIN'
    };
    return this.http.post<User>(this.apiUrl, payload);
  }

  updateUser(id: number, data: UpdateUserRequest): Observable<User> {
    return this.http.put<User>(`${this.apiUrl}/${id}`, data);
  }

  toggleUserStatus(id: number): Observable<User> {
    return this.http.patch<User>(`${this.apiUrl}/${id}/status`, {});
  }
  
  deleteUser(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/${id}`);
  }
}