import { AttributeValue } from '../../models/attribute.model';
import { Product, ProductVariant } from '../../models/product.model';
import { attributePlaceholderNames } from './label-placeholders';
import { LabelContext } from './label-values';
import { LabelPrintItem } from './print-job';

// Id ficticio del atributo de talla de los datos de ejemplo
const SAMPLE_SIZE_ATTRIBUTE_ID = -1;

function sampleValue(id: number, attributeId: number, valueName: string): AttributeValue {
  return { id, valueName, shortName: valueName.slice(0, 3).toUpperCase(), colorHex: null, sequence: 0, attributeId, available: true };
}

/**
 * Producto de ejemplo para la vista previa de una plantilla sin elegir un producto real.
 * Cada {{attr.X}} del ZPL recibe un valor de ejemplo con el nombre del atributo.
 */
export function sampleLabelItem(zpl: string, storeName: string): { item: LabelPrintItem; context: LabelContext } {
  const attributeNames = attributePlaceholderNames(zpl);
  const lines = attributeNames.map((name, index) => ({
    id: -(index + 2),
    attributeId: -(index + 2),
    attributeName: name,
    sequence: index + 1,
    values: [sampleValue(-(index + 2), -(index + 2), name)]
  }));
  const size = sampleValue(SAMPLE_SIZE_ATTRIBUTE_ID, SAMPLE_SIZE_ATTRIBUTE_ID, '35 EUR');
  const combination = [size, ...lines.map(line => line.values[0])];

  const variant: ProductVariant = {
    id: 0,
    templateId: 0,
    sku: 'CR-NE-35',
    displayName: 'Crocs Skybang rayada (Negro, 35 EUR)',
    barcode: 'CR-NE-35',
    imageKey: null,
    imageUrl: null,
    stockStore: 0,
    stockWarehouse: 0,
    totalStock: 0,
    isLocked: false,
    syncedAt: null,
    available: true,
    combination
  };

  const product: Product = {
    id: 0,
    name: 'Crocs Skybang rayada',
    skuPrefix: 'CR',
    costPrice: 0,
    salePrice: 11.25,
    description: null,
    mainImageKey: null,
    mainImageUrl: null,
    status: 'draft',
    available: true,
    isLocked: false,
    totalVariantsCount: 1,
    posCategoryIds: [],
    attributeLines: [
      { id: SAMPLE_SIZE_ATTRIBUTE_ID, attributeId: SAMPLE_SIZE_ATTRIBUTE_ID, attributeName: 'Talla', sequence: 0, values: [size] },
      ...lines
    ],
    variants: [variant]
  };

  return {
    item: { product, variant, quantity: 1 },
    context: { storeName: storeName || 'Mi tienda', sizeAttributeIds: [SAMPLE_SIZE_ATTRIBUTE_ID] }
  };
}
