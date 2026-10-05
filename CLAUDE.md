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
- `core/`: guards (`AuthGuard`, `PublicGuard`), `authInterceptor` (Bearer token) y servicios. `shared/`: `main-layout` (menú horizontal superior), modelos y `AppValidators`.
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
| `uploads` | `POST /image` (multipart, campo de archivo único; `folder` ∈ `products`, `categories`, `users`; S3 con nombre UUID) |

Los errores llegan como `{ status, message }`, con 400 para las reglas de negocio.

## Reglas de dominio que la UI debe respetar

- **Atributos**: `displayType` ∈ `select | pills | radio | color` (con `color` se exige `colorHex`). `variantCreation` ∈ `instantly | dynamically | never`. `shortName` es único por atributo y se usa en los SKU.
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

- **Generación cartesiana**: el SKU sigue la forma `skuPrefix-short1-short2…`, con los atributos ordenados por `Attribute.sequence` ASC. Por defecto barcode = SKU. `displayName` sigue la forma `"Nombre (Valor1, Valor2)"`.
- **Edición de matriz** (`PUT /products/:id`): las variantes existentes conservan su ID, SKU y stock. Las nuevas nacen con stock 0.
- **Ciclo de vida** (`ProductStatus`):
  - `draft` → `stock_locked` en cuanto alguna variante activa tiene `stockStore + stockWarehouse > 0`.
  - `stock_locked` → `draft` cuando el stock total de las variantes activas vuelve a 0.
  - `PATCH /sync` lleva a `synced` y congela SKUs y barcodes.
  - `PATCH /:id/unsync` (solo uno a la vez) vuelve a `stock_locked` si hay stock y a `draft` si no lo hay.
  - Cuando el producto está bloqueado (`isLocked`), `skuPrefix` no se puede editar y no se pueden borrar variantes con stock. La UI debe deshabilitar esas acciones, no solo mostrar el error del servidor.

## Estado del proyecto

Hecho: base de la SPA, autenticación (login/reset), layout en dark mode y gestión de usuarios.
Pendiente (EP08): atributos y valores, categorías POS, plantillas de producto con matriz de variantes, conteo físico de stock, subida de imágenes y sincronización/exportación con Odoo.
