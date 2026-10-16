# Exportación a Odoo: trabajo pendiente en el frontend

**Estado:** listo para empezar · **Fecha:** 2026-10-16
**Backend:** terminado en `../Stockify-API` (commit `b2aaffe`). Requerimientos completos y decisiones en `../Stockify-API/docs/odoo-export-requirements.md`; colección de Postman en `../Stockify-API/docs/postman/Stockify-API.postman_collection.json`.

## Cómo usar este documento

Se trabaja **una historia por vez**, en el orden de la tabla. Para cada una:

1. Leer este documento, el `CLAUDE.md` del cliente y, si hace falta, el documento de requerimientos del backend.
2. Implementar la historia siguiendo las convenciones del `CLAUDE.md` (standalone, Signals, `inject()`, Bootstrap dark, textos en español, errores con `getApiErrorMessage`).
3. Verificar contra la API local (`npm run dev` en `../Stockify-API`, puerto 3001) y marcar la casilla de la historia.

| # | Historia | Depende de |
|---|---|---|
| US-F1 | Modelos y servicios de exportación | — |
| US-F2 | Pantalla de configuración de exportación | US-F1 |
| US-F3 | Exportación total desde el listado de productos | US-F1 |
| US-F4 | Marcar como sincronizada una exportación completa | US-F3 |
| US-F5 | Exportar, sincronizar y des-sincronizar un producto | US-F1 |
| US-F6 | Guía de importación en Odoo | — |
| US-F7 | Mensajes de error traducidos | US-F2…US-F5 |
| US-F8 | Actualizar el `CLAUDE.md` del cliente | todas |

## Cómo funciona la exportación (resumen)

- La importación en Odoo la hace una persona a mano, con archivos `.xlsx` que la API entrega dentro de un `.zip`. El destino es **Odoo 19**.
- El `.zip` trae hasta cuatro archivos, numerados en el **orden obligatorio de importación**: `1-Product Attribute-NN.xlsx`, `2-Point of Sale Category-NN.xlsx`, `3-Products-NN.xlsx`, `4-Existencias-NN.xlsx`. `NN` es el número de parte cuando un archivo supera el límite de filas configurado.
- **Exportar no cambia el estado** de los productos. Después de importar sin errores, el usuario los marca como sincronizados (`synced`): uno por uno o todos los de una exportación.
- Las **existencias se exportan una sola vez por variante**: solo las variantes que aún no están en Odoo (`syncedAt` vacío) y con cantidad > 0. Después, el stock se ajusta en Odoo (Inventario físico).
- **Exportación total**: productos activos no sincronizados. **Exportar un producto**: cualquier producto activo, sincronizado o no (sirve para subir variantes o valores nuevos de un producto ya sincronizado).

## Contrato de la API

Todo bajo `/api/v1`, con JWT de `ADMIN`. Errores: `{ error: string }` en inglés; 400 para reglas de negocio, 404 si no existe.

### Ajustes de exportación

`GET /settings/export` → 200

```json
{
  "language": "en",
  "warehouseLocation": "WH/Stock",
  "storeLocation": "LMG/Stock",
  "linkedPosConfig": "Clothes Shop",
  "maxRowsPerFile": 1000,
  "externalIdPrefix": "stockify",
  "attributeCategory": "General Features",
  "updatedAt": null
}
```

- `updatedAt: null` = nunca se guardaron; son los valores por defecto.

`PUT /settings/export` → 200 con el mismo objeto. Acepta **campos parciales** (solo los que se envían cambian).

| Campo | Regla | Significado |
|---|---|---|
| `language` | `en` \| `es` | Idioma de los encabezados de los archivos (es = español de Latinoamérica de Odoo) |
| `warehouseLocation` | texto no vacío | Ubicación de Odoo para el stock de **Bodega** (nombre completo, p. ej. `WH/Stock`) |
| `storeLocation` | texto no vacío | Ubicación de Odoo para el stock de **Tienda** |
| `linkedPosConfig` | texto no vacío | Nombre del Punto de Venta de Odoo (va en el archivo de categorías) |
| `maxRowsPerFile` | entero > 0 | Máximo de filas por archivo; si se supera, se parte en `-01`, `-02`… |
| `externalIdPrefix` | letras, números, `_` y `-` | Prefijo de los IDs externos. **No se puede cambiar si hay algún producto sincronizado** |
| `attributeCategory` | texto no vacío | Columna "Category" del archivo de atributos |

### Exportaciones (respuesta binaria)

| Método y ruta | Descripción |
|---|---|
| `POST /exports/full` | `.zip` de todos los productos activos no sincronizados. 400 si no hay ninguno. |
| `POST /exports/products/:id` | `.zip` de un producto activo. 404 si no existe o está inactivo. |

- Respuesta 200: `Content-Type: application/zip`, cuerpo binario.
- Cabeceras (expuestas por CORS):
  - `Content-Disposition: attachment; filename="stockify-export-full-2026-10-16.zip"` → nombre del archivo a descargar.
  - `X-Export-Generated-At: 2026-10-16T20:46:46.853Z` → hora de la exportación, para US-F4.
- En Angular: `http.post(url, null, { responseType: 'blob', observe: 'response' })`.
- **Errores con `responseType: 'blob'`**: el cuerpo del error también llega como `Blob`. Hay que leerlo (`await err.error.text()` y `JSON.parse`) antes de pasar el mensaje a `getApiErrorMessage`.
- Un 400 de exportación puede traer **varios problemas en un solo mensaje, separados por `; `**. Mostrarlos como lista.

### Sincronización

| Método y ruta | Cuerpo | Respuesta |
|---|---|---|
| `PATCH /products/sync` | `{ "productIds": [1, 2] }` (o `productId`) | `{ "updatedCount": 2, "syncedIds": [1, 2] }` |
| `PATCH /products/sync-exported` | `{ "exportedAt": "<X-Export-Generated-At>" }` | `{ "updatedCount": 3, "syncedIds": [2, 5, 6], "skippedIds": [3] }` |
| `PATCH /products/:id/unsync` | — | El producto; si volvió a `draft`, además `"warning": "..."` |

- `sync-exported` marca solo los productos activos, no sincronizados, que **no cambiaron después de la exportación** (ni el producto ni sus variantes). `skippedIds` son los que cambiaron: hay que volver a exportarlos antes de marcarlos.
- `sync` también llena `syncedAt` en las variantes activas que no lo tenían (variantes nuevas de un producto ya sincronizado).
- `unsync` deja el producto en `stock_locked` si tiene stock y en `draft` si no. En `draft` la respuesta trae `warning` (en inglés): el producto ya existe en Odoo, y cambiar sus atributos o su prefijo puede regenerar variantes y duplicarlas en Odoo.

### Cambios en los modelos de producto

- `Product.externalId` y `ProductVariant.externalId` **ya no vienen** en las respuestas: quitarlos de `shared/models/product.model.ts`.
- `ProductVariant.syncedAt: string | null` (nuevo): primera vez que la variante se marcó como sincronizada (ya está en Odoo).

### Validación nueva en atributos

La API rechaza con 400:
- `,` o `:` en el **nombre del atributo**.
- `,` en el **nombre del valor** (`valueName`) y en el `shortName`. Ejemplo: usar `19.5 MEX` en lugar de `19,5 MEX`.

Odoo usa esos caracteres como separadores al importar las variantes. Conviene validarlo también en el formulario de atributos (`AppValidators`) para avisar antes de guardar.

---

## US-F1 · Modelos y servicios de exportación

**Como** desarrollador, **quiero** los modelos y servicios del frontend alineados con la API, **para** construir las pantallas de exportación.

- [x] `shared/models/product.model.ts`: quitar `externalId` (producto y variante) y agregar `syncedAt: string | null` a la variante.
- [x] `shared/models/export-settings.model.ts`: `ExportSettings`, `ExportLanguage` (`'en' | 'es'`) y `UpdateExportSettings` (parcial).
- [x] `core/services/settings.service.ts`: `getExportSettings()` y `updateExportSettings(data)`.
- [x] `core/services/export.service.ts`: `exportFull()` y `exportProduct(id)`. Ambos devuelven `{ blob, fileName, generatedAt }`, leyendo las cabeceras `Content-Disposition` y `X-Export-Generated-At`.
- [x] Utilidad para descargar un `Blob` con su nombre (`URL.createObjectURL` + `<a download>`).
- [x] `product.service.ts`: `syncProducts(ids)`, `syncExported(exportedAt)` y `unsyncProduct(id)` con sus tipos de respuesta (`SyncProductsResult`, `SyncExportedProductsResult`, producto con `warning?`).
- [x] Manejo de errores con `responseType: 'blob'` (leer el `Blob` como JSON) para que `getApiErrorMessage` funcione con las exportaciones.

**Hecho cuando:** compila, ninguna pantalla usa `externalId` y los servicios responden contra la API local.

## US-F2 · Pantalla de configuración de exportación

**Como** administrador, **quiero** configurar cómo se generan los archivos de Odoo, **para** que coincidan con mi instalación (ubicaciones, punto de venta, idioma).

- [x] Ruta nueva (p. ej. `/settings`) con entrada en el menú del `main-layout`.
- [x] Formulario reactivo con los siete campos y sus validaciones (tabla de ajustes).
- [x] Si `updatedAt` es `null`, indicar que se están usando los valores por defecto.
- [x] Guardar con `PUT` y mostrar confirmación (sweetalert2).
- [x] Explicar en la propia pantalla que el prefijo de IDs externos no se puede cambiar una vez que hay productos sincronizados, y mostrar el error traducido si la API lo rechaza.
- [x] Ayudas cortas por campo: ubicaciones con el nombre completo de Odoo (`WH/Stock`), límite de filas, idioma de los encabezados.

**Hecho cuando:** se pueden leer y guardar los ajustes, y los errores de validación se ven en español.

## US-F3 · Exportación total desde el listado de productos

**Como** administrador, **quiero** descargar en un `.zip` todos los productos pendientes de Odoo, **para** hacer la carga inicial.

- [x] Botón **"Exportar a Odoo"** en el listado de productos.
- [x] Llama a `POST /exports/full`, descarga el `.zip` con su nombre y muestra un aviso con los pasos siguientes (importar en orden y luego marcar como sincronizados), con enlace a la guía (US-F6).
- [x] Guarda `generatedAt` de la última exportación (Signal en un servicio y `localStorage`, envuelto en `try/catch`) para US-F4.
- [x] Estado de carga mientras se genera (puede tardar con muchos productos).
- [x] Errores 400 mostrados como lista (los problemas vienen separados por `; `), p. ej. nombres de producto repetidos o valores con coma.

**Hecho cuando:** se descarga el `.zip` y los errores se ven claros.

## US-F4 · Marcar como sincronizada una exportación completa

**Como** administrador, **quiero** marcar de una vez como sincronizados los productos que acabo de importar en Odoo, **para** no hacerlo uno por uno.

- [x] Botón **"Marcar exportación como sincronizada"** visible cuando hay una exportación guardada (US-F3). Muestra la fecha y hora de esa exportación.
- [x] Confirmación previa: "¿Importaste los 4 archivos en Odoo sin errores y aplicaste el inventario?".
- [x] Llama a `PATCH /products/sync-exported` con `generatedAt`.
- [x] Resultado: cuántos se marcaron y, si `skippedIds` no está vacío, la lista de productos que **cambiaron después de exportar** (con enlace a cada uno) y el aviso de que hay que volver a exportarlos.
- [x] Al terminar, limpia la exportación guardada y recarga el listado.

**Hecho cuando:** después de importar, un clic marca los productos correctos y los modificados quedan señalados.

## US-F5 · Exportar, sincronizar y des-sincronizar un producto

**Como** administrador, **quiero** exportar un solo producto y controlar su estado de sincronización, **para** subir productos nuevos o variantes nuevas sin una exportación total.

- [x] En la pantalla del producto (o en sus acciones del listado): **"Exportar a Odoo"** (`POST /exports/products/:id`), con la misma descarga y manejo de errores que US-F3.
- [x] **"Marcar como sincronizado"** (`PATCH /products/sync` con su id), con confirmación.
- [x] **"Quitar sincronización"** (`PATCH /products/:id/unsync`), solo si está `synced`, con confirmación. Si la respuesta trae `warning`, mostrarlo traducido como alerta de advertencia (no de éxito).
- [x] En la matriz de variantes, indicar cuáles ya están en Odoo (`syncedAt`) y cuáles están pendientes (sus existencias se exportarán).
- ~~Al seleccionar varios productos en el listado (opcional), permitir "Marcar como sincronizados" en lote con `PATCH /products/sync`.~~ *Fuera de esta versión (decidido el 2026-10-16): el aviso de US-F4 cubre el caso masivo.*

**Hecho cuando:** un producto se exporta, se marca y se desmarca desde la UI, y la advertencia del `unsync` se ve.

## US-F6 · Guía de importación en Odoo

**Como** persona que importa en Odoo, **quiero** una guía paso a paso dentro de la aplicación, **para** importar los archivos sin errores.

Contenido estático (sin endpoint), en una ruta propia (p. ej. `/odoo-guide`) enlazada desde el menú y desde los avisos de exportación. Pasos mínimos:

- [x] **Antes de la primera importación:** en Odoo no debe haber atributos con el mismo nombre que los de Stockify (p. ej. el "Color" de los datos demo). Si existen, renombrarlos o archivarlos: Odoo enlaza los valores de las variantes por nombre y los mezclaría.
- [x] **Orden obligatorio:** importar 1 → 2 → 3 → 4, y si un archivo viene en partes (`-01`, `-02`…), todas las partes antes de pasar al siguiente.
- [x] **Dónde importar cada archivo:**
  - 1-Product Attribute: Inventario → Configuración → Atributos → Importar.
  - 2-Point of Sale Category: Punto de Venta → Configuración → Categorías de PdV → Importar.
  - 3-Products: Inventario → Productos → Productos → Importar.
  - 4-Existencias: **Inventario → Operaciones → Inventario físico → Importar**, y al terminar pulsar **Apply All** (Aplicar todo). Sin ese paso, la existencia no cambia.
- [x] Revisar que Odoo no muestre columnas sin mapear importantes antes de pulsar "Importar". `Linked PoS Configurations` puede quedar sin mapear según la edición de Odoo, y eso es normal.
- [x] **Después de importar sin errores:** marcar los productos como sincronizados en Stockify (US-F4 o US-F5).
- [x] **Errores frecuentes:**
  - "Quant's editing is restricted": se intentó reimportar existencias de variantes que ya estaban en Odoo. Quitar esas filas; los recuentos posteriores se hacen en Odoo.
  - Variantes con un solo atributo visible o atributos duplicados: hay un atributo con el mismo nombre en Odoo (ver el primer paso).

**Hecho cuando:** la guía es accesible desde el menú y desde las pantallas de exportación.

## US-F7 · Mensajes de error traducidos

**Como** usuario, **quiero** ver los errores de la exportación en español, **para** saber qué corregir.

Agregar a `FRIENDLY_MESSAGES` en `shared/utils/api-error.ts` (mensajes exactos de la API, en inglés):

| Mensaje de la API (patrón) | Sentido |
|---|---|
| `There are no products to export: every active product is already synced` | No hay productos pendientes de exportar |
| `Product with id N not found` | El producto no existe o está inactivo |
| `Products: the name "X" is used by several products (A, B); Odoo matches variants to products by name, so each name must be unique` | Dos productos con el mismo nombre: renombrar uno |
| `Products: "X" (PREFIX) has no active variants` | El producto no tiene variantes activas |
| `Products: value "V" of "A" cannot contain ","…` / `attribute "A" cannot contain…` | Valor o atributo con separadores de Odoo |
| `<Archivo>: "X" needs N rows, more than maxRowsPerFile (M)` | Un registro no cabe en el límite de filas: subir el límite en Configuración |
| `name / valueName / shortName cannot contain "," (or ":")…` | Validación del formulario de atributos |
| `externalIdPrefix cannot be changed: N product(s) are already synced with Odoo using "X"` | No se puede cambiar el prefijo |
| `language must be one of: en, es`, `maxRowsPerFile must be an integer greater than 0`, `<campo> must be a non-empty string`, `externalIdPrefix can only contain letters, numbers, "_" and "-"`, `At least one setting must be provided` | Validaciones de Configuración |
| `exportedAt is required…`, `exportedAt must be a valid ISO date`, `exportedAt cannot be in the future` | Errores de `sync-exported` |
| `The product went back to draft because it has no stock, but it already exists in Odoo…` (campo `warning`, no error) | Advertencia del `unsync` |

- [x] Traducciones agregadas, incluida la separación de varios problemas (`; `) en una lista.

**Hecho cuando:** ningún error de exportación o configuración se muestra en inglés.

## US-F8 · Actualizar el `CLAUDE.md` del cliente

- [ ] Tabla de API: `settings` (`GET/PUT /export`), `exports` (`POST /full`, `POST /products/:id`, cabeceras) y `products` (`PATCH /sync-exported`, `warning` del `unsync`).
- [ ] Reglas de dominio: existencias solo de variantes sin `syncedAt`, `syncedAt` en variantes, validación de `,` y `:` en atributos y nombres de producto únicos para exportar.
- [ ] "Estado del proyecto": exportación a Odoo hecha.

## Cómo probar

- **API local:** `docker compose up -d` y `npm run dev` en `../Stockify-API` (puerto 3001).
- **Postman:** colección `../Stockify-API/docs/postman/Stockify-API.postman_collection.json`, carpetas *Settings*, *Exports* y *Products*.
- **Odoo 19 de prueba:** hay uno en Docker en `http://localhost:8070` (usuario `admin`, contraseña `admin`; bases `stockify_test*`), solo mientras siga corriendo en la máquina.
