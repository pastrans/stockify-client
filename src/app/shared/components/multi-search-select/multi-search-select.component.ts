import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { SelectOption, filterOptions } from '../../models/select-option.model';

/**
 * Selección múltiple con buscador: el menú queda abierto mientras se marcan opciones
 * y las elegidas se muestran como etiquetas debajo. El valor es un arreglo en el orden de `options`.
 *
 *   <app-multi-search-select
 *     [options]="options"
 *     formControlName="posCategoryIds"
 *     placeholder="Agregar categorías"
 *   ></app-multi-search-select>
 *
 * Una opción `disabled` no se puede marcar ni desmarcar (p. ej. un valor bloqueado por existencias).
 */
@Component({
  selector: 'app-multi-search-select',
  standalone: true,
  imports: [NgbDropdownModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => MultiSearchSelectComponent),
      multi: true
    }
  ],
  templateUrl: './multi-search-select.component.html',
  styleUrls: ['./multi-search-select.component.css']
})
export class MultiSearchSelectComponent<T = number> implements ControlValueAccessor {
  @Input() options: SelectOption<T>[] = [];
  @Input() placeholder = 'Seleccionar';
  @Input() searchPlaceholder = 'Buscar...';
  @Input() emptyText = 'Sin resultados';
  @Input() emptySelectionText = '';
  @Input() size: 'sm' | 'md' = 'sm';
  @Input() invalid = false;
  @Input() inputId?: string;
  // Muestra "Actualizando..." en el menú mientras el padre recarga las opciones
  @Input() loading = false;

  // Se emite al abrir el menú: el padre puede aprovecharlo para recargar las opciones
  @Output() opened = new EventEmitter<void>();

  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  private readonly host = inject(ElementRef<HTMLElement>);

  values: T[] = [];
  disabled = false;
  term = '';
  // El menú se abre al menos tan ancho como el campo
  menuWidth = 0;

  private onChange: (value: T[]) => void = () => {};
  onTouched: () => void = () => {};

  get filtered(): SelectOption<T>[] {
    return filterOptions(this.options, this.term);
  }

  // Etiquetas en el orden de las opciones
  get selectedOptions(): SelectOption<T>[] {
    return this.options.filter(o => this.values.includes(o.value));
  }

  isSelected(option: SelectOption<T>): boolean {
    return this.values.includes(option.value);
  }

  onOpenChange(open: boolean): void {
    if (open) {
      this.menuWidth = this.host.nativeElement.offsetWidth;
      this.term = '';
      this.opened.emit();
      setTimeout(() => this.searchInput?.nativeElement.focus());
    } else {
      this.onTouched();
    }
  }

  onSearch(event: Event): void {
    this.term = (event.target as HTMLInputElement).value;
  }

  // Enter en el buscador marca o desmarca el primer resultado habilitado
  toggleFirst(event: Event): void {
    event.preventDefault();
    const first = this.filtered.find(o => !o.disabled);
    if (first) this.toggle(first);
  }

  toggle(option: SelectOption<T>): void {
    if (option.disabled || this.disabled) return;
    const next = this.isSelected(option)
      ? this.values.filter(v => v !== option.value)
      : [...this.values, option.value];
    this.update(next);
  }

  remove(option: SelectOption<T>): void {
    if (option.disabled || this.disabled) return;
    this.update(this.values.filter(v => v !== option.value));
    this.onTouched();
  }

  private update(values: T[]): void {
    const order = this.options.map(o => o.value);
    this.values = [...values].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    this.onChange(this.values);
  }

  // --- ControlValueAccessor ---

  writeValue(values: T[] | null): void {
    this.values = values ?? [];
  }

  registerOnChange(fn: (value: T[]) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
