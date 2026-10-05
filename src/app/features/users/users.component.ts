import { Component, OnInit, inject, TemplateRef, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { NgbModal, NgbModalModule, NgbModalRef, NgbPaginationModule } from '@ng-bootstrap/ng-bootstrap';
import { User } from '../../shared/models/user.model';
import { UserService } from '../../core/services/user.service';
import { AppValidators } from '../../shared/utils/app-validators';

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NgbModalModule, NgbPaginationModule],
  templateUrl: './users.component.html',
  styleUrls: ['./users.component.css']
})
export class UsersComponent implements OnInit {
  private readonly modalService = inject(NgbModal);
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);

  // Estados Reactivos con Signals
  users = signal<User[]>([]);
  isLoading = signal<boolean>(false);
  errorMessage = signal<string | null>(null);

  // Paginación
  currentPage = signal<number>(1);
  pageSize = signal<number>(10);
  totalRecords = signal<number>(0);

  // Filtros de estado reactivos
  statusFilter = signal<'all' | 'active' | 'inactive'>('all');

  filteredUsers = computed(() => {
    const list = this.users();
    const filter = this.statusFilter();
    if (filter === 'active') return list.filter(u => u.available);
    if (filter === 'inactive') return list.filter(u => !u.available);
    return list;
  });

  // Modal y Formulario
  isEditMode = false;
  selectedUser: User | null = null;
  modalRef: NgbModalRef | null = null;

  userForm: FormGroup = this.fb.group({
    id: [null],
    name: ['', [Validators.required, Validators.minLength(3)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, AppValidators.strongPassword]],
    role: ['ADMIN', Validators.required],
    available: [true]
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(page: number = this.currentPage()): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    this.userService.getUsers(page, this.pageSize()).subscribe({
      next: (res) => {
        const items = res.users ?? res.data ?? res.items ?? [];
        this.users.set(items);
        this.currentPage.set(res.page);
        this.totalRecords.set(res.total);
        this.isLoading.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.error?.message || 'Error al cargar usuarios.');
        this.isLoading.set(false);
      }
    });
  }

  onPageChange(newPage: number): void {
    this.currentPage.set(newPage);
    this.loadUsers(newPage);
  }

  setStatusFilter(status: 'all' | 'active' | 'inactive'): void {
    this.statusFilter.set(status);
  }

  openModal(content: TemplateRef<unknown>, user?: User): void {
    this.isEditMode = !!user;
    this.errorMessage.set(null);

    const passwordControl = this.userForm.get('password');

    if (user) {
      this.selectedUser = user;
      this.userForm.patchValue({
        id: user.id,
        name: user.name,
        email: user.email,
        role: 'ADMIN',
        available: user.available,
        password: ''
      });
      passwordControl?.clearValidators();
      passwordControl?.addValidators([AppValidators.strongPassword]);
      passwordControl?.updateValueAndValidity();
    } else {
      this.selectedUser = null;
      this.userForm.reset({
        id: null,
        name: '',
        email: '',
        password: '',
        role: 'ADMIN',
        available: true
      });
      passwordControl?.clearValidators();
      passwordControl?.setValidators([Validators.required, AppValidators.strongPassword]);
      passwordControl?.updateValueAndValidity();
    }

    this.modalRef = this.modalService.open(content, { centered: true });
  }

  saveUser(): void {
    if (this.userForm.invalid) {
      this.userForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true);
    const formValue = { ...this.userForm.value };

    // Si está editando y no escribió contraseña, no se manda en el payload
    if (this.isEditMode && !formValue.password) {
      delete formValue.password;
    }

    if (this.isEditMode && this.selectedUser) {
      this.userService.updateUser(this.selectedUser.id, formValue).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.modalRef?.close();
          this.loadUsers();
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Error al actualizar usuario.');
          this.isLoading.set(false);
        }
      });
    } else {
      this.userService.createUser(formValue).subscribe({
        next: () => {
          this.isLoading.set(false);
          this.modalRef?.close();
          this.loadUsers(1);
        },
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Error al crear usuario.');
          this.isLoading.set(false);
        }
      });
    }
  }

  deleteUser(id: number): void {
    if (confirm('¿Estás seguro de que deseas eliminar este usuario?')) {
      this.isLoading.set(true);
      this.userService.deleteUser(id).subscribe({
        next: () => this.loadUsers(),
        error: (err) => {
          this.errorMessage.set(err.error?.message || 'Error al eliminar usuario.');
          this.isLoading.set(false);
        }
      });
    }
  }
}