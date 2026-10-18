import { Product, ProductVariant } from '../../models/product.model';
import { LabelPlaceholderName } from './label-placeholders';

// Datos del sistema que no salen del producto
export interface LabelContext {
  storeName: string;
  // Atributos de talla activos, en orden de prioridad (ajustes de etiquetas)
  sizeAttributeIds: number[];
}

/**
 * Precio oculto (RF-13): redondeado a 2 decimales y sin punto, con al menos 4 dígitos.
 * 11.25 → 1125, 2.5 → 0250, 0 → 0000. Con precio ≥ 100 salen 5 dígitos (100.5 → 10050).
 */
export function priceCode(price: number): string {
  const cents = Math.round(Math.max(0, price) * 100);
  return String(cents).padStart(4, '0');
}

// Las plantillas están pensadas para 4 dígitos: con 5 se avisa antes de imprimir (D-03)
export function exceedsPriceCode(price: number): boolean {
  return priceCode(price).length > 4;
}

export function formatSalePrice(price: number): string {
  return (Math.round(price * 100) / 100).toFixed(2);
}

// Valor de un atributo (por nombre) en la variante; vacío si no lo tiene
export function attributeValue(product: Product, variant: ProductVariant, attributeName: string): string {
  const line = product.attributeLines.find(l => l.attributeName === attributeName);
  if (!line) return '';
  return variant.combination.find(value => value.attributeId === line.attributeId)?.valueName ?? '';
}

// Talla (RF-12): el primer atributo de talla, en su orden, que tenga la variante
export function sizeOf(variant: ProductVariant, sizeAttributeIds: number[]): string {
  for (const attributeId of sizeAttributeIds) {
    const value = variant.combination.find(v => v.attributeId === attributeId);
    if (value) return value.valueName;
  }
  return '';
}

// Valores de los marcadores del catálogo para una variante (sin sanear ni recortar)
export function labelValues(product: Product, variant: ProductVariant, context: LabelContext): Record<LabelPlaceholderName, string> {
  return {
    name: product.name,
    displayName: variant.displayName,
    sku: variant.sku,
    // El QR codifica el SKU (referencia interna en Odoo); si cambia, se cambia aquí
    qr: variant.sku,
    barcode: variant.barcode,
    salePrice: formatSalePrice(product.salePrice),
    priceCode: priceCode(product.salePrice),
    size: sizeOf(variant, context.sizeAttributeIds),
    storeName: context.storeName
  };
}
