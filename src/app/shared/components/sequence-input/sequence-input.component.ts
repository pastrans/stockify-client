import { Component, Input, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

/**
 * Campo de secuencia con botones -/+ que suman o restan `step` (por defecto 5)
 * para dejar huecos entre registros. Se usa como cualquier control reactivo:
 *
 *   <app-sequence-input formControlName="sequence" inputId="sequence" [invalid]="...">
 *     <div class="invalid-feedback">Mensaje de error</div>
 *   </app-sequence-input>
 */
@Component({
  selector: 'app-sequence-input',
  standalone: true,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => SequenceInputComponent),
      multi: true
    }
  ],
  template: `
    <div class="input-group has-validation">
      <button
        type="button"
        class="btn btn-outline-secondary"
        title="Restar {{ step }}"
        [disabled]="disabled"
        (click)="adjust(-step)"
      >
        <i class="bi bi-dash-lg"></i>
      </button>
      <input
        type="number"
        class="form-control text-center"
        [id]="inputId"
        [min]="min"
        [value]="value ?? ''"
        [disabled]="disabled"
        [class.is-invalid]="invalid"
        (input)="onInput($event)"
        (blur)="onTouched()"
      >
      <button
        type="button"
        class="btn btn-outline-secondary"
        title="Sumar {{ step }}"
        [disabled]="disabled"
        (click)="adjust(step)"
      >
        <i class="bi bi-plus-lg"></i>
      </button>
      <ng-content></ng-content>
    </div>
    @if (showHint) {
      <div class="form-text small">
        Los botones suman o restan de {{ step }} en {{ step }} para dejar espacio entre registros.
      </div>
    }
  `
})
export class SequenceInputComponent implements ControlValueAccessor {
  @Input() inputId = 'sequence';
  @Input() step = 5;
  @Input() min = 0;
  @Input() invalid = false;
  @Input() showHint = true;

  value: number | null = 0;
  disabled = false;

  private onChange: (value: number | null) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: number | null): void {
    this.value = value ?? null;
  }

  registerOnChange(fn: (value: number | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.value = raw === '' ? null : Number(raw);
    this.onChange(this.value);
  }

  adjust(delta: number): void {
    const current = Number(this.value) || 0;
    // Nunca por debajo del mínimo
    this.value = Math.max(this.min, current + delta);
    this.onChange(this.value);
    this.onTouched();
  }
}
