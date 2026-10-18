// Catálogo de marcadores de las plantillas de etiqueta. Es el mismo que valida la API al guardar
// (../Stockify-API/src/domain/services/labels/label-placeholders.ts): si se añade uno, va en los dos
export const LABEL_PLACEHOLDERS = [
  'name',
  'displayName',
  'sku',
  'qr',
  'barcode',
  'salePrice',
  'priceCode',
  'size',
  'storeName'
] as const;

export type LabelPlaceholderName = (typeof LABEL_PLACEHOLDERS)[number];

// {{attr.<Atributo>}}: valor de ese atributo en la variante
export const ATTRIBUTE_PLACEHOLDER_PREFIX = 'attr.';

// Descripción y ejemplo de cada marcador, para el panel del editor y la guía
export const LABEL_PLACEHOLDER_HELP: { placeholder: string; description: string; example: string }[] = [
  { placeholder: '{{name}}', description: 'Nombre del producto', example: 'Crocs Skybang' },
  { placeholder: '{{displayName}}', description: 'Nombre de la variante con sus valores', example: 'Crocs Skybang (Negro, 35 EUR)' },
  { placeholder: '{{sku}}', description: 'SKU de la variante', example: 'CR-NE-35' },
  { placeholder: '{{qr}}', description: 'Contenido del QR: el SKU (referencia interna en Odoo)', example: 'CR-NE-35' },
  { placeholder: '{{barcode}}', description: 'Código de barras', example: '300000000001' },
  { placeholder: '{{salePrice}}', description: 'Precio de venta con dos decimales', example: '11.25' },
  { placeholder: '{{priceCode}}', description: 'Precio oculto: 4 dígitos sin punto', example: '1125' },
  { placeholder: '{{size}}', description: 'Talla: primer atributo de talla (Configuración) que tenga la variante', example: '35 EUR' },
  { placeholder: '{{attr.Color}}', description: 'Valor de un atributo concreto (cambia "Color" por el nombre del atributo)', example: 'Negro' },
  { placeholder: '{{storeName}}', description: 'Nombre de la tienda (Configuración)', example: 'Bazar Enrique' }
];

// {{variable}} o {{variable:N}}, con espacios opcionales dentro de las llaves
export const PLACEHOLDER_PATTERN = /\{\{\s*([^{}]*?)\s*\}\}/g;

export interface ParsedPlaceholder {
  // Marcador del catálogo, o null si es {{attr.X}}
  variable: LabelPlaceholderName | null;
  // Nombre del atributo en {{attr.X}}
  attributeName: string | null;
  // N en {{variable:N}}
  maxLength: number | null;
}

/**
 * Interpreta el contenido de un marcador (sin las llaves). Devuelve null si no es válido:
 * la API no deja guardar plantillas así, pero el editor lo usa para avisar mientras se escribe.
 */
export function parsePlaceholder(content: string): ParsedPlaceholder | null {
  // El nombre de un atributo no admite ':' (separador de Odoo): el ':' solo puede ser el recorte
  const [variable = '', length, ...extra] = content.split(':').map(part => part.trim());

  let maxLength: number | null = null;
  if (length !== undefined || extra.length > 0) {
    if (extra.length > 0 || !/^\d+$/.test(length ?? '') || Number(length) <= 0) return null;
    maxLength = Number(length);
  }

  if (variable.startsWith(ATTRIBUTE_PLACEHOLDER_PREFIX)) {
    const attributeName = variable.slice(ATTRIBUTE_PLACEHOLDER_PREFIX.length).trim();
    return attributeName ? { variable: null, attributeName, maxLength } : null;
  }

  if (!(LABEL_PLACEHOLDERS as readonly string[]).includes(variable)) return null;
  return { variable: variable as LabelPlaceholderName, attributeName: null, maxLength };
}

// Marcadores no válidos de un ZPL (para avisar en el editor antes de guardar)
export function invalidPlaceholders(zpl: string): string[] {
  const invalid = new Set<string>();
  for (const match of zpl.matchAll(PLACEHOLDER_PATTERN)) {
    if (!parsePlaceholder(match[1])) invalid.add(match[0]);
  }
  return [...invalid];
}

// Nombres de atributo usados en {{attr.X}}, sin repetir
export function attributePlaceholderNames(zpl: string): string[] {
  const names = new Set<string>();
  for (const match of zpl.matchAll(PLACEHOLDER_PATTERN)) {
    const parsed = parsePlaceholder(match[1]);
    if (parsed?.attributeName) names.add(parsed.attributeName);
  }
  return [...names];
}
