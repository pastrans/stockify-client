// Pestaña de estado de los listados: Todos / Habilitados / Inhabilitados
export type AvailabilityFilter = 'all' | 'active' | 'inactive';

// Valor del parámetro `available` de la API ('all' = no se envía)
export type AvailableParam = 'all' | 'true' | 'false';

export function toAvailableParam(filter: AvailabilityFilter): AvailableParam {
  return { all: 'all', active: 'true', inactive: 'false' }[filter] as AvailableParam;
}
