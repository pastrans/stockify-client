// src/app/core/utils/app-validators.ts
import { AbstractControl, ValidationErrors } from '@angular/forms';

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
}