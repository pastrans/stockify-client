import { HttpErrorResponse } from '@angular/common/http';
import Swal from 'sweetalert2';
import { getApiErrorList } from './api-error';

/**
 * Muestra el error de la API en un SweetAlert. Si trae varios problemas (separados por "; "),
 * los muestra como lista. El contenido se arma con textContent: los mensajes traen nombres
 * de productos y valores escritos por el usuario.
 */
export function showApiErrorAlert(err: HttpErrorResponse, title: string, fallback: string): Promise<unknown> {
  const messages = getApiErrorList(err, fallback);

  if (messages.length === 1) {
    return Swal.fire({ theme: 'dark', icon: 'error', title, text: messages[0], confirmButtonText: 'Entendido' });
  }

  const container = document.createElement('div');
  container.className = 'text-start small';

  const intro = document.createElement('p');
  intro.textContent = `Hay ${messages.length} problemas que corregir antes de exportar:`;
  container.appendChild(intro);

  const list = document.createElement('ul');
  list.className = 'mb-0 ps-3';
  for (const message of messages) {
    const item = document.createElement('li');
    item.className = 'mb-1';
    item.textContent = message;
    list.appendChild(item);
  }
  container.appendChild(list);

  return Swal.fire({ theme: 'dark', icon: 'error', title, html: container, confirmButtonText: 'Entendido', width: '40rem' });
}
