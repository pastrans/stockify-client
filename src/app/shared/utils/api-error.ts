import { HttpErrorResponse } from '@angular/common/http';

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
  }
];

// Extrae el mensaje de error de la API (`{ error }` o `{ message }`) y lo traduce si es conocido
export function getApiErrorMessage(err: HttpErrorResponse, fallback: string): string {
  const raw: unknown = err.error?.error ?? err.error?.message;
  if (typeof raw !== 'string' || !raw) return fallback;

  for (const { pattern, translate } of FRIENDLY_MESSAGES) {
    const match = raw.match(pattern);
    if (match) return translate(match);
  }
  return raw;
}
