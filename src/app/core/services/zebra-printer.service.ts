import { Injectable, signal } from '@angular/core';
import { PrinterStatus, labelTopFromConfig, parseHostStatus, parsePrinterConfig } from '../../shared/utils/zpl';

// Impresora tal como la describe Zebra Browser Print
export interface ZebraDevice {
  name: string;
  uid: string;
  connection: string;
  deviceType: string;
  version: number;
  provider: string;
  manufacturer: string;
}

const PRINTER_STORAGE_KEY = 'stockify.labels.printer';
// Como el supervisor de Bazar-angular: si Browser Print no responde en 2 s, se da por caído
const CONNECTION_TIMEOUT_MS = 2000;
// La respuesta a ~HS tarda un poco en llegar al búfer de lectura
const STATUS_READ_ATTEMPTS = 6;
const STATUS_READ_DELAY_MS = 250;
// Un trabajo grande puede tardar en transferirse por USB
const SEND_TIMEOUT_MS = 30000;
// La hoja de configuración (^HH) es más larga y llega en varias lecturas
const CONFIG_READ_ATTEMPTS = 12;
// Rango de ^LT que admite el firmware de la GK420d
export const LABEL_TOP_RANGE = { min: -120, max: 120 };

export class PrinterError extends Error {}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Conexión con la Zebra a través de Zebra Browser Print (servicio local de Windows, US-L4).
 *
 * Se habla con su API HTTP directamente con fetch, sin los SDK de Zebra: son las mismas llamadas
 * que hacen ellos (/available, /default, /write, /read) y Browser Print acepta CORS.
 * - En http:// se usa el puerto 9100; en https:// el navegador exige el 9101 (certificado propio de
 *   Browser Print, que hay que aceptar una vez: ver la guía de la impresora).
 * - Browser Print pregunta en el equipo si acepta cada dominio nuevo (accepted hosts).
 * - No se usa HttpClient: el authInterceptor enviaría el JWT a este servicio.
 */
@Injectable({
  providedIn: 'root'
})
export class ZebraPrinterService {
  // Impresora elegida (se recuerda en el navegador); null = la predeterminada de Browser Print
  readonly selectedUid = signal<string | null>(this.readStoredUid());

  private get baseUrl(): string {
    return location.protocol === 'https:' ? 'https://localhost:9101' : 'http://localhost:9100';
  }

  // --- IMPRESORAS ---

  async listPrinters(): Promise<ZebraDevice[]> {
    const body = await this.request('/available', { method: 'GET' }, CONNECTION_TIMEOUT_MS);
    const parsed = body ? JSON.parse(body) : {};
    return Array.isArray(parsed?.printer) ? parsed.printer : [];
  }

  async getDefaultPrinter(): Promise<ZebraDevice | null> {
    const body = await this.request('/default?type=printer', { method: 'GET' }, CONNECTION_TIMEOUT_MS);
    const parsed = body ? JSON.parse(body) : null;
    return parsed?.uid ? parsed : null;
  }

  selectPrinter(uid: string | null): void {
    this.selectedUid.set(uid);
    try {
      if (uid) localStorage.setItem(PRINTER_STORAGE_KEY, uid);
      else localStorage.removeItem(PRINTER_STORAGE_KEY);
    } catch {
      // Sin almacenamiento disponible: la elección solo dura esta sesión
    }
  }

  // La impresora elegida si sigue conectada; si no, la predeterminada (RF-30)
  async resolvePrinter(): Promise<ZebraDevice> {
    const uid = this.selectedUid();
    if (uid) {
      const chosen = (await this.listPrinters()).find(device => device.uid === uid);
      if (chosen) return chosen;
    }
    const fallback = await this.getDefaultPrinter();
    if (!fallback) {
      throw new PrinterError('Browser Print no tiene ninguna impresora. Conecta la Zebra y elígela como predeterminada en Browser Print.');
    }
    return fallback;
  }

  // --- ESTADO ---

  // Envía ~HS y lee la respuesta (RF-31). Lanza PrinterError si no hay comunicación
  async checkStatus(device?: ZebraDevice): Promise<{ device: ZebraDevice; status: PrinterStatus }> {
    const printer = device ?? await this.resolvePrinter();

    // Se vacía lo que hubiera quedado sin leer de una consulta anterior
    await this.readRaw(printer).catch(() => '');
    await this.write(printer, '~HS', CONNECTION_TIMEOUT_MS);

    let response = '';
    for (let attempt = 0; attempt < STATUS_READ_ATTEMPTS; attempt++) {
      await wait(STATUS_READ_DELAY_MS);
      response += await this.readRaw(printer);
      const status = parseHostStatus(response);
      if (status) return { device: printer, status };
    }
    throw new PrinterError(
      `La impresora "${printer.name}" no respondió. Revisa que esté encendida, con la luz verde fija y el cable USB conectado.`
    );
  }

  // --- POSICIÓN DE IMPRESIÓN ---

  // Margen superior guardado en la impresora (^LT), en puntos; null si no se pudo leer
  async readLabelTop(device?: ZebraDevice): Promise<number | null> {
    const printer = device ?? await this.resolvePrinter();
    await this.readRaw(printer).catch(() => '');
    await this.write(printer, '^XA^HH^XZ', CONNECTION_TIMEOUT_MS);

    let response = '';
    for (let attempt = 0; attempt < CONFIG_READ_ATTEMPTS; attempt++) {
      await wait(STATUS_READ_DELAY_MS);
      response += await this.readRaw(printer);
      if (/FIRMWARE/i.test(response)) break;
    }
    return labelTopFromConfig(parsePrinterConfig(response));
  }

  /**
   * Guarda el margen superior en la impresora (^LT + ^JUS). Corrige que la impresión salga corrida
   * en vertical aunque el rollo esté calibrado; vale para todas las plantillas. Positivo = más abajo.
   */
  async saveLabelTop(dots: number, device?: ZebraDevice): Promise<void> {
    const value = Math.max(LABEL_TOP_RANGE.min, Math.min(LABEL_TOP_RANGE.max, Math.round(dots)));
    await this.send(`^XA^LT${value}^JUS^XZ`, device);
  }

  // --- IMPRESIÓN ---

  async send(zpl: string, device?: ZebraDevice): Promise<void> {
    const printer = device ?? await this.resolvePrinter();
    await this.write(printer, zpl, SEND_TIMEOUT_MS);
  }

  // --- HTTP con Browser Print ---

  private write(device: ZebraDevice, data: string, timeoutMs: number): Promise<string> {
    return this.request('/write', { method: 'POST', body: JSON.stringify({ device, data }) }, timeoutMs);
  }

  private readRaw(device: ZebraDevice): Promise<string> {
    return this.request('/read', { method: 'POST', body: JSON.stringify({ device }) }, CONNECTION_TIMEOUT_MS);
  }

  private async request(path: string, init: RequestInit, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      // text/plain: es lo que envía el SDK de Zebra y no necesita preflight de CORS
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: init.body ? { 'Content-Type': 'text/plain;charset=UTF-8' } : undefined,
        signal: controller.signal
      });
      const body = await response.text();
      if (!response.ok) {
        throw new PrinterError(body.trim() || `Browser Print respondió con un error (${response.status}).`);
      }
      return body;
    } catch (error) {
      if (error instanceof PrinterError) throw error;
      throw new PrinterError(this.connectionHelp());
    } finally {
      clearTimeout(timer);
    }
  }

  private connectionHelp(): string {
    const https = location.protocol === 'https:'
      ? ' Como Stockify usa HTTPS, además hay que aceptar una vez el certificado en https://localhost:9101/ssl_support.'
      : '';
    return 'No se pudo conectar con Zebra Browser Print. Revisa que esté instalado y abierto (ícono junto al reloj de Windows)' +
      ` y que hayas aceptado este sitio cuando lo preguntó.${https}`;
  }

  private readStoredUid(): string | null {
    try {
      return localStorage.getItem(PRINTER_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
