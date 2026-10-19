import { AttributeValue } from './attribute.model';

export type ProductStatus = 'draft' | 'stock_locked' | 'synced';

export interface ProductVariant {
  id: number;
  templateId: number;
  sku: string;
  displayName: string;
  barcode: string;
  imageKey: string | null;
  // URL pública derivada de imageKey: es la que se muestra
  imageUrl: string | null;
  stockStore: number;
  stockWarehouse: number;
  totalStock: number;
  isLocked: boolean;
  // Primera vez que la variante se marcó como sincronizada (ya está en Odoo); null = pendiente
  syncedAt: string | null;
  available: boolean;
  combination: AttributeValue[];
  createdAt?: string;
  updatedAt?: string;
}

// Línea de atributo del producto; su sequence define la posición del atributo en el SKU
export interface ProductAttributeLine {
  id: number;
  attributeId: number;
  attributeName: string;
  sequence: number;
  values: AttributeValue[];
}

export interface Product {
  id: number;
  name: string;
  skuPrefix: string;
  costPrice: number;
  salePrice: number;
  description: string | null;
  mainImageKey: string | null;
  // URL pública derivada de mainImageKey: es la que se muestra
  mainImageUrl: string | null;
  status: ProductStatus;
  available: boolean;
  isLocked: boolean;
  totalVariantsCount: number;
  posCategoryIds: number[];
  attributeLines: ProductAttributeLine[];
  variants: ProductVariant[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductFilters {
  available: 'all' | 'true' | 'false';
  status: ProductStatus | null;
  search: string;
  posCategoryId: number | null;
}

export interface ProductsListResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  prev: string | null;
  next: string | null;
  data: Product[];
}

export interface ProductStatusOption {
  value: ProductStatus;
  label: string;
  icon: string;
  // Clases de Bootstrap para el badge del estado
  badgeClass: string;
}

export const PRODUCT_STATUS_OPTIONS: ProductStatusOption[] = [
  {
    value: 'draft',
    label: 'Borrador',
    icon: 'bi-pencil-square',
    badgeClass: 'bg-secondary-subtle text-secondary-emphasis border border-secondary-subtle'
  },
  {
    value: 'stock_locked',
    label: 'Con existencias',
    icon: 'bi-lock-fill',
    badgeClass: 'bg-warning-subtle text-warning border border-warning-subtle'
  },
  {
    value: 'synced',
    label: 'Sincronizado',
    icon: 'bi-cloud-check-fill',
    badgeClass: 'bg-info-subtle text-info border border-info-subtle'
  }
];

// --- SINCRONIZACIÓN CON ODOO ---

export interface SyncProductsResult {
  updatedCount: number;
  syncedIds: number[];
}

export interface SyncExportedProductsResult extends SyncProductsResult {
  // Productos de la exportación modificados después de exportarla: hay que volver a exportarlos
  skippedIds: number[];
}

// Si el producto vuelve a 'draft' (sin stock), la API añade una advertencia en inglés
export type UnsyncProductResult = Product & { warning?: string };

// --- PETICIONES ---

export interface AttributeLineRequest {
  attributeId: number;
  valueIds: number[];
  // Posición del atributo en el SKU de este producto
  sequence?: number;
}

export interface CreateProductRequest {
  name: string;
  skuPrefix: string;
  costPrice: number;
  salePrice: number;
  description: string | null;
  posCategoryIds: number[];
  attributeLines: AttributeLineRequest[];
  // uploadId de una subida en estado 'ready'
  mainImageUploadId?: string;
}

export interface UpdateProductRequest extends Partial<Omit<CreateProductRequest, 'mainImageUploadId'>> {
  // undefined = no se toca, null = quitar la imagen, uuid = nueva imagen
  mainImageUploadId?: string | null;
  available?: boolean;
}

export interface UpdateVariantRequest {
  barcode?: string;
  imageUploadId?: string | null;
}

export interface UpdateVariantStockRequest {
  stockStore: number;
  stockWarehouse: number;
}

// Foto que representa a una variante: la suya o, si no tiene, la principal del producto
export function variantImageUrl(product: Product, variant: ProductVariant): string | null {
  return variant.imageUrl ?? product.mainImageUrl ?? null;
}
