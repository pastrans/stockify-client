import { HttpErrorResponse } from '@angular/common/http';

// Nombres en la UI de los campos de la configuración de exportación
const SETTINGS_FIELD_LABELS: Record<string, string> = {
  warehouseLocation: 'Ubicación de Bodega',
  storeLocation: 'Ubicación de Tienda',
  linkedPosConfig: 'Punto de Venta de Odoo',
  externalIdPrefix: 'Prefijo de ID externo',
  attributeCategory: 'Categoría de atributo'
};

// Hojas de la exportación a Odoo, con el nombre que se usa en la UI
const EXPORT_SHEETS: Record<string, string> = {
  'Product Attribute': 'Atributos',
  'Point of Sale Category': 'Categorías POS',
  'Products': 'Productos',
  'Existencias': 'Existencias'
};

// Los problemas de la exportación empiezan con el nombre de su hoja ("Products: …")
const EXPORT_PROBLEM_SEPARATOR = new RegExp(`; (?=(?:${Object.keys(EXPORT_SHEETS).join('|')}): )`);

// Campo del mensaje "X cannot contain …" de la API, en español
function separatorFieldLabel(match: RegExpMatchArray): string {
  const [, , attribute, value, valueOf, valueName, shortName, plain] = match;
  if (attribute !== undefined) return `El atributo "${attribute}"`;
  if (value !== undefined) return `El valor "${value}" de "${valueOf}"`;
  if (valueName !== undefined) return `El valor "${valueName}"`;
  if (shortName !== undefined) return `El código SKU "${shortName}"`;
  if (plain === 'valueName') return 'El nombre del valor';
  if (plain === 'shortName') return 'El código SKU del valor';
  return 'El nombre del atributo';
}

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
  // --- Exportación a Odoo ---
  {
    pattern: /There are no products to export: every active product is already synced/i,
    translate: () => 'No hay productos que exportar: todos los productos activos ya están sincronizados con Odoo.'
  },
  {
    pattern: /^Product with id \d+ not found$/i,
    translate: () => 'El producto no existe o está inactivo.'
  },
  {
    pattern: /^Products: the name "(.+)" is used by several products \((.+)\); Odoo matches variants to products by name/i,
    translate: (match) => `Productos: el nombre "${match[1]}" lo usan varios productos (${match[2]}). ` +
      'Odoo asigna las variantes a su producto por nombre: cambia el nombre de uno de ellos.'
  },
  {
    pattern: /^Products: "(.+)" \((.+)\) has no active variants$/i,
    translate: (match) => `Productos: "${match[1]}" (${match[2]}) no tiene variantes activas.`
  },
  {
    pattern: /^(.+): "(.+)" needs (\d+) rows, more than maxRowsPerFile \((\d+)\)$/i,
    translate: (match) => `${EXPORT_SHEETS[match[1]] ?? match[1]}: "${match[2]}" necesita ${match[3]} filas y el máximo por archivo ` +
      `es ${match[4]}. Sube el límite en la Configuración de exportación.`
  },
  // Separadores de Odoo (',' y ':') en atributos y valores: validación de los formularios y de la exportación
  {
    pattern: /^(Products: )?(?:attribute "(.+)"|value "(.+)" of "(.+)"|valueName "(.+)"|shortName "(.+)"|(name|valueName|shortName)) cannot contain (.+?) \(Odoo uses it as a separator/i,
    translate: (match) => {
      const chars = match[8].replace(' or ', ' ni ');
      const hint = match[8].includes('","') ? ' Usa, por ejemplo, "19.5" en lugar de "19,5".' : '';
      const label = separatorFieldLabel(match);
      // Tras "Productos:" el campo va en minúscula
      const field = match[1] ? `Productos: ${label.charAt(0).toLowerCase()}${label.slice(1)}` : label;
      return `${field} no puede contener ${chars}: ` +
        `Odoo lo usa como separador al importar las variantes.${hint}`;
    }
  },
  // --- Sincronización con Odoo ---
  {
    pattern: /exportedAt is required/i,
    translate: () => 'Falta la fecha de la exportación. Vuelve a exportar.'
  },
  {
    pattern: /exportedAt must be a valid ISO date/i,
    translate: () => 'La fecha de la exportación guardada no es válida. Vuelve a exportar.'
  },
  {
    pattern: /exportedAt cannot be in the future/i,
    translate: () => 'La fecha de la exportación está en el futuro. Revisa la hora del equipo y vuelve a exportar.'
  },
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
 * Como getApiErrorMessage, pero separa los problemas que la exportación junta con "; " y
 * traduce cada uno. Solo se parte donde empieza el problema de otra hoja ("; Products: …"):
 * algunos mensajes llevan "; " dentro (nombre repetido, colisión de SKU).
 */
export function getApiErrorList(err: HttpErrorResponse, fallback: string): string[] {
  const raw = getRawMessage(err);
  if (!raw) return [fallback];

  return raw
    .split(EXPORT_PROBLEM_SEPARATOR)
    .map(part => part.trim())
    .filter(part => part.length > 0)
    .map(part => translateMessage(part) ?? part);
}
