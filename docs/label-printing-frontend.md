# Impresión de etiquetas: trabajo pendiente en el frontend

**Estado:** listo para empezar · **Fecha:** 2026-10-18
**Backend:** terminado en `../Stockify-API` (commit `b08b8bc`). Requerimientos completos, decisiones y plantillas semilla en `../Stockify-API/docs/label-printing-requirements.md`; las referencias `RF-xx` y `D-xx` de este documento remiten a él.
**Referencia:** `../Bazar-angular` (servicio de Browser Print, flujo de prueba y verificación de la impresora).

## Cómo usar este documento

Se trabaja **una historia por vez**, en el orden de la tabla. Para cada una:

1. Leer este documento, el `CLAUDE.md` del cliente y, si hace falta, el documento de requerimientos del backend.
2. Implementar la historia siguiendo las convenciones del `CLAUDE.md` (standalone, Signals, `inject()`, Bootstrap dark, textos en español, errores con `getApiErrorMessage`).
3. Verificar contra la API local (`npm run dev` en `../Stockify-API`, puerto 3001) y marcar las casillas de la historia.

| # | Historia | Depende de |
|---|---|---|
| US-L1 | Modelos, servicios y motor de plantillas | — |
| US-L2 | Ajustes de etiquetas en Configuración | US-L1 |
| US-L3 | Listado y editor de plantillas con vista previa | US-L1 |
| US-L4 | Conexión con la impresora (Browser Print) | — |
| US-L5 | Pestaña "Etiquetas" del producto | US-L1, US-L3, US-L4 |
| US-L6 | Cola de impresión | US-L5 |
| US-L7 | Guías: impresora y plantillas | US-L3, US-L4 |
| US-L8 | Mensajes de error traducidos y `CLAUDE.md` | todas |

## Cómo funciona (resumen)

- El backend solo guarda **ajustes** y **plantillas**. El cliente genera el ZPL (sustituye los marcadores) y lo envía a la Zebra con **Zebra Browser Print**, un servicio local de Windows (D-01).
- Una plantilla es ZPL con marcadores `{{…}}`. Puede traer bloques de configuración antes de la etiqueta: la etiqueta es el **último** `^XA … ^XZ` (RF-20).
- Un trabajo de impresión usa **una sola plantilla**. Antes se verifica la impresora y, si hay más de una etiqueta, se imprime **una de prueba** (RF-32).
- Las cantidades empiezan en 0 y no se comparan con las existencias (D-07). Los productos no sincronizados se avisan, sin bloquear (D-08).
- La cola de impresión vive en `localStorage` y no hay historial (D-09).

## Contrato de la API

Todo bajo `/api/v1`, con JWT de `ADMIN`. Errores: `{ error: string }` en inglés; 400 para reglas de negocio, 404 si no existe.

### Ajustes de etiquetas

`GET /settings/labels` → 200

```json
{
  "printerDpi": 203,
  "storeName": "",
  "sizeAttributeIds": [],
  "sizeAttributes": [],
  "updatedAt": null
}
```

- `updatedAt: null` = nunca se guardaron; son los valores por defecto.
- `sizeAttributes`: `[{ id, name, available }]` en el orden de `sizeAttributeIds`. Los atributos que ya no existen se omiten; los inactivos vienen con `available: false` y se ignoran al imprimir.

`PUT /settings/labels` → 200 con el mismo objeto. Acepta **campos parciales**.

| Campo | Regla | Significado |
|---|---|---|
| `printerDpi` | `203` \| `300` \| `600` | Resolución de la impresora (la GK420d es de 203) |
| `storeName` | texto, máx. 60; puede estar vacío | Marcador `{{storeName}}` |
| `sizeAttributeIds` | ids de atributos existentes, sin repetir, **en orden de prioridad** | `{{size}}` toma el primero que tenga la variante |

### Plantillas

| Método y ruta | Descripción |
|---|---|
| `GET /label-templates` | Paginado: `page`, `limit`, `available`, `search` (nombre). Orden por nombre. |
| `GET /label-templates/:id` | Una plantilla (404 si no existe) |
| `POST /label-templates` | Crea → 201 |
| `PUT /label-templates/:id` | Edita, parcial (incluye `available`) |
| `DELETE /label-templates/:id` | Soft-delete (`available: false`) |

```json
{
  "id": 1,
  "name": "QR 50x50 talla y precio",
  "description": "Tienda, nombre, QR con el SKU, talla en recuadro, precio oculto y SKU legible",
  "widthMm": 50,
  "heightMm": 50,
  "zpl": "^XA\n^CI28\n…\n^XZ",
  "available": true,
  "createdAt": "…",
  "updatedAt": "…"
}
```

| Campo | Regla |
|---|---|
| `name` | requerido, único, máx. 80 |
| `description` | texto (máx. 200) o `null` |
| `widthMm` / `heightMm` | número > 0 y ≤ 220, máx. 2 decimales |
| `zpl` | requerido, máx. 50 000; debe contener `^XA … ^XZ`; solo marcadores del catálogo |

Hay tres plantillas semilla: "QR 50x50 talla y precio", "QR 40x30 talla y precio" y "QR grande 40x30 talla y precio" (anexos A, B y C del documento de requerimientos).

### Catálogo de marcadores

`{{variable}}` o `{{variable:N}}` (recorta a N caracteres); se admiten espacios dentro de las llaves. Valores por **variante**:

| Marcador | Valor |
|---|---|
| `{{name}}` | Nombre del producto |
| `{{displayName}}` | `displayName` de la variante |
| `{{sku}}` / `{{qr}}` | SKU (el QR codifica el SKU: referencia interna en Odoo) |
| `{{barcode}}` | Código de barras |
| `{{salePrice}}` | Precio con dos decimales (`11.25`) |
| `{{priceCode}}` | Precio oculto: `11.25 → 1125`, `2.5 → 0250`; ≥ 100 da 5 dígitos (RF-13) |
| `{{size}}` | Valor del primer atributo de talla (en el orden de los ajustes) que tenga la variante; vacío si ninguno |
| `{{attr.<Atributo>}}` | Valor de ese atributo en la variante; vacío si no lo tiene |
| `{{storeName}}` | Ajuste |

El backend valida al guardar. Si se añade un marcador, hay que hacerlo en los dos repositorios (`domain/services/labels/label-placeholders.ts` en la API).

### Mensajes de error nuevos (US-L8)

| Mensaje de la API (patrón) | Sentido |
|---|---|
| `printerDpi must be one of: 203, 300, 600` | Resolución no admitida |
| `storeName must be a string` / `storeName cannot be longer than 60 characters` | Nombre de la tienda |
| `sizeAttributeIds must be an array of positive integers` / `… cannot contain duplicates` | Lista de tallas |
| `Attribute(s) not found: 4, 7` | Atributo de talla inexistente |
| `name is required` / `name cannot be longer than 80 characters` | Nombre de la plantilla |
| `A label template with this name already exists` | Nombre repetido |
| `widthMm / heightMm must be a number greater than 0 and up to 220` / `… can have at most 2 decimals` | Tamaño |
| `zpl is required` / `zpl must contain a label format: ^XA ... ^XZ` | ZPL |
| `Unknown placeholder(s): {{foo}} (allowed: …)` | Marcador desconocido |
| `Invalid length in placeholder(s): {{name:0}} (…)` | Recorte inválido |
| `Missing attribute name in placeholder(s): {{attr.}}` | `{{attr.}}` sin nombre |
| `Malformed placeholder: every "{{" must be closed with "}}"` | Llaves sin cerrar |
| `Attribute(s) not found in placeholders: Talla X` | `{{attr.X}}` de un atributo inexistente |
| `Label template with id N not found` | La plantilla no existe |

Un 400 de plantilla puede juntar varios problemas de marcadores separados por `; `.

---

## US-L1 · Modelos, servicios y motor de plantillas

**Como** desarrollador, **quiero** los modelos, los servicios y el generador de ZPL, **para** construir las pantallas de etiquetas sobre una base probada.

- [x] `shared/models/label-settings.model.ts`: `LabelSettings`, `PrinterDpi`, `SizeAttributeRef` y `UpdateLabelSettingsRequest` (parcial).
- [x] `shared/models/label-template.model.ts`: `LabelTemplate`, `CreateLabelTemplateRequest`, `UpdateLabelTemplateRequest`, `LabelTemplatesListResponse`, `LabelTemplateFilters`.
- [x] `core/services/settings.service.ts`: `getLabelSettings()` y `updateLabelSettings(data)`.
- [x] `core/services/label-template.service.ts`: CRUD con `page`, `limit`, `available` y `search`.
- [x] `shared/utils/zpl/` (funciones puras, sin Angular):
  - Catálogo de marcadores (igual que el del backend) y su análisis: variable, `attr.X` y recorte.
  - `splitTemplate(zpl)` → `{ setup, label }`: los bloques anteriores al último `^XA … ^XZ` y la etiqueta (RF-20).
  - `sanitizeZplValue(value)`: quita `^` y `~` (RF-14).
  - `priceCode(price)` (RF-13), `sizeOf(variant, sizeAttributes)` (RF-12) y `attributeValue(variant, name)`.
  - `setQuantity(label, n)`: cambia la primera cifra de `^PQ` o lo añade antes de `^XZ` (RF-24).
  - `buildPrintJob(template, items, context)` → ZPL completo: la configuración una vez y una etiqueta por variante con cantidad > 0 (RF-22, RF-23).
  - `templateWarnings(zpl, widthMm, heightMm, dpi)`: sin `^CI28`, con `^JUS`, y `^PW`/`^LL` que no coinciden con el tamaño (RF-21).
  - `sizeFromZpl(zpl, dpi)` → `{ widthMm, heightMm } | null` a partir de `^PW`/`^LL` (RF-17).
- [x] Pruebas del motor (script con casos conocidos, como en la exportación): las tres plantillas semilla, `11.25 → 1125`, `2.5 → 0250`, `100.5 → 10050`, `^` y `~` en un nombre, recorte, `{{attr.X}}` ausente, `^PQ` con y sin parámetros.

**Hecho cuando:** compila, los servicios responden contra la API local y el motor genera, para las plantillas semilla, el mismo ZPL que se probó en Labelary.

## US-L2 · Ajustes de etiquetas en Configuración

**Como** administrador, **quiero** configurar la impresora, el nombre de la tienda y qué atributos son tallas, **para** que las etiquetas salgan con los datos correctos.

- [x] `/settings` pasa a tener pestañas: **Exportación** (la pantalla actual) y **Etiquetas**.
- [x] Resolución: `203`, `300` o `600` dpi, con la ayuda "La Zebra GK420d es de 203 dpi".
- [x] Nombre de la tienda (máx. 60, puede quedar vacío).
- [x] Atributos de talla: elegir entre los atributos existentes (`multi-search-select`) y **ordenarlos** (subir/bajar), con la explicación de que `{{size}}` toma el primero que tenga cada variante. Los inactivos se muestran marcados.
- [x] Aviso de valores por defecto si `updatedAt` es `null`; guardado con confirmación (sweetalert2).

**Hecho cuando:** se leen y guardan los tres ajustes, y el orden de las tallas se conserva.

## US-L3 · Listado y editor de plantillas con vista previa

**Como** administrador, **quiero** crear, editar y retirar plantillas viendo cómo quedan, **para** no gastar etiquetas probando.

- [x] Ruta `/labels/templates` con listado (`app-list-filters`, pestañas Todos / Habilitadas / Inhabilitadas y buscador por nombre): nombre, tamaño, descripción y acciones.
- [x] Rutas `/labels/templates/new` y `/labels/templates/:id/edit` con el formulario: nombre, descripción, ancho y alto en mm, y el ZPL (área de texto con fuente monoespaciada).
- [x] Al pegar o editar el ZPL, si trae `^PW`/`^LL`, proponer el tamaño en mm (RF-17).
- [x] Panel de marcadores: el catálogo con su descripción; al pulsar uno se inserta en el cursor.
- [x] Vista previa con **Labelary** (§7 de los requerimientos): con datos de ejemplo o de una variante elegida, bajo demanda o al dejar de escribir; si falla, aviso sin bloquear.
- [x] Advertencias en vivo (`templateWarnings`): sin `^CI28`, con `^JUS`, `^PW`/`^LL` distinto del tamaño.
- [x] Eliminar (soft-delete) y reactivar, con confirmación.
- [x] Entrada en el menú nuevo **"Etiquetas"** (desplegable del `main-layout`): Cola de impresión, Plantillas y Guías. *Por ahora solo Plantillas; la cola y las guías se agregan en US-L6 y US-L7.*

**Hecho cuando:** se pueden crear, editar, previsualizar y retirar plantillas, y los errores de marcadores se ven en español.

## US-L4 · Conexión con la impresora (Browser Print)

**Como** usuario, **quiero** elegir la Zebra y saber si está lista, **para** imprimir sin sorpresas.

- [x] ~~Copiar los SDK de Bazar-angular a `src/assets/js/` y cargarlos en `angular.json`.~~ *Decidido (2026-10-18): sin SDK. El servicio usa con `fetch` la API HTTP de Browser Print (`/available`, `/default`, `/write`, `/read`), la misma que envuelven los SDK. Browser Print acepta CORS y private network access (comprobado), y así no hay scripts globales ni dependencia de la librería de Zebra para el estado.*
- [x] `core/services/zebra-printer.service.ts`:
  - `listPrinters()` (`getLocalDevices`) y la impresora elegida, recordada en `localStorage`; sin elegir, la predeterminada (RF-30).
  - `checkConnection()`: `~HS` con límite de 2 s, como el supervisor de Bazar (RF-31).
  - `getStatus()`: listo, sin papel, cabezal abierto, en pausa… *Se interpreta la respuesta de `~HS` (`shared/utils/zpl/host-status.ts`), dentro de `checkStatus()`.*
  - `send(zpl)` como `Promise`. *El reintento de Bazar era un parche del SDK; sin SDK no hace falta.*
- [x] Componente compartido `app-printer-status`: impresora elegida, selector, botón "Verificar impresora" y estado. Si falla, la lista de comprobaciones (luz verde fija, cable USB, Browser Print abierto) y el enlace a la guía.
- [x] Mensaje claro si Browser Print no está instalado o no responde (incluido el caso HTTPS, §9 de los requerimientos).

**Hecho cuando:** con la Zebra conectada, se elige, se verifica y se imprime una etiqueta de prueba fija; sin Browser Print, el mensaje explica qué falta.

## US-L5 · Pestaña "Etiquetas" del producto

**Como** usuario, **quiero** imprimir las etiquetas de las variantes de un producto desde su pantalla, **para** etiquetar lo que acabo de registrar.

- [ ] Pestaña nueva en `product-form`, visible si el producto está guardado y tiene variantes activas (RF-26).
- [ ] Tabla de variantes activas: SKU, combinación, talla (`{{size}}`) y cantidad (empieza en 0, editable).
- [ ] **Aplicar a todas: N** y "Poner todo en 0".
- [ ] Selector de plantilla (activas, `search-select`) y vista previa (Labelary) de la primera variante con cantidad > 0.
- [ ] Si el producto no está `synced`: aviso fijo arriba de la pestaña (RF-27).
- [ ] **Imprimir** (flujo común, abajo), **Descargar .zpl** (RF-34) y **Agregar a la cola** (suma cantidades si la variante ya está; RF-29).
- [ ] Flujo común de impresión, reutilizable por la cola (`features/labels/label-print-flow.service.ts` o similar):
  1. Avisos previos en una sola confirmación: productos no sincronizados, precios ≥ 100 y filas omitidas (RF-33).
  2. Verificar la impresora (US-L4); si falla, no imprimir.
  3. Con más de una etiqueta: imprimir **una de prueba** y abrir el modal "Salió bien, imprimir el resto" / "Reimprimir prueba" / "Cancelar" (RF-32).
  4. Imprimir el resto restando la copia de prueba.

**Hecho cuando:** desde un producto se imprimen sus etiquetas con prueba previa, se descarga el `.zpl` y se agrega a la cola.

## US-L6 · Cola de impresión

**Como** usuario, **quiero** juntar etiquetas de varios productos e imprimirlas de una vez, **para** reponer etiquetas sin ir producto por producto.

- [ ] `core/services/label-queue.service.ts`: signal con `{ variantId, productId, quantity }[]` y respaldo en `localStorage` (envuelto en `try/catch`); agregar suma cantidades.
- [ ] Ruta `/labels/queue`: carga los productos de la cola (`GET /products/:id`) y muestra producto, SKU, combinación, talla y cantidad editable.
- [ ] Badge "No sincronizado" por fila; las variantes que ya no existen o están inactivas se marcan y no se imprimen (RF-29).
- [ ] Aplicar a todas, quitar filas, vaciar la cola (con confirmación).
- [ ] Selector de plantilla, vista previa, **Imprimir** (flujo común de US-L5) y **Descargar .zpl**.
- [ ] Indicador en el menú con el número de etiquetas en la cola.

**Hecho cuando:** se agregan variantes de varios productos, la cola sobrevive a recargas y se imprime con el mismo flujo de prueba.

## US-L7 · Guías: impresora y plantillas

**Como** persona que imprime o diseña etiquetas, **quiero** guías dentro de la aplicación, **para** configurar la Zebra y crear plantillas sin depender de nadie.

Contenido estático (sin endpoint), en `/labels/guide` con dos secciones, enlazada desde el menú "Etiquetas", desde `app-printer-status` y desde el editor de plantillas. Contenido mínimo en §10 de los requerimientos:

- [ ] **Impresora:** Zebra Setup Utilities, calibración (`~JC` o botón de avance), oscuridad y velocidad una sola vez, Browser Print como *Default*, HTTPS (`https://localhost:9101/ssl_support` y *accepted hosts*), "Verificar impresora" y problemas frecuentes (luz, cola atascada, etiquetas desplazadas, etiqueta en blanco entre impresiones).
- [ ] **Plantillas:** ZebraDesigner 3 o ZPL a mano con el visor de Labelary, puntos y mm (8 puntos = 1 mm a 203 dpi), `^CI28`, catálogo de marcadores con ejemplos, QR (`^BQN,2,N^FDQA,{{qr}}^FS`) y límite de tamaño según el largo del SKU, precio oculto y talla, y por qué quitar `^JUS`.
- [ ] Las tres plantillas semilla como ejemplo, con su vista previa.

**Hecho cuando:** las guías son accesibles desde el menú, la impresora y el editor.

## US-L8 · Mensajes de error traducidos y `CLAUDE.md`

- [ ] Traducciones de la tabla "Mensajes de error nuevos" en `shared/utils/api-error.ts`; los problemas de marcadores separados por `; ` se muestran como lista.
- [ ] `CLAUDE.md` del cliente: tabla de API (`settings/labels`, `label-templates`), menú "Etiquetas", servicios y utilidades nuevas (`zebra-printer`, `label-queue`, `shared/utils/zpl`), reglas (cantidades desde 0, una plantilla por trabajo, prueba previa, aviso de no sincronizado) y estado del proyecto.

**Hecho cuando:** ningún error de etiquetas se muestra en inglés y el `CLAUDE.md` describe la funcionalidad.

## Cómo probar

- **API local:** `docker compose up -d` y `npm run dev` en `../Stockify-API` (puerto 3001).
- **Vista previa:** Labelary (`https://api.labelary.com`) necesita internet.
- **Impresora:** Zebra GK420d por USB con Zebra Browser Print abierto. Sin impresora, la descarga `.zpl` y la vista previa permiten probar casi todo el flujo.
