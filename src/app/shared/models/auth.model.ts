// Re-exportar User para que los servicios que lo consuman desde aquí no se rompan
export { User } from './user.model';
import { User } from './user.model';

export interface LoginRequest {
  email: string;
  password: string;
}

// Alias de compatibilidad por si se usa LoginDto en algún otro punto
export type LoginDto = LoginRequest;

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword?: string;
  password?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}