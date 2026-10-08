export type DisplayType = 'select' | 'pills' | 'radio' | 'color';
export type VariantCreation = 'instantly' | 'dynamically' | 'never';

export interface AttributeValue {
  id: number;
  valueName: string;
  shortName: string;
  colorHex: string | null;
  sequence: number;
  attributeId: number;
  available: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface Attribute {
  id: number;
  name: string;
  sequence: number;
  displayType: DisplayType;
  variantCreation: VariantCreation;
  available: boolean;
  values: AttributeValue[];
  createdAt?: string;
  updatedAt?: string;
}

export interface AttributeValueRequest {
  valueName: string;
  shortName: string;
  colorHex?: string;
  sequence?: number;
}

export interface CreateAttributeRequest {
  name: string;
  sequence: number;
  displayType: DisplayType;
  variantCreation: VariantCreation;
  values: AttributeValueRequest[];
}

export interface UpdateAttributeRequest extends Partial<Omit<CreateAttributeRequest, 'values'>> {
  available?: boolean;
}

export interface UpdateAttributeValueRequest extends Partial<AttributeValueRequest> {
  available?: boolean;
}

export interface AttributesListResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  prev: string | null;
  next: string | null;
  data: Attribute[];
}

export interface AttributeOption<T> {
  value: T;
  label: string;
}

export const DISPLAY_TYPE_OPTIONS: AttributeOption<DisplayType>[] = [
  { value: 'select', label: 'Dropdown Select' },
  { value: 'pills', label: 'Pills / Botones' },
  { value: 'radio', label: 'Radio Buttons' },
  { value: 'color', label: 'Color Picker' }
];

export const VARIANT_CREATION_OPTIONS: AttributeOption<VariantCreation>[] = [
  { value: 'instantly', label: 'Instantáneo' },
  { value: 'dynamically', label: 'Dinámico' },
  { value: 'never', label: 'Nunca' }
];
