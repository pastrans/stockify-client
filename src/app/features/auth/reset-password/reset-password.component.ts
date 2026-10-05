import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { AppValidators } from '../../../shared/utils/app-validators';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
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
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  token = signal<string | null>(null);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  showPassword = signal<boolean>(false);
  showConfirmPassword = signal<boolean>(false);

  togglePassword(): void {
    this.showPassword.set(!this.showPassword());
  }

  toggleConfirmPassword(): void {
    this.showConfirmPassword.set(!this.showConfirmPassword());
  }

  resetForm: FormGroup = this.fb.group({
    password: ['', [Validators.required, AppValidators.strongPassword]],
    confirmPassword: ['', [Validators.required]]
  }, { validators: this.passwordMatchValidator });

  ngOnInit(): void {
    const urlToken = this.route.snapshot.queryParamMap.get('token');
    if (!urlToken) {
      this.errorMessage.set('El enlace no es válido o está incompleto.');
    } else {
      this.token.set(urlToken);
    }
  }

  // Validador personalizado para confirmar contraseñas
  passwordMatchValidator(control: AbstractControl): ValidationErrors | null {
    const password = control.get('password')?.value;
    const confirmPassword = control.get('confirmPassword')?.value;
    if (password && confirmPassword && password !== confirmPassword) {
      return { mismatch: true };
    }
    return null;
  }

  onSubmit(): void {
    if (this.resetForm.invalid || !this.token()) {
      this.resetForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    this.errorMessage.set(null);
    const { password } = this.resetForm.value;

    this.authService.resetPassword(this.token()!, password).subscribe({
      next: () => {
        this.isLoading.set(false);
        // Podríamos redirigir con un query param para mostrar un toast de éxito en el login
        this.router.navigate(['/login']); 
      },
      error: (err) => {
        this.isLoading.set(false);
        // Si el token expira, el backend responderá un error 400/401
        this.errorMessage.set(err.error?.message || 'El enlace ha expirado o es inválido. Vuelve a solicitar el cambio.');
      }
    });
  }
}