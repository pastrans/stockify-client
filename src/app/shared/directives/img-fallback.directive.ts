import { Directive, ElementRef, HostListener, Input, inject } from '@angular/core';

// Imagen local por defecto: solo se muestra en pantalla, nunca se envía al backend
export const IMAGE_PLACEHOLDER = 'assets/images/image-placeholder.svg';

/**
 * Si la imagen no carga (URL rota, expirada o sin acceso), muestra una imagen por defecto
 * en lugar del ícono de imagen rota del navegador.
 *
 *   <img [src]="product.mainImageUrl" appImgFallback>
 *   <img [src]="url" appImgFallback="assets/images/otra.svg">
 *
 * Cuando el [src] enlazado cambia, Angular asigna la nueva URL y se vuelve a intentar.
 */
@Directive({
  selector: 'img[appImgFallback]',
  standalone: true
})
export class ImgFallbackDirective {
  private readonly img = inject<ElementRef<HTMLImageElement>>(ElementRef).nativeElement;

  @Input() appImgFallback: string | '' = '';

  @HostListener('error')
  onError(): void {
    const fallback = this.appImgFallback || IMAGE_PLACEHOLDER;
    // Evita un bucle si la imagen por defecto también falla
    if (this.img.src.endsWith(fallback)) return;
    this.img.src = fallback;
  }
}
