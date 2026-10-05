export interface PosCategory {
  id: number;
  name: string;
  sequence: number;
  color: number;
  available: boolean;
  isDeletable: boolean;
  parentId: number | null;
  children: PosCategory[];
  createdAt?: string;
  updatedAt?: string;
}

export interface CreatePosCategoryRequest {
  name: string;
  sequence: number;
  color: number;
  parentId: number | null;
}

export interface UpdatePosCategoryRequest extends Partial<CreatePosCategoryRequest> {
  available?: boolean;
}

export interface PosCategoriesListResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  prev: string | null;
  next: string | null;
  data: PosCategory[];
}

export interface OdooColor {
  index: number;
  name: string;
  hex: string | null;
}

// Paleta de colores de Odoo: el backend guarda únicamente el índice (0–11)
export const ODOO_COLORS: OdooColor[] = [
  { index: 0, name: 'Sin color', hex: null },
  { index: 1, name: 'Rojo', hex: '#F06050' },
  { index: 2, name: 'Naranja', hex: '#F4A460' },
  { index: 3, name: 'Amarillo', hex: '#F7CD1F' },
  { index: 4, name: 'Celeste', hex: '#6CC1ED' },
  { index: 5, name: 'Púrpura oscuro', hex: '#814968' },
  { index: 6, name: 'Salmón', hex: '#EB7E7F' },
  { index: 7, name: 'Verde azulado', hex: '#2C8397' },
  { index: 8, name: 'Azul oscuro', hex: '#475577' },
  { index: 9, name: 'Fucsia', hex: '#D6145F' },
  { index: 10, name: 'Verde', hex: '#30C381' },
  { index: 11, name: 'Violeta', hex: '#9365B8' }
];
