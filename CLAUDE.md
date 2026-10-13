# Stockify Client

SPA en Angular para **Stockify**: digitalización de inventario retail (catálogo matricial de variantes, conteo físico dual Tienda/Bodega) con exportación a **Odoo ERP v18+**. Corresponde a la Épica EP08 del backlog (`Stockify_Backlog_Ingenieria.pdf`).

- Backend: repositorio hermano `../Stockify-API` (Node + Express, Clean Architecture en 4 capas, Prisma 7 + PostgreSQL, `exactOptionalPropertyTypes: true`). El esquema de referencia está en `../Stockify-API/prisma/schema.prisma`.

## Stack y comandos

- Angular 17.3, componentes standalone, rutas con `loadComponent`, sin SSR y con CSS plano.
- UI: Bootstrap 5.3 en **dark mode nativo** (`data-bs-theme="dark"`), `@ng-bootstrap/ng-bootstrap` (NgbModal, NgbPagination), `bootstrap-icons` y `sweetalert2`.
- `npm start` levanta `ng serve`. `npm run build` ejecuta `generate-env.js`, que **sobrescribe** `src/environments/environment.ts` con `API_URL`, y luego `ng build`. Ese archivo no se edita a mano.
- API local: `http://localhost:3001/api/v1`.

## Convenciones

- Los nombres de carpetas y archivos van en inglés: `features/<feature>/`, `core/services/<x>.service.ts`, `shared/models/<x>.model.ts`.
- `core/`: guards (`AuthGuard`, `PublicGuard`), `authInterceptor` (Bearer token) y servicios. `shared/`: `main-layout` (menú horizontal superior), `sequence-input` (campo de secuencia con botones ±), `image-upload` (subida y seguimiento de imágenes), `search-select` y `multi-search-select` (selects con buscador que funcionan como controles reactivos y reciben `SelectOption[]`; emiten `(opened)` para recargar el catálogo al abrirse, con `[loading]` mientras tanto; usarlos en lugar de `<select>` cuando la lista es larga), modelos, `AppValidators` y `utils/api-error.ts`.
- Estado con Angular Signals (`signal`, `computed`), Reactive Forms e `inject()` en lugar de constructor.
- Rol fijo `'ADMIN'` en los formularios de usuario. No existe `role.guard`.
- Las rutas públicas cuelgan de `/auth/*` (`/auth/login`, `/auth/reset-password`). Las redirecciones de sesión van a `/auth/login`, nunca a `/login`.
- Cada listado usa pestañas de estado (Todos / Habilitados / Inhabilitados) con el parámetro `available`. No se añaden buscadores de texto que no estén en la especificación.
- La eliminación es suave (soft-delete): el registro queda con `available: false`.
- Los textos de la UI van en español.

## API (`/api/v1`)

| Recurso | Endpoints |
|---|---|
| `auth` | `POST /login`, `POST /forgot-password`, `POST /reset-password/:token` |
| `users` | CRUD + `PATCH /:id/status`; paginado con `page`, `limit` y `available` |
| `attributes` | CRUD; valores: `POST /:id/values`, `PUT/DELETE /values/:valueId` |
| `pos-categories` | CRUD (jerarquía con `parentId`, `color` como int de Odoo, `sequence`) |
| `products` | CRUD de plantillas; `PATCH /sync` (`productId` o `productIds`); `PATCH /:id/unsync`; variantes: `PUT/DELETE /variants/:variantId`, `PATCH /variants/:variantId/stock` |
| `uploads` | `POST /image` (multipart, campo `file`; JPG/PNG/WebP ≤ 5 MB) → `{ uploadId, key, status: 'processing' }`; `GET /:uploadId` → `processing`, `ready` (con `previewUrl`, válida 15 min) o `failed` (con `error`) |

Los errores llegan como `{ error: string }` (mensaje en inglés), con 400 para las reglas de negocio. Se leen con `getApiErrorMessage(err, fallback)` (`shared/utils/api-error.ts`), que también acepta `{ message }` y traduce al español los mensajes de negocio conocidos. Los mensajes nuevos que necesiten traducción se añaden ahí.

Imágenes de producto y variante: se suben primero a `uploads` y el formulario envía `mainImageUploadId` / `imageUploadId` (`null` para quitarla) solo cuando la subida está `ready`. "Guardar" se deshabilita mientras la imagen está `processing` o `failed`. Para mostrar imágenes guardadas se usa `mainImageUrl` / `imageUrl`, nunca la key.

## Reglas de dominio que la UI debe respetar

- **Atributos**: `displayType` ∈ `select | pills | radio | color` (con `color` se exige `colorHex`). `variantCreation` ∈ `instantly | dynamically | never`. `shortName` es único por atributo y se usa en los SKU. Ni `Attribute` ni `AttributeValue` traen `isDeletable`: la UI no sabe de antemano si están en uso, así que las acciones de eliminar o inhabilitar siempre están activas. El backend las rechaza con un 400 cuando el atributo lo usa algún producto activo, y la UI muestra ese error traducido.
- **Colores de Categorías POS**: `color` guarda el **índice de color de Odoo** (entero 0–11, validado por la API), no un HEX. La UI muestra un selector con la paleta de Odoo y envía el índice:

  | Índice | Color Odoo | HEX |
  |---|---|---|
  | 0 | Sin color | — |
  | 1 | Rojo | `#F06050` |
  | 2 | Naranja | `#F4A460` |
  | 3 | Amarillo | `#F7CD1F` |
  | 4 | Celeste | `#6CC1ED` |
  | 5 | Púrpura oscuro | `#814968` |
  | 6 | Salmón | `#EB7E7F` |
  | 7 | Verde azulado | `#2C8397` |
  | 8 | Azul oscuro | `#475577` |
  | 9 | Fucsia | `#D6145F` |
  | 10 | Verde | `#30C381` |
  | 11 | Violeta | `#9365B8` |

- **Generación cartesiana**: el SKU sigue la forma `skuPrefix-short1-short2…`, con los atributos ordenados por `ProductTemplateAttributeLine.sequence` ASC (desempate por `attributeId`). Por defecto barcode = SKU. `displayName` sigue la forma `"Nombre (Valor1, Valor2)"`.
- **Orden de atributos por producto**: `Attribute.sequence` es solo el valor por defecto. Al crear una línea se copia en `ProductTemplateAttributeLine.sequence`, salvo que se envíe `attributeLines[].sequence`. Desde entonces el orden pertenece a la línea: cambiar `Attribute.sequence` no afecta a los productos existentes ni a sus SKU. Las respuestas exponen `attributeLines` (`attributeId`, `attributeName`, `sequence`, `values`) ya ordenadas.
- **Reordenar atributos** de un producto: en `draft` y `stock_locked` se permite y regenera los SKU (se conservan ID, stock y barcodes personalizados). En `synced` la API responde 400 y hay que hacer `unsync` antes.
- **Edición de matriz** (`PUT /products/:id`): las variantes existentes conservan su ID, SKU y stock. Las nuevas nacen con stock 0. Una línea sin `sequence` conserva la suya; una nueva toma `Attribute.sequence`.
- **Colisiones de SKU/barcode** entre productos (p. ej. `POL` + `NEG` frente al prefijo `POL-NEG`): la API las rechaza con 400. No hay sufijos automáticos; el usuario debe cambiar el `skuPrefix`.
- **Ciclo de vida** (`ProductStatus`):
  - `draft` → `stock_locked` en cuanto alguna variante activa tiene `stockStore + stockWarehouse > 0`.
  - `stock_locked` → `draft` cuando el stock total de las variantes activas vuelve a 0.
  - `PATCH /sync` lleva a `synced` y congela SKUs y barcodes.
  - `PATCH /:id/unsync` (solo uno a la vez) vuelve a `stock_locked` si hay stock y a `draft` si no lo hay.
  - Cuando el producto está bloqueado (`isLocked`: estado distinto de `draft` o con stock), `skuPrefix` no se puede editar, no se pueden añadir ni quitar atributos (sí añadir valores nuevos a los existentes) y no se pueden borrar variantes con stock. La UI debe deshabilitar esas acciones, no solo mostrar el error del servidor.

## Estado del proyecto

Hecho: base de la SPA, autenticación (login/reset), layout en dark mode, gestión de usuarios, categorías POS y atributos con sus valores.
Pendiente (EP08): plantillas de producto con matriz de variantes, conteo físico de stock, subida de imágenes y sincronización/exportación con Odoo.
