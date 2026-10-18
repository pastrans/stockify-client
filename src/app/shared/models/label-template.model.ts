import { AvailableParam } from './list-filter.model';

// Plantilla ZPL de etiqueta. Los marcadores {{…}} se sustituyen al imprimir (shared/utils/zpl)
export interface LabelTemplate {
  id: number;
  name: string;
  description: string | null;
  // Tamaño de la etiqueta en mm (la vista previa lo convierte con printerDpi)
  widthMm: number;
  heightMm: number;
  zpl: string;
  available: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface LabelTemplatesListResponse {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  prev: string | null;
  next: string | null;
  data: LabelTemplate[];
}

export interface LabelTemplateFilters {
  available: AvailableParam;
  search: string;
}

export interface CreateLabelTemplateRequest {
  name: string;
  description: string | null;
  widthMm: number;
  heightMm: number;
  zpl: string;
}

export interface UpdateLabelTemplateRequest extends Partial<CreateLabelTemplateRequest> {
  available?: boolean;
}
