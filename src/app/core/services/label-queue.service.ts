import { Injectable, computed, signal } from '@angular/core';

// Lo que se guarda de cada variante en la cola: los datos del producto se cargan al abrirla (RF-29)
export interface LabelQueueEntry {
  variantId: number;
  productId: number;
  quantity: number;
}

const QUEUE_STORAGE_KEY = 'stockify.labels.queue';

/**
 * Cola de impresión de etiquetas (US-L5/US-L6). Vive en el navegador (D-09): es la cola del equipo
 * que tiene la Zebra conectada, sobrevive a recargas y no se comparte.
 */
@Injectable({
  providedIn: 'root'
})
export class LabelQueueService {
  readonly entries = signal<LabelQueueEntry[]>(this.readStored());

  // Etiquetas físicas en la cola (para el indicador del menú)
  readonly totalLabels = computed(() => this.entries().reduce((sum, entry) => sum + entry.quantity, 0));

  // Agrega variantes; si una ya está en la cola, se suman las cantidades
  add(items: LabelQueueEntry[]): void {
    const next = [...this.entries()];
    for (const item of items) {
      if (!(item.quantity > 0)) continue;
      const existing = next.findIndex(entry => entry.variantId === item.variantId);
      if (existing >= 0) {
        next[existing] = { ...next[existing], quantity: next[existing].quantity + item.quantity };
      } else {
        next.push({ variantId: item.variantId, productId: item.productId, quantity: item.quantity });
      }
    }
    this.save(next);
  }

  setQuantity(variantId: number, quantity: number): void {
    this.save(this.entries().map(entry => entry.variantId === variantId ? { ...entry, quantity: Math.max(0, Math.floor(quantity)) } : entry));
  }

  setAllQuantities(quantity: number): void {
    const value = Math.max(0, Math.floor(quantity));
    this.save(this.entries().map(entry => ({ ...entry, quantity: value })));
  }

  remove(variantIds: number[]): void {
    const removed = new Set(variantIds);
    this.save(this.entries().filter(entry => !removed.has(entry.variantId)));
  }

  clear(): void {
    this.save([]);
  }

  private save(entries: LabelQueueEntry[]): void {
    this.entries.set(entries);
    try {
      localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // Sin almacenamiento disponible: la cola solo dura esta sesión
    }
  }

  private readStored(): LabelQueueEntry[] {
    try {
      const stored = JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY) ?? '[]');
      if (!Array.isArray(stored)) return [];
      return stored
        .filter(entry => Number.isInteger(entry?.variantId) && Number.isInteger(entry?.productId))
        .map(entry => ({ variantId: entry.variantId, productId: entry.productId, quantity: Math.max(0, Math.floor(Number(entry.quantity) || 0)) }));
    } catch {
      return [];
    }
  }
}
