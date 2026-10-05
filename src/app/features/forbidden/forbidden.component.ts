import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-forbidden',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="d-flex flex-column justify-content-center align-items-center vh-100 text-center px-3 bg-dark text-light" data-bs-theme="dark">
      <div class="card p-5 border-secondary bg-dark-subtle shadow-lg rounded-4" style="max-width: 520px; width: 100%;">
        <div class="mb-3">
          <i class="bi bi-shield-lock-fill text-danger display-1"></i>
        </div>
        <h1 class="fw-bold display-4 text-white">403</h1>
        <h2 class="fs-4 fw-semibold text-white mb-2">Acceso Restringido</h2>
        <p class="text-secondary small mb-4">
          No cuentas con los permisos o el rol necesario para acceder a este módulo.
        </p>
        <div class="d-flex justify-content-center gap-2">
          <a routerLink="/caja" class="btn btn-outline-light px-4 py-2">
            <i class="bi bi-arrow-left me-1"></i> Volver a Caja
          </a>
        </div>
      </div>
    </div>
  `
})
export class ForbiddenComponent {}