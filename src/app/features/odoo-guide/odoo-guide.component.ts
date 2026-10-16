import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface ImportFile {
  order: number;
  name: string;
  description: string;
  // Ruta de menús de Odoo donde se importa
  menu: string[];
  notes: string[];
}

// Guía estática de importación en Odoo 19 (RF-19, US-F6): no necesita endpoint
@Component({
  selector: 'app-odoo-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './odoo-guide.component.html',
  styleUrls: ['./odoo-guide.component.css']
})
export class OdooGuideComponent {
  readonly files: ImportFile[] = [
    {
      order: 1,
      name: 'Product Attribute',
      description: 'Atributos y sus valores (talla, color, marca…).',
      menu: ['Inventario', 'Configuración', 'Atributos'],
      notes: [
        'Solo trae los atributos y valores que usan los productos exportados.',
        'Los valores de color llevan su código HEX en la columna "Values/Color".'
      ]
    },
    {
      order: 2,
      name: 'Point of Sale Category',
      description: 'Categorías del Punto de Venta, con sus categorías padre.',
      menu: ['Punto de Venta', 'Configuración', 'Categorías de PdV'],
      notes: [
        'Las categorías padre van antes que sus hijas: Odoo las crea en orden aunque estén en el mismo archivo.',
        'La columna "Linked PoS Configurations" puede quedar sin mapear según la edición de Odoo. Es normal: el resto se importa.'
      ]
    },
    {
      order: 3,
      name: 'Products',
      description: 'Plantillas de producto y una fila por cada variante, con precios, SKU, códigos de barras e imágenes.',
      menu: ['Inventario', 'Productos', 'Productos'],
      notes: [
        'Odoo asigna las variantes a su producto por nombre: por eso Stockify no exporta dos productos con el mismo nombre.',
        'Las imágenes se descargan desde su URL al importar: puede tardar un poco con muchos productos.'
      ]
    },
    {
      order: 4,
      name: 'Existencias',
      description: 'Cantidad contada de cada variante en Tienda y en Bodega.',
      menu: ['Inventario', 'Operaciones', 'Inventario físico'],
      notes: [
        'Solo trae las variantes que aún no están en Odoo y con cantidad mayor que 0. Si no hay ninguna, el archivo no viene en el .zip.',
        'Odoo lo importa como cantidad contada: la existencia no cambia hasta pulsar "Aplicar todo".'
      ]
    }
  ];
}
