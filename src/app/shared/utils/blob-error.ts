import { HttpErrorResponse } from '@angular/common/http';
import { MonoTypeOperatorFunction, catchError, from, of, switchMap, throwError } from 'rxjs';

/**
 * Con responseType: 'blob' el cuerpo del error también llega como Blob. Este operador lo
 * lee como JSON y relanza el error con el cuerpo ya parseado, para que getApiErrorMessage
 * funcione igual que con el resto de peticiones.
 */
export function parseBlobError<T>(): MonoTypeOperatorFunction<T> {
  return catchError((err: unknown) => {
    if (!(err instanceof HttpErrorResponse) || !(err.error instanceof Blob)) {
      return throwError(() => err);
    }

    return from(err.error.text()).pipe(
      catchError(() => of(null)),
      switchMap(text => {
        let body: unknown = text;
        try {
          body = text ? JSON.parse(text) : null;
        } catch {
          // No es JSON: se conserva el texto tal cual
        }
        return throwError(() => new HttpErrorResponse({
          error: body,
          headers: err.headers,
          status: err.status,
          statusText: err.statusText,
          url: err.url ?? undefined
        }));
      })
    );
  });
}
