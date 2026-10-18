// Utilidades sobre el texto ZPL de una plantilla (sin datos de producto)

const MM_PER_INCH = 25.4;

// Puntos de impresora por milímetro: a 203 dpi son 8
export function dotsPerMm(dpi: number): number {
  return Math.round(dpi / MM_PER_INCH);
}

export interface TemplateParts {
  // Bloques ^XA … ^XZ anteriores a la etiqueta (configuración de la impresora): se envían una vez
  setup: string;
  // La etiqueta: el último bloque ^XA … ^XZ (RF-20)
  label: string;
}

export function splitTemplate(zpl: string): TemplateParts {
  const upper = zpl.toUpperCase();
  const end = upper.lastIndexOf('^XZ');
  const start = end === -1 ? -1 : upper.lastIndexOf('^XA', end);
  if (start === -1) return { setup: '', label: zpl.trim() };

  return {
    setup: zpl.slice(0, start).trim(),
    label: zpl.slice(start, end + 3).trim()
  };
}

// En ZPL, '^' y '~' dentro de un dato inician comandos y rompen la etiqueta (RF-14)
export function sanitizeZplValue(value: string): string {
  return value.replace(/[\^~]/g, ' ');
}

// Copias de una etiqueta con ^PQ: cambia la primera cifra o lo añade antes de ^XZ (RF-24)
export function setQuantity(label: string, quantity: number): string {
  const copies = Math.max(1, Math.floor(quantity));
  if (/\^PQ\d*/i.test(label)) {
    return label.replace(/\^PQ\d*/i, `^PQ${copies}`);
  }
  const end = label.toUpperCase().lastIndexOf('^XZ');
  return end === -1 ? label : `${label.slice(0, end)}^PQ${copies}\n${label.slice(end)}`;
}

function readDots(label: string, command: 'PW' | 'LL'): number | null {
  const match = label.match(new RegExp(`\\^${command}(\\d+)`, 'i'));
  return match ? Number(match[1]) : null;
}

function dotsToMm(dots: number, dpi: number): number {
  return Math.round((dots * MM_PER_INCH / dpi) * 10) / 10;
}

function mmToDots(mm: number, dpi: number): number {
  return Math.round(mm * dpi / MM_PER_INCH);
}

// Tamaño en mm a partir de ^PW (ancho) y ^LL (alto) de la etiqueta, si los trae (RF-17)
export function sizeFromZpl(zpl: string, dpi: number): { widthMm: number; heightMm: number } | null {
  const { label } = splitTemplate(zpl);
  const width = readDots(label, 'PW');
  const height = readDots(label, 'LL');
  if (width === null || height === null) return null;
  return { widthMm: dotsToMm(width, dpi), heightMm: dotsToMm(height, dpi) };
}

// Advertencias del editor que no impiden guardar (RF-19, RF-21)
export function templateWarnings(zpl: string, widthMm: number | null, heightMm: number | null, dpi: number): string[] {
  const warnings: string[] = [];
  const { label } = splitTemplate(zpl);

  if (!/\^CI28/i.test(zpl)) {
    warnings.push('Falta ^CI28 (UTF-8): los acentos y la ñ pueden imprimirse mal.');
  }
  if (/\^JUS/i.test(zpl)) {
    warnings.push('La plantilla tiene ^JUS: guarda la configuración en la impresora en cada impresión. Es mejor configurarla una sola vez.');
  }

  // Tolerancia de 2 puntos por el redondeo entre mm y puntos
  const checks: [string, number | null, number | null][] = [
    ['ancho (^PW)', readDots(label, 'PW'), widthMm],
    ['alto (^LL)', readDots(label, 'LL'), heightMm]
  ];
  for (const [field, dots, mm] of checks) {
    if (dots === null || mm === null || !(mm > 0)) continue;
    const expected = mmToDots(mm, dpi);
    if (Math.abs(dots - expected) > 2) {
      warnings.push(`El ${field} del ZPL es de ${dots} puntos (${dotsToMm(dots, dpi)} mm), pero la plantilla mide ${mm} mm (${expected} puntos).`);
    }
  }

  return warnings;
}
