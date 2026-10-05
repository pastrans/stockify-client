export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  available: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface CreateUserRequest {
  name: string;
  email: string;
  password?: string;
  role: string;
}

export interface UpdateUserRequest {
  name: string;
  email: string;
  password?: string;
}

export interface UsersListResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  users?: User[];
  data?: User[];
  items?: User[];
}