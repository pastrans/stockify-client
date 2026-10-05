import { Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { PublicGuard } from './core/guards/public.guard';
import { MainLayoutComponent } from './shared/components/main-layout/main-layout.component';

export const routes: Routes = [
  // Rutas Públicas (Login)
  {
    path: 'auth',
    canActivate: [PublicGuard],
    children: [
      {
        path: 'login',
        loadComponent: () => import('./features/auth/login/login.component').then(m => m.LoginComponent)
      },
      {
        path: 'reset-password',
        loadComponent: () => import('./features/auth/reset-password/reset-password.component').then(m => m.ResetPasswordComponent)
      },
      {
        path: '',
        redirectTo: 'login',
        pathMatch: 'full'
      }
    ]
  },

  // Rutas Protegidas dentro del MainLayout
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [AuthGuard],
    children: [
      {
        path: 'users',
        loadComponent: () => import('./features/users/users.component').then(m => m.UsersComponent)
      },
      // Redirección por defecto
      {
        path: '',
        redirectTo: 'users',
        pathMatch: 'full'
      }
    ]
  },

  // Manejo de errores
  {
    path: 'forbidden',
    loadComponent: () => import('./features/forbidden/forbidden.component').then(m => m.ForbiddenComponent)
  },
  {
    path: '**',
    loadComponent: () => import('./features/not-found/not-found.component').then(m => m.NotFoundComponent)
  }
];