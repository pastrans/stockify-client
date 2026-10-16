// src/app/core/utils/app-validators.ts
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export class AppValidators {
  /**
   * Validador para contraseña robusta:
   * - Mínimo 8 caracteres
   * - Al menos 1 letra mayúscula
   * - Al menos 1 número
   * - Al menos 1 carácter especial
   */
  static strongPassword(control: AbstractControl): ValidationErrors | null {
    const value = control.value;
    
    // Si está vacío, no marcamos error aquí. (Validators.required se encarga de eso)
    if (!value) return null;

    const hasUpperCase = /[A-Z]/.test(value);
    const hasNumber = /[0-9]/.test(value);
    const hasSpecial = /[^A-Za-z0-9]/.test(value);
    const isValidLength = value.length >= 8;

    if (!hasUpperCase || !hasNumber || !hasSpecial || !isValidLength) {
      // Retornamos un objeto de error personalizado
      return { strongPassword: true };
    }

    return null; // Es válida
  }

  /**
   * Expresión regular para validar montos monetarios (hasta 2 decimales).
   * Se exporta como constante para usarla con Validators.pattern()
   */
  static readonly amountFormat = /^\d+(\.\d{1,2})?$/;

  /**
   * Validador de cantidad máxima de decimales (por defecto 2, para montos: 10, 10.5, 10.99).
   * Error: { maxDecimals: { max, actual } }. El signo y el mínimo se validan aparte (Validators.min).
   *
   *   costPrice: [0, [Validators.required, Validators.min(0), AppValidators.maxDecimals(2)]]
   */
  static maxDecimals(max: number = 2): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (value === null || value === undefined || value === '') return null;

      const text = String(value);
      if (!/^-?\d+(\.\d+)?$/.test(text)) return null;

      const actual = text.includes('.') ? text.split('.')[1].length : 0;
      return actual > max ? { maxDecimals: { max, actual } } : null;
    };
  }

  /**
   * Validador de grupo: el campo `field` debe ser estrictamente menor que `otherField`.
   * Se aplica al FormGroup y el error queda en el grupo: { lessThan: { field, otherField } }.
   * Si alguno de los dos está vacío no marca error (de eso se encarga Validators.required).
   *
   *   this.fb.group({ ... }, { validators: AppValidators.lessThan('costPrice', 'salePrice') })
   */
  static lessThan(field: string, otherField: string): ValidatorFn {
    return (group: AbstractControl): ValidationErrors | null => {
      const value = group.get(field)?.value;
      const other = group.get(otherField)?.value;
      if (value === null || value === '' || other === null || other === '') return null;
      if (value === undefined || other === undefined) return null;

      return Number(value) < Number(other) ? null : { lessThan: { field, otherField } };
    };
  }

  /**
   * Validador de separadores de Odoo: al importar las variantes, Odoo parte "Atributo:Valor, …"
   * en cada "," y cada par en el primer ":". Los valores no admiten ","; el nombre del
   * atributo tampoco admite ":". Error: { odooSeparators: { found } }.
   *
   *   name: ['', [Validators.required, AppValidators.noOdooSeparators([',', ':'])]]
   */
  static noOdooSeparators(separators: string[] = [',']): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = control.value;
      if (typeof value !== 'string' || !value) return null;

      const found = separators.filter(separator => value.includes(separator));
      return found.length > 0 ? { odooSeparators: { found } } : null;
    };
  }
}
