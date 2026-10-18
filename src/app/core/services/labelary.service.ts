import { Injectable } from '@angular/core';
import { dotsPerMm } from '../../shared/utils/zpl';

const LABELARY_URL = 'https://api.labelary.com/v1/printers';
const MM_PER_INCH = 25.4;

/**
 * Vista previa de etiquetas con Labelary (servicio externo, §7 de los requerimientos).
 *
 * Se usa fetch y no HttpClient a propósito: el authInterceptor añadiría el JWT de Stockify a la
 * petición (se enviaría a un tercero) y un 401 de Labelary cerraría la sesión.
 * El ZPL va como application/x-www-form-urlencoded: Labelary rechaza text/plain (415), y ese tipo
 * no necesita preflight de CORS. Llega tal cual (sin interpretar & + %) y en UTF-8.
 */
@Injectable({
  providedIn: 'root'
})
export class LabelaryService {
  // Devuelve una URL de objeto con el PNG de la primera etiqueta del ZPL; quien la usa la libera
  async preview(zpl: string, widthMm: number, heightMm: number, dpi: number): Promise<string> {
    const width = (widthMm / MM_PER_INCH).toFixed(4);
    const height = (heightMm / MM_PER_INCH).toFixed(4);
    const url = `${LABELARY_URL}/${dotsPerMm(dpi)}dpmm/labels/${width}x${height}/0/`;

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'image/png' },
        body: zpl
      });
    } catch {
      throw new Error('No se pudo conectar con Labelary. Revisa la conexión a internet.');
    }

    if (response.status === 429) {
      throw new Error('Labelary recibió demasiadas peticiones seguidas. Espera unos segundos y vuelve a intentarlo.');
    }
    if (!response.ok) {
      // Labelary explica en texto qué parte del ZPL no entendió
      const detail = (await response.text().catch(() => '')).trim();
      if (/generated no labels/i.test(detail)) {
        throw new Error('El ZPL no genera ninguna etiqueta: revisa que tenga un bloque ^XA … ^XZ con contenido.');
      }
      throw new Error(detail ? `Labelary no pudo dibujar la etiqueta: ${detail}` : 'Labelary no pudo dibujar la etiqueta.');
    }

    return URL.createObjectURL(await response.blob());
  }
}
