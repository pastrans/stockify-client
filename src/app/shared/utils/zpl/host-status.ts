/**
 * Estado de la impresora a partir de la respuesta a ~HS (Host Status Return). Son tres cadenas
 * entre STX (\x02) y ETX (\x03), con campos separados por coma:
 *   1: aaa,b,c,dddd,eee,f,g,h,iii,j,k,l  → b sin papel, c en pausa, dddd largo de etiqueta (puntos),
 *      eee formatos en el búfer, f búfer lleno, j RAM dañada, k temperatura baja, l temperatura alta
 *   2: mmm,n,o,p,q,r,s,t,uuuuuuuu,v,www  → o cabezal abierto, p sin ribbon, q transferencia térmica,
 *      uuuuuuuu etiquetas que faltan por imprimir del último trabajo
 */
export interface PrinterStatus {
  // Lista para imprimir: sin ningún problema que impida imprimir
  ready: boolean;
  paperOut: boolean;
  paused: boolean;
  headOpen: boolean;
  ribbonOut: boolean;
  // Largo de etiqueta configurado en la impresora, en puntos
  labelLengthDots: number | null;
  // Etiquetas de un trabajo anterior que aún no se imprimieron
  labelsRemaining: number;
  // Problemas que impiden imprimir, en español
  problems: string[];
  // Avisos que no impiden imprimir
  warnings: string[];
}

function statusStrings(raw: string): string[][] {
  const blocks = [...raw.matchAll(/\x02([^\x03]*)\x03/g)].map(match => match[1]);
  // Si el servicio devolvió el texto sin STX/ETX, se separa por líneas
  const lines = blocks.length > 0 ? blocks : raw.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  return lines.map(line => line.split(',').map(field => field.trim()));
}

const flag = (value: string | undefined): boolean => value === '1';

// null si la respuesta no tiene el formato de ~HS
export function parseHostStatus(raw: string): PrinterStatus | null {
  const [first, second] = statusStrings(raw);
  if (!first || first.length < 12 || !second || second.length < 9) return null;

  const paperOut = flag(first[1]);
  const paused = flag(first[2]);
  const labelLength = Number(first[3]);
  const bufferFull = flag(first[5]);
  const corruptRam = flag(first[9]);
  const underTemperature = flag(first[10]);
  const overTemperature = flag(first[11]);
  const headOpen = flag(second[2]);
  // El ribbon solo importa en transferencia térmica (q = 1); la GK420d suele ir en térmica directa
  const thermalTransfer = flag(second[4]);
  const ribbonOut = thermalTransfer && flag(second[3]);
  const labelsRemaining = Number(second[8]) || 0;

  const problems: string[] = [];
  if (paperOut) problems.push('No tiene etiquetas o el papel no está bien colocado.');
  if (headOpen) problems.push('El cabezal está abierto: ciérralo hasta que haga clic.');
  if (paused) problems.push('Está en pausa: pulsa el botón de avance para reanudarla.');
  if (ribbonOut) problems.push('Se acabó el ribbon.');
  if (overTemperature) problems.push('El cabezal está demasiado caliente: espera unos minutos.');
  if (underTemperature) problems.push('El cabezal está demasiado frío.');
  if (bufferFull) problems.push('La memoria de recepción está llena: apaga y enciende la impresora.');
  if (corruptRam) problems.push('La memoria de la impresora está dañada: apágala y vuelve a encenderla.');

  const warnings: string[] = [];
  if (labelsRemaining > 0) {
    warnings.push(`La impresora tiene ${labelsRemaining} etiqueta(s) pendientes de un trabajo anterior.`);
  }

  return {
    ready: problems.length === 0,
    paperOut,
    paused,
    headOpen,
    ribbonOut,
    labelLengthDots: Number.isFinite(labelLength) && labelLength > 0 ? labelLength : null,
    labelsRemaining,
    problems,
    warnings
  };
}
