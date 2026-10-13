import { Component, EventEmitter, Input, Output } from '@angular/core';
import { AvailabilityFilter } from '../../models/list-filter.model';

/**
 * Tarjeta de filtros de los listados: pestañas de estado (Todos / Habilitados / Inhabilitados)
 * y, debajo, los campos propios del listado con el botón "Limpiar filtros".
 * Los campos se proyectan como columnas de una fila `.row.g-2`:
 *
 *   <app-list-filters
 *     [availability]="availabilityFilter()"
 *     (availabilityChange)="setAvailabilityFilter($event)"
 *     [canClear]="hasExtraFilters()"
 *     (clear)="clearFilters()"
 *   >
 *     <div class="col-12 col-lg">...</div>
 *   </app-list-filters>
 *
 * Sin campos extra (solo pestañas), usar [showFields]="false".
 */
@Component({
  selector: 'app-list-filters',
  standalone: true,
  templateUrl: './list-filters.component.html'
})
export class ListFiltersComponent {
  @Input() availability: AvailabilityFilter = 'all';
  @Input() showFields = true;
  // Hay filtros extra aplicados: habilita "Limpiar filtros"
  @Input() canClear = false;

  @Output() availabilityChange = new EventEmitter<AvailabilityFilter>();
  @Output() clear = new EventEmitter<void>();

  select(filter: AvailabilityFilter): void {
    if (filter !== this.availability) this.availabilityChange.emit(filter);
  }
}
