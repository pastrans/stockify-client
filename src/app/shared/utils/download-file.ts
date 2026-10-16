// Descarga un Blob en el navegador con el nombre indicado
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Se libera después del clic para no cortar la descarga en algunos navegadores
  setTimeout(() => URL.revokeObjectURL(url));
}

// Nombre del archivo de la cabecera Content-Disposition (filename* o filename)
export function getFileNameFromDisposition(disposition: string | null, fallback: string): string {
  if (!disposition) return fallback;

  const encoded = disposition.match(/filename\*\s*=\s*(?:UTF-8'')?([^;]+)/i);
  if (encoded) {
    try {
      return decodeURIComponent(encoded[1].trim().replace(/^"|"$/g, ''));
    } catch {
      // Codificación inválida: se intenta con filename
    }
  }

  const plain = disposition.match(/filename\s*=\s*"([^"]+)"|filename\s*=\s*([^;]+)/i);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name || fallback;
}
