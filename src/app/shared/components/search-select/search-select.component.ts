import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, forwardRef, inject } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import { NgbDropdown, NgbDropdownModule } from '@ng-bootstrap/ng-bootstrap';
import { SelectOption, filterOptions } from '../../models/select-option.model';

/**
 * Select de una opción con buscador. Se usa como cualquier control reactivo:
 *
 *   <app-search-select
 *     [options]="options"
 *     formControlName="attributeId"
 *     placeholder="Seleccionar atributo"
 *     (selectionChange)="onSelected($event)"
 *   ></app-search-select>
 */
@Component({
  selector: 'app-search-select',
  standalone: true,
  imports: [NgbDropdownModule],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchSelectComponent),
      multi: true
    }
  ],
  templateUrl: './search-select.component.html',
  styleUrls: ['./search-select.component.css']
})
export class SearchSelectComponent<T = number> implements ControlValueAccessor {
  @Input() options: SelectOption<T>[] = [];
  @Input() placeholder = 'Seleccionar';
  @Input() searchPlaceholder = 'Buscar...';
  @Input() emptyText = 'Sin resultados';
  @Input() size: 'sm' | 'md' = 'sm';
  @Input() invalid = false;
  @Input() inputId?: string;
  // Muestra "Actualizando..." en el menú mientras el padre recarga las opciones
  @Input() loading = false;

  // Se emite al abrir el menú: el padre puede aprovecharlo para recargar las opciones
  @Output() opened = new EventEmitter<void>();

  // Se emite solo cuando el usuario elige una opción (no al escribir el valor desde el formulario)
  @Output() selectionChange = new EventEmitter<T>();

  @ViewChild(NgbDropdown) private dropdown?: NgbDropdown;
  @ViewChild('searchInput') private searchInput?: ElementRef<HTMLInputElement>;

  private readonly host = inject(ElementRef<HTMLElement>);

  value: T | null = null;
  disabled = false;
  term = '';
  // El menú se abre al menos tan ancho como el campo
  menuWidth = 0;

  private onChange: (value: T | null) => void = () => {};
  onTouched: () => void = () => {};

  get selected(): SelectOption<T> | undefined {
    return this.options.find(o => o.value === this.value);
  }

  get filtered(): SelectOption<T>[] {
    return filterOptions(this.options, this.term);
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

  // Enter en el buscador elige el primer resultado habilitado
  selectFirst(event: Event): void {
    event.preventDefault();
    const first = this.filtered.find(o => !o.disabled);
    if (first) this.select(first);
  }

  select(option: SelectOption<T>): void {
    if (option.disabled) return;
    this.value = option.value;
    this.onChange(option.value);
    this.selectionChange.emit(option.value);
    this.dropdown?.close();
  }

  // --- ControlValueAccessor ---

  writeValue(value: T | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: T | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
