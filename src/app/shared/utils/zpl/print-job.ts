import { Product, ProductVariant } from '../../models/product.model';
import { PLACEHOLDER_PATTERN, parsePlaceholder } from './label-placeholders';
import { LabelContext, attributeValue, labelValues } from './label-values';
import { sanitizeZplValue, setQuantity, splitTemplate } from './zpl-template';

export interface LabelPrintItem {
  product: Product;
  variant: ProductVariant;
  quantity: number;
}

// Sustituye los marcadores de una etiqueta con los datos de una variante (RF-22)
export function renderLabel(label: string, product: Product, variant: ProductVariant, context: LabelContext): string {
  const values = labelValues(product, variant, context);

  return label.replace(PLACEHOLDER_PATTERN, (_raw, content: string) => {
    const parsed = parsePlaceholder(content);
    // La API no guarda plantillas con marcadores inválidos; si llegara uno, se deja vacío
    if (!parsed) return '';

    const value = parsed.attributeName !== null
      ? attributeValue(product, variant, parsed.attributeName)
      : values[parsed.variable!];

    // Recorte por caracteres (no por unidades UTF-16), para no partir una letra
    const trimmed = parsed.maxLength !== null ? [...value].slice(0, parsed.maxLength).join('') : value;
    return sanitizeZplValue(trimmed);
  });
}

/**
 * Trabajo de impresión completo (RF-23): los bloques de configuración de la plantilla una sola
 * vez y después una etiqueta por variante con cantidad > 0, con sus copias en ^PQ.
 */
export function buildPrintJob(templateZpl: string, items: LabelPrintItem[], context: LabelContext): string {
  const { setup, label } = splitTemplate(templateZpl);

  const labels = items
    .filter(item => item.quantity > 0)
    .map(item => setQuantity(renderLabel(label, item.product, item.variant, context), item.quantity));

  return [setup, ...labels].filter(part => part.length > 0).join('\n');
}

// Total de etiquetas físicas de un trabajo
export function totalLabels(items: LabelPrintItem[]): number {
  return items.reduce((sum, item) => sum + Math.max(0, Math.floor(item.quantity)), 0);
}
