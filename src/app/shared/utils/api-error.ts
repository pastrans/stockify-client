import { HttpErrorResponse } from '@angular/common/http';

// Nombres en la UI de los campos de la configuración de exportación
const SETTINGS_FIELD_LABELS: Record<string, string> = {
  warehouseLocation: 'Ubicación de Bodega',
  storeLocation: 'Ubicación de Tienda',
  linkedPosConfig: 'Punto de Venta de Odoo',
  externalIdPrefix: 'Prefijo de ID externo',
  attributeCategory: 'Categoría de atributo'
};

// Traducciones de los mensajes de negocio (400) que devuelve la API en inglés
const FRIENDLY_MESSAGES: { pattern: RegExp; translate: (match: RegExpMatchArray) => string }[] = [
  {
    pattern: /Attribute with id \d+ cannot be disabled because it is used by product template\(s\): ([\d,\s]+)/i,
    translate: (match) => {
      const ids = match[1].split(',').map(id => `#${id.trim()}`).filter(id => id !== '#');
      const products = ids.length === 1 ? `el producto ${ids[0]}` : `${ids.length} productos (${ids.join(', ')})`;
      return `No se puede eliminar ni inhabilitar este atributo porque está en uso en ${products}. ` +
        'Quítalo de esos productos antes de intentarlo de nuevo.';
    }
  },
  {
    pattern: /Cannot delete product: variants have active physical stock/i,
    translate: () => 'No se puede eliminar el producto porque está bloqueado: tiene existencias o ya fue sincronizado con Odoo.'
  },
  // --- Productos ---
  {
    pattern: /A product with skuPrefix '(.+)' already exists/i,
    translate: (match) => `Ya existe un producto con el prefijo SKU "${match[1]}".`
  },
  {
    pattern: /^SKU conflict: (.+)\. Change the skuPrefix\.$/i,
    translate: (match) => {
      const conflicts = match[1]
        .replace(/is already used by product '([^']+)' \(id (\d+)\)/g, 'ya lo usa el producto "$1" (#$2)')
        .replace(/\(inactive variant\)/g, '(variante inactiva)');
      return `Hay SKU o códigos de barras repetidos: ${conflicts}. Cambia el prefijo SKU.`;
    }
  },
  {
    pattern: /SKU, barcode, or skuPrefix conflict occurred/i,
    translate: () => 'El SKU, el código de barras o el prefijo SKU ya están en uso por otro producto.'
  },
  {
    pattern: /Cannot change skuPrefix: product has physical stock or is locked/i,
    translate: () => 'No se puede cambiar el prefijo SKU: el producto tiene existencias o está sincronizado.'
  },
  {
    pattern: /Cannot add or remove attribute lines/i,
    translate: () => 'El producto está bloqueado: no se pueden agregar ni quitar atributos, solo agregar valores nuevos.'
  },
  {
    pattern: /Cannot change the attribute order of a synced product/i,
    translate: () => 'No se puede cambiar el orden de los atributos de un producto sincronizado con Odoo. Desincronízalo primero.'
  },
  {
    pattern: /Cannot remove value: variant '(.+)' has (\d+) physical units in stock/i,
    translate: (match) => `No se puede quitar el valor: la variante "${match[1]}" tiene ${match[2]} unidades en existencia.`
  },
  {
    pattern: /Barcode already assigned to another variant/i,
    translate: () => 'Ese código de barras ya está asignado a otra variante.'
  },
  {
    pattern: /Cannot update stock: variant is inactive/i,
    translate: () => 'No se pueden actualizar las existencias de una variante inactiva.'
  },
  // --- Sincronización con Odoo ---
  {
    pattern: /The product went back to draft because it has no stock, but it already exists in Odoo/i,
    translate: () => 'El producto volvió a borrador porque no tiene existencias, pero ya existe en Odoo. ' +
      'Si cambias sus atributos o su prefijo SKU, sus variantes pueden regenerarse y duplicarse en Odoo en la siguiente importación.'
  },
  // --- Configuración de exportación ---
  {
    pattern: /externalIdPrefix cannot be changed: (\d+) product\(s\) are already synced with Odoo using "(.+)"/i,
    translate: (match) => `No se puede cambiar el prefijo de ID externo: ${match[1] === '1' ? 'hay 1 producto sincronizado' : `hay ${match[1]} productos sincronizados`} con Odoo usando "${match[2]}".`
  },
  {
    pattern: /externalIdPrefix can only contain letters, numbers, "_" and "-"/i,
    translate: () => 'El prefijo de ID externo solo admite letras, números, "_" y "-".'
  },
  {
    pattern: /language must be one of/i,
    translate: () => 'El idioma de exportación debe ser inglés o español.'
  },
  {
    pattern: /maxRowsPerFile must be an integer greater than 0/i,
    translate: () => 'El máximo de filas por archivo debe ser un número entero mayor que 0.'
  },
  {
    pattern: /^(\w+) must be a non-empty string$/i,
    translate: (match) => `El campo "${SETTINGS_FIELD_LABELS[match[1]] ?? match[1]}" no puede estar vacío.`
  },
  {
    pattern: /At least one setting must be provided/i,
    translate: () => 'No hay cambios que guardar en la configuración.'
  },
  // --- Subida de imágenes ---
  {
    pattern: /Upload '.+' is still processing/i,
    translate: () => 'La imagen todavía se está procesando. Espera a que termine antes de guardar.'
  },
  {
    pattern: /Upload '.+' failed processing: (.+)/i,
    translate: (match) => `El procesamiento de la imagen falló: ${match[1]}`
  },
  {
    pattern: /Upload '.+' not found or expired/i,
    translate: () => 'La imagen subida expiró o no existe. Vuelve a subirla.'
  },
  {
    pattern: /Invalid file format\. Only JPEG, PNG, and WebP are allowed/i,
    translate: () => 'Formato no permitido. Usa JPG, PNG o WebP.'
  },
  {
    pattern: /File size exceeds the maximum limit of 5MB/i,
    translate: () => 'La imagen supera el máximo de 5 MB.'
  }
];

// Traduce un mensaje suelto de la API (p. ej. el campo `warning`); si no es conocido, lo devuelve igual
export function translateApiMessage(raw: string): string {
  return translateMessage(raw) ?? raw;
}

// Traduce un mensaje de la API si coincide con algún patrón conocido
function translateMessage(raw: string): string | null {
  for (const { pattern, translate } of FRIENDLY_MESSAGES) {
    const match = raw.match(pattern);
    if (match) return translate(match);
  }
  return null;
}

function getRawMessage(err: HttpErrorResponse): string | null {
  const raw: unknown = err.error?.error ?? err.error?.message;
  return typeof raw === 'string' && raw ? raw : null;
}

// Extrae el mensaje de error de la API (`{ error }` o `{ message }`) y lo traduce si es conocido
export function getApiErrorMessage(err: HttpErrorResponse, fallback: string): string {
  const raw = getRawMessage(err);
  if (!raw) return fallback;
  return translateMessage(raw) ?? raw;
}

/**
 * Como getApiErrorMessage, pero separa los problemas que la API junta con "; " (validaciones
 * de la exportación) y traduce cada uno. Si el mensaje completo ya es conocido (p. ej. el de
 * colisión de SKU, que también usa "; "), se devuelve como un único elemento.
 */
export function getApiErrorList(err: HttpErrorResponse, fallback: string): string[] {
  const raw = getRawMessage(err);
  if (!raw) return [fallback];

  const whole = translateMessage(raw);
  if (whole) return [whole];

  return raw
    .split('; ')
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => translateMessage(part) ?? part);
}
