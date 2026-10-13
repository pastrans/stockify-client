import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Buscador de los listados (campo con lupa). Se usa como cualquier control reactivo;
 * el debounce lo aplica quien escucha los cambios del formulario:
 *
 *   <app-search-input formControlName="search" inputId="search" placeholder="Nombre o código"></app-search-input>
 */
@Component({
  selector: 'app-search-input',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SearchInputComponent),
      multi: true
    }
  ],
  template: `
    <label [for]="inputId" class="form-label small text-secondary mb-1">{{ label }}</label>
    <div class="input-group input-group-sm">
      <span class="input-group-text"><i class="bi bi-search"></i></span>
      <input
        type="search"
        class="form-control"
        [id]="inputId"
        [placeholder]="placeholder"
        [value]="value"
        [disabled]="disabled"
        (input)="onInput($event)"
        (blur)="onTouched()"
      >
    </div>
  `
})
export class SearchInputComponent implements ControlValueAccessor {
  @Input() inputId = 'search';
  @Input() label = 'Buscar';
  @Input() placeholder = 'Buscar...';

  value = '';
  disabled = false;

  private onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  onInput(event: Event): void {
    this.value = (event.target as HTMLInputElement).value;
    this.onChange(this.value);
  }

  writeValue(value: string | null): void {
    this.value = value ?? '';
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }
}
