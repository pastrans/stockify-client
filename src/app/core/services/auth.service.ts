import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { Observable, tap } from 'rxjs';
import { AuthResponse, ForgotPasswordRequest, LoginRequest, User } from '../../shared/models/auth.model';
import { StorageService } from './storage.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly storageService = inject(StorageService);
  private readonly endpoint = `${environment.apiUrl}/auth`;

  private readonly TOKEN_KEY = 'auth_token';
  private readonly USER_KEY = 'auth_user';

  // Estado reactivo del usuario
  currentUser = signal<User | null>(this.getStoredUser());
  
  // Señales computadas
  isAuthenticated = computed(() => !!this.currentUser());
  userRole = computed(() => this.currentUser()?.role ?? null);

  login(credentials: LoginRequest): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.endpoint}/login`, credentials).pipe(
      tap((res) => {
        this.storageService.setItem(this.TOKEN_KEY, res.token);
        this.storageService.setItem(this.USER_KEY, JSON.stringify(res.user));
        this.currentUser.set(res.user);
      })
    );
  }

  forgotPassword(data: ForgotPasswordRequest): Observable<void> {
    return this.http.post<void>(`${this.endpoint}/forgot-password`, data);
  }

  resetPassword(token: string, password: string): Observable<void> {
    return this.http.post<void>(`${this.endpoint}/reset-password/${token}`, { password });
  }

  logout(): void {
    this.storageService.removeItem(this.TOKEN_KEY);
    this.storageService.removeItem(this.USER_KEY);
    this.currentUser.set(null);
  }

  getToken(): string | null {
    return this.storageService.getItem(this.TOKEN_KEY);
  }

  hasRole(allowedRoles: string[]): boolean {
    const role = this.userRole();
    return role ? allowedRoles.includes(role) : false;
  }

  private getStoredUser(): User | null {
    const rawUser = this.storageService.getItem(this.USER_KEY);
    if (!rawUser) return null;
    try {
      return JSON.parse(rawUser) as User;
    } catch {
      return null;
    }
  }
}