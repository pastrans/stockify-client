import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.component.html',
  styles: `
    .login-container {
      min-height: 100vh;
      display: flex;
      justify-content: center;
      align-items: center;
      background-color: darkslategray;
    }
  `
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);
  
  isForgotPasswordMode = signal<boolean>(false);
  forgotSuccessMessage = signal<boolean>(false);
  showPassword = signal<boolean>(false);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(4)]]
  });

  forgotForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]]
  });

  toggleMode(): void {
    this.isForgotPasswordMode.set(!this.isForgotPasswordMode());
    this.errorMessage.set(null);
    this.forgotSuccessMessage.set(false);
    this.forgotForm.reset();
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.authService.login(this.loginForm.value).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.router.navigate(['/users']);
      },
      error: (err) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Credenciales inválidas o error de conexión.');
      }
    });
  }

  onForgotSubmit(): void {
    if (this.forgotForm.invalid) {
      this.forgotForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    this.forgotSuccessMessage.set(false);

    this.authService.forgotPassword(this.forgotForm.value).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.forgotSuccessMessage.set(true);
      },
      error: (err: any) => {
        this.isLoading.set(false);
        this.errorMessage.set(err.error?.message || 'Error al procesar la solicitud.');
      }
    });
  }

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }
  
}