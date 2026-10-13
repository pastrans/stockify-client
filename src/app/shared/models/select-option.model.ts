// Opción genérica para <app-search-select> y <app-multi-search-select>
export interface SelectOption<T = number> {
  value: T;
  label: string;
  // Texto secundario (p. ej. código SKU), también se usa en la búsqueda
  hint?: string;
  // Punto de color junto a la etiqueta
  colorHex?: string | null;
  // No se puede elegir (en la multiselección: no se puede marcar ni desmarcar)
  disabled?: boolean;
  disabledReason?: string;
}

// Minúsculas y sin tildes, para que "camión" coincida con "camion"
export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function filterOptions<T>(options: SelectOption<T>[], term: string): SelectOption<T>[] {
  const query = normalizeText(term);
  if (!query) return options;
  return options.filter(o => normalizeText(`${o.label} ${o.hint ?? ''}`).includes(query));
}
