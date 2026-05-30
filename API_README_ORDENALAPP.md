# 📡 API Documentation — OrdenalApp

> **Base URL:** `{APP_URL}/api/v1`
>
> Todos los endpoints protegidos requieren autenticación mediante **Laravel Sanctum**.
> Incluir el header: `Authorization: Bearer {token}`

---

## Índice

- [🔐 Autenticación](#-autenticación)
- [📊 Estadísticas / Dashboard](#-estadísticas--dashboard)
- [🏢 Negocio (Business)](#-negocio-business)
- [🛒 Ventas (Sales)](#-ventas-sales)
- [📦 Compras (Purchase)](#-compras-purchase)
- [🍽️ Productos (Products)](#-productos-products)
- [🧑‍🤝‍🧑 Partes (Parties)](#-partes-parties)
- [📂 Categorías (Categories)](#-categorías-categories)
- [📋 Menús (Menus)](#-menús-menus)
- [🪑 Mesas (Tables)](#-mesas-tables)
- [🧾 Facturas (Invoices)](#-facturas-invoices)
- [💸 Deudas (Dues)](#-deudas-dues)
- [🗒️ Cotizaciones (Quotations)](#-cotizaciones-quotations)
- [💰 Gastos (Expenses)](#-gastos-expenses)
- [💵 Ingresos (Incomes)](#-ingresos-incomes)
- [🏷️ Impuestos (Taxes)](#-impuestos-taxes)
- [💳 Tipos de Pago (Payment Types)](#-tipos-de-pago-payment-types)
- [👤 Usuarios (Users)](#-usuarios-users)
- [👷 Staff (Staffs)](#-staff-staffs)
- [🥦 Ingredientes (Ingredients)](#-ingredientes-ingredients)
- [🔧 Grupos de Modificadores (Modifier Groups)](#-grupos-de-modificadores-modifier-groups)
- [🔧 Modificadores (Modifiers)](#-modificadores-modifiers)
- [🏠 Direcciones de Entrega (Delivery Address)](#-direcciones-de-entrega-delivery-address)
- [🎟️ Cupones (Coupons)](#-cupones-coupons)
- [📏 Unidades (Units)](#-unidades-units)
- [🌐 Monedas (Currencies)](#-monedas-currencies)
- [💼 Planes y Suscripciones](#-planes-y-suscripciones)
- [🔐 Roles y Permisos](#-roles-y-permisos)
- [📈 Reportes (Reports)](#-reportes-reports)
- [💹 Transacciones (Transactions)](#-transacciones-transactions)
- [💱 Dinero In/Out](#-dinero-inout)
- [👤 Perfil (Profile)](#-perfil-profile)
- [🌍 Idioma (Language)](#-idioma-language)
- [📄 Páginas de Contenido](#-páginas-de-contenido)
- [🛍️ E-commerce (Subdominio)](#-e-commerce-subdominio)

---

## 🔐 Autenticación

> Endpoints públicos — **no requieren token**

### `POST /api/v1/sign-up`
Registrar un nuevo usuario. Envía un código OTP al email.

**Body (JSON):**
```json
{
  "name": "Juan Pérez",
  "email": "juan@ejemplo.com",
  "password": "secret123"
}
```

**Respuesta exitosa `200`:**
```json
{
  "message": "An otp code has been sent to your email. Please check and confirm.",
  "data": { ...user }
}
```

---

### `POST /api/v1/sign-in`
Iniciar sesión con email y contraseña.

**Body (JSON):**
```json
{
  "email": "juan@ejemplo.com",
  "password": "secret123"
}
```

**Respuesta exitosa `200`:**
```json
{
  "message": "¡El usuario inició sesión exitosamente!",
  "data": {
    "message": "Sesión iniciada correctamente!",
    "is_setup": true,
    "token": "1|abc123..."
  }
}
```

> ⚠️ Si el email no está verificado, se envía un nuevo OTP y retorna `201`.

---

### `POST /api/v1/submit-otp`
Verificar el código OTP enviado al email.

**Body (JSON):**
```json
{
  "email": "juan@ejemplo.com",
  "otp": "123456"
}
```

**Respuesta exitosa `200`:**
```json
{
  "message": "¡Sesión iniciada correctamente!",
  "is_setup": false,
  "token": "2|xyz789..."
}
```

---

### `POST /api/v1/resend-otp`
Reenviar el código OTP al email.

**Body (JSON):**
```json
{
  "email": "juan@ejemplo.com"
}
```

---

### `POST /api/v1/send-reset-code`
Enviar código de recuperación de contraseña al email.

**Body (JSON):**
```json
{
  "email": "juan@ejemplo.com"
}
```

---

### `POST /api/v1/verify-reset-code`
Verificar el código de recuperación de contraseña.

**Body (JSON):**
```json
{
  "email": "juan@ejemplo.com",
  "code": 123456
}
```

---

### `POST /api/v1/password-reset`
Restablecer la contraseña del usuario.

**Body (JSON):**
```json
{
  "email": "juan@ejemplo.com",
  "password": "nueva_contraseña"
}
```

---

### `GET /api/v1/sign-out` 🔒
Cerrar sesión y revocar todos los tokens.

**Respuesta:**
```json
{ "message": "Sesión cerrada correctamente" }
```

---

### `GET /api/v1/refresh-token` 🔒
Rotar el token de acceso actual por uno nuevo.

**Respuesta:**
```json
{ "token": "3|newtoken..." }
```

---

## 📊 Estadísticas / Dashboard

### `GET /api/v1/summary` 🔒
Resumen general del negocio (ventas, compras, items, etc.).

**Query Params opcionales:**
| Parámetro   | Tipo   | Descripción                  |
|-------------|--------|------------------------------|
| `from_date` | string | Fecha inicio (YYYY-MM-DD)    |
| `to_date`   | string | Fecha fin (YYYY-MM-DD)       |

**Respuesta:**
```json
{
  "message": "Data fetched successfully",
  "data": {
    "total_sales": 15000.00,
    "total_purchase": 8000.00,
    "total_items": 45,
    "total_hold": 3,
    "total_expense": 2000.00
  }
}
```

---

### `GET /api/v1/dashboard-chart` 🔒
Datos de gráfica para el dashboard.

**Query Params:**
| Parámetro  | Tipo   | Valores              | Requerido |
|------------|--------|----------------------|-----------|
| `duration` | string | `weekly`, `monthly`, `yearly` | ✅ |

**Respuesta:**
```json
{
  "message": "Data fetched successfully.",
  "data": {
    "total_loss": 500.00,
    "total_profit": 2000.00,
    "loss_percentage": 20.00,
    "profit_percentage": 80.00,
    "total_money_in": 15000.00,
    "total_money_out": 8000.00,
    "max_value": 15000.00,
    "min_value": 8000.00,
    "money_in": [{ "date": "Mon", "amount": 1200 }],
    "money_out": [{ "date": "Mon", "amount": 800 }]
  }
}
```

---

## 🏢 Negocio (Business)

### `GET /api/v1/business` 🔒
Obtener información del negocio del usuario autenticado, incluyendo moneda, configuración de factura y plan de suscripción.

**Respuesta:**
```json
{
  "message": "Data fetched successfully.",
  "data": {
    "id": 1,
    "name": "Mi Restaurante",
    "business": { ... },
    "business_currency": { "id": 1, "name": "US Dollar", "code": "USD", "symbol": "$", "position": "left" },
    "invoice_logo": "path/to/logo.png",
    "invoice_note": "Gracias por su compra",
    "gratitude_message": "¡Vuelve pronto!",
    "invoice_size": { ... }
  }
}
```

---

### `POST /api/v1/business` 🔒
Configurar / crear el negocio del usuario (se asigna plan gratuito automáticamente).

**Body (multipart/form-data):**
| Campo                  | Tipo    | Requerido |
|------------------------|---------|-----------|
| `companyName`          | string  | ✅        |
| `business_category_id` | integer | ✅        |
| `address`              | string  | ❌        |
| `phoneNumber`          | string  | ❌        |
| `shopOpeningBalance`   | numeric | ❌        |
| `pictureUrl`           | image   | ❌        |

---

### `PUT /api/v1/business/{id}` 🔒
Actualizar datos del negocio.

**Body (multipart/form-data):**
| Campo                  | Tipo    | Descripción              |
|------------------------|---------|--------------------------|
| `companyName`          | string  | Nombre del negocio       |
| `address`              | string  | Dirección                |
| `phoneNumber`          | string  | Teléfono                 |
| `pictureUrl`           | image   | Logo del negocio         |
| `business_category_id` | integer | Categoría del negocio    |
| `vat_name`             | string  | Nombre del impuesto      |
| `vat_no`               | string  | Número de VAT            |
| `invoice_logo`         | image   | Logo para facturas       |
| `invoice_note`         | string  | Nota en facturas         |
| `invoice_note_level`   | string  | Nivel de nota            |
| `gratitude_message`    | string  | Mensaje de agradecimiento |
| `invoice_size`         | object  | Configuración de tamaño  |
| `name`                 | string  | Nombre del usuario       |
| `phone`                | string  | Teléfono del usuario     |
| `email`                | string  | Email del usuario        |

---

### `GET /api/v1/business-categories` 🔒
Listar todas las categorías de negocio disponibles.

---

## 🛒 Ventas (Sales)

### `GET /api/v1/sales` 🔒
Listar ventas del negocio (paginado, 10 por página).

**Query Params:**
| Parámetro        | Tipo   | Descripción                                  |
|------------------|--------|----------------------------------------------|
| `search`         | string | Buscar por factura, cliente o tipo de pago   |
| `status`         | string | `pending`, `completed`                       |
| `sales_type`     | string | `dine_in`, `takeaway`, `delivery`, `online`  |
| `payment_status` | string | `paid`, `unpaid`                             |
| `from_date`      | string | Fecha inicio (YYYY-MM-DD)                    |
| `to_date`        | string | Fecha fin (YYYY-MM-DD)                       |

---

### `POST /api/v1/sales` 🔒
Crear una nueva venta. Soporta modo KOT (Kitchen Order Ticket).

**Body (JSON):**
```json
{
  "saleDate": "2025-01-15",
  "products": [
    {
      "product_id": 1,
      "sales_price": 12.50,
      "quantities": 2,
      "variation_id": null,
      "instructions": "Sin cebolla",
      "detail_options": [
        { "option_id": 3, "modifier_id": 1 }
      ]
    }
  ],
  "table_id": 2,
  "party_id": 5,
  "address_id": null,
  "tax_id": 1,
  "coupon_id": null,
  "payment_type_id": 1,
  "staff_id": null,
  "totalAmount": 25.00,
  "paidAmount": 25.00,
  "dueAmount": 0,
  "discountAmount": 0,
  "discountPercentage": 0,
  "tax_amount": 2.25,
  "delivery_charge": 0,
  "tip": 2.00,
  "payment_method": "cash",
  "sales_type": "dine_in",
  "is_kot": 1,
  "quotation_id": null
}
```

> `is_kot: 1` crea un KOT ticket y deja la venta en estado `pending`.

---

### `GET /api/v1/sales/{id}` 🔒
Obtener el detalle completo de una venta, incluyendo productos, variaciones, modificadores y dirección de entrega.

---

### `PUT /api/v1/sales/{id}` 🔒
Actualizar una venta existente. Misma estructura que el POST.

---

### `DELETE /api/v1/sales/{id}` 🔒
Eliminar una venta. Revierte balances del negocio y de la parte asociada.

**Respuesta:**
```json
{
  "message": "Data deleted successfully.",
  "data": { "table_id": 2 }
}
```

---

### `PUT /api/v1/sales/kot-pay/{id}` 🔒
Procesar el pago de un KOT (finaliza la orden, libera la mesa).

**Body (JSON):**
```json
{
  "paidAmount": 25.00,
  "totalAmount": 25.00,
  "tax_id": 1,
  "payment_type_id": 1,
  "discountAmount": 0,
  "discountPercentage": 0,
  "coupon_amount": 0,
  "meta": {}
}
```

---

## 📦 Compras (Purchase)

### `GET /api/v1/purchase` 🔒
Listar compras (paginado, 10 por página).

**Query Params:**
| Parámetro        | Tipo   | Descripción                            |
|------------------|--------|----------------------------------------|
| `search`         | string | Buscar por factura, proveedor          |
| `payment_status` | string | `paid`, `due`                          |
| `from_date`      | string | Fecha inicio (YYYY-MM-DD)              |
| `to_date`        | string | Fecha fin (YYYY-MM-DD)                 |

---

### `POST /api/v1/purchase` 🔒
Crear una nueva compra.

**Body (JSON):**
```json
{
  "purchaseDate": "2025-01-15",
  "party_id": 3,
  "payment_type_id": 1,
  "totalAmount": 500.00,
  "paidAmount": 500.00,
  "dueAmount": 0,
  "discountAmount": 0,
  "discountPercentage": 0,
  "tax_amount": 45.00,
  "tax_percentage": 9,
  "discount_type": "flat",
  "ingredients": [
    {
      "ingredient_id": 2,
      "unit_id": 1,
      "unit_price": 10.00,
      "quantities": 50
    }
  ]
}
```

---

### `GET /api/v1/purchase/{id}` 🔒
Obtener detalle de una compra específica.

---

### `PUT /api/v1/purchase/{id}` 🔒
Actualizar una compra existente.

---

### `DELETE /api/v1/purchase/{id}` 🔒
Eliminar una compra.

---

## 🍽️ Productos (Products)

### `GET /api/v1/products` 🔒
Listar productos (paginado, 10 por página).

**Query Params:**
| Parámetro     | Tipo    | Descripción                            |
|---------------|---------|----------------------------------------|
| `search`      | string  | Buscar por nombre                      |
| `category_id` | integer | Filtrar por categoría                  |
| `menu_id`     | integer | Filtrar por menú                       |
| `food_type`   | string  | Tipo de comida (ej: `veg`, `non_veg`)  |
| `sort_by`     | string  | `low_to_high`, `high_to_low`           |
| `no_paginate` | boolean | `true` para obtener todos sin paginar  |

---

### `POST /api/v1/products` 🔒
Crear un nuevo producto.

**Body (multipart/form-data):**
| Campo                | Tipo    | Requerido | Descripción                         |
|----------------------|---------|-----------|-------------------------------------|
| `productName`        | string  | ✅        | Nombre del producto                 |
| `menu_id`            | integer | ✅        | ID del menú al que pertenece        |
| `category_id`        | integer | ✅        | ID de la categoría                  |
| `price_type`         | string  | ✅        | `single` o `variation`              |
| `sales_price`        | numeric | ✅*       | Precio (requerido si `single`)      |
| `food_type`          | string  | ❌        | Tipo de comida                      |
| `preparation_time`   | string  | ❌        | Tiempo de preparación               |
| `description`        | string  | ❌        | Descripción del producto            |
| `images[]`           | image   | ❌        | Imágenes del producto               |
| `variation_names[]`  | array   | ❌        | Nombres de variaciones              |
| `variation_prices[]` | array   | ❌        | Precios de variaciones              |
| `variation_cuts[]`   | array   | ❌        | Cortes de variaciones               |
| `modifier_group_id[]`| array   | ❌        | IDs de grupos de modificadores      |

---

### `GET /api/v1/products/{id}` 🔒
Obtener detalle de un producto con variaciones y grupos de modificadores.

---

### `PUT /api/v1/products/{id}` 🔒
Actualizar un producto. Misma estructura que el POST.

**Body adicional:**
| Campo             | Tipo  | Descripción                      |
|-------------------|-------|----------------------------------|
| `removed_images[]`| array | Rutas de imágenes a eliminar     |

---

### `DELETE /api/v1/products/{id}` 🔒
Eliminar un producto y sus imágenes del almacenamiento.

---

## 🧑‍🤝‍🧑 Partes (Parties)

> Una "parte" puede ser un **cliente** (`customer`) o un **proveedor** (`supplier`).

### `GET /api/v1/parties` 🔒
Listar partes del negocio (paginado).

**Query Params:**
| Parámetro     | Tipo    | Descripción                          |
|---------------|---------|--------------------------------------|
| `type`        | string  | `customer` o `supplier`              |
| `search`      | string  | Buscar por nombre, saldo o tipo      |
| `no_paginate` | boolean | `true` para obtener todos            |

---

### `POST /api/v1/parties` 🔒
Crear una nueva parte (cliente o proveedor).

**Body (multipart/form-data):**
| Campo              | Tipo    | Requerido | Descripción                        |
|--------------------|---------|-----------|------------------------------------|
| `name`             | string  | ✅        | Nombre completo                    |
| `phone`            | string  | ✅        | Teléfono (único por negocio)       |
| `type`             | string  | ❌        | `customer`, `supplier`, `retailer` |
| `email`            | string  | ❌        | Email                              |
| `address`          | string  | ❌        | Dirección                          |
| `opening_balance`  | numeric | ❌        | Balance inicial                    |
| `notes`            | string  | ❌        | Notas adicionales                  |
| `image`            | image   | ❌        | Foto de la parte                   |
| `delivery_name[]`  | array   | ❌        | Nombres de direcciones de entrega  |
| `delivery_phone[]` | array   | ❌        | Teléfonos de entrega               |
| `delivery_address[]`| array  | ❌        | Direcciones de entrega             |

---

### `GET /api/v1/parties/{id}` 🔒
Obtener detalle de una parte con sus direcciones de entrega.

---

### `GET /api/v1/parties/view-ledger/{id}` 🔒
Ver el libro mayor de una parte (ventas o compras según tipo).

**Query Params:**
| Parámetro     | Tipo    | Descripción                            |
|---------------|---------|----------------------------------------|
| `type`        | string  | `customer` o `supplier` ✅             |
| `from_date`   | string  | Fecha inicio                           |
| `to_date`     | string  | Fecha fin                              |
| `no_paginate` | boolean | `true` para todos sin paginar          |

---

### `PUT /api/v1/parties/{id}` 🔒
Actualizar datos de una parte.

---

### `DELETE /api/v1/parties/{id}` 🔒
Eliminar una parte.

---

## 📂 Categorías (Categories)

### `GET /api/v1/categories` 🔒
Listar categorías de productos.

### `POST /api/v1/categories` 🔒
Crear categoría.

**Body:** `{ "categoryName": "Bebidas" }`

### `PUT /api/v1/categories/{id}` 🔒
Actualizar categoría.

### `DELETE /api/v1/categories/{id}` 🔒
Eliminar categoría.

---

## 📋 Menús (Menus)

### `GET /api/v1/menus` 🔒
Listar menús del negocio.

### `POST /api/v1/menus` 🔒
Crear menú.

**Body:** `{ "name": "Menú del Día" }`

### `PUT /api/v1/menus/{id}` 🔒
Actualizar menú.

### `DELETE /api/v1/menus/{id}` 🔒
Eliminar menú.

---

## 🪑 Mesas (Tables)

### `GET /api/v1/tables` 🔒
Listar mesas del negocio.

### `POST /api/v1/tables` 🔒
Crear mesa.

**Body:** `{ "name": "Mesa 1" }`

### `PUT /api/v1/tables/{id}` 🔒
Actualizar mesa.

### `DELETE /api/v1/tables/{id}` 🔒
Eliminar mesa.

---

## 🧾 Facturas (Invoices)

### `GET /api/v1/invoices` 🔒
Listar facturas del negocio.

### `GET /api/v1/new-invoice` 🔒
Obtener el número para la próxima factura.

**Respuesta:**
```json
{ "invoice_number": "#46" }
```

---

## 💸 Deudas (Dues)

### `GET /api/v1/dues-list` 🔒
Lista combinada de deudas de ventas y compras pendientes (paginado).

**Query Params:**
| Parámetro   | Tipo   | Descripción            |
|-------------|--------|------------------------|
| `search`    | string | Buscar por factura     |
| `from_date` | string | Fecha inicio           |
| `to_date`   | string | Fecha fin              |
| `page`      | integer| Número de página       |

---

### `GET /api/v1/dues` 🔒
Historial de cobros de deudas (DueCollects, paginado).

**Query Params:**
| Parámetro   | Tipo   | Descripción            |
|-------------|--------|------------------------|
| `search`    | string | Buscar por factura     |
| `from_date` | string | Fecha inicio           |
| `to_date`   | string | Fecha fin              |

---

### `POST /api/v1/dues` 🔒
Registrar un cobro / pago de deuda.

**Body (JSON):**
```json
{
  "payment_type_id": 1,
  "paymentDate": "2025-01-15",
  "payDueAmount": 100.00,
  "party_id": 5,
  "invoiceNumber": "#12"
}
```

> Si se omite `invoiceNumber`, se descuenta del balance de apertura de la parte.

---

### `PUT /api/v1/dues/{id}` 🔒
Actualizar un cobro de deuda existente.

---

## 🗒️ Cotizaciones (Quotations)

### `GET /api/v1/quotations` 🔒
### `POST /api/v1/quotations` 🔒
### `GET /api/v1/quotations/{id}` 🔒
### `PUT /api/v1/quotations/{id}` 🔒
### `DELETE /api/v1/quotations/{id}` 🔒

CRUD completo de cotizaciones.

> Al crear una venta (`POST /sales`) con `quotation_id`, la cotización se elimina automáticamente.

---

## 💰 Gastos (Expenses)

### `GET /api/v1/expenses` 🔒
### `POST /api/v1/expenses` 🔒
### `PUT /api/v1/expenses/{id}` 🔒
### `DELETE /api/v1/expenses/{id}` 🔒

CRUD de gastos del negocio.

---

### `GET /api/v1/expense-categories` 🔒
### `POST /api/v1/expense-categories` 🔒
### `PUT /api/v1/expense-categories/{id}` 🔒
### `DELETE /api/v1/expense-categories/{id}` 🔒

CRUD de categorías de gastos.

---

## 💵 Ingresos (Incomes)

### `GET /api/v1/incomes` 🔒
### `POST /api/v1/incomes` 🔒
### `PUT /api/v1/incomes/{id}` 🔒
### `DELETE /api/v1/incomes/{id}` 🔒

CRUD de ingresos del negocio.

---

### `GET /api/v1/income-categories` 🔒
### `POST /api/v1/income-categories` 🔒
### `PUT /api/v1/income-categories/{id}` 🔒
### `DELETE /api/v1/income-categories/{id}` 🔒

CRUD de categorías de ingresos.

---

## 🏷️ Impuestos (Taxes)

### `GET /api/v1/taxes` 🔒
### `POST /api/v1/taxes` 🔒
### `PUT /api/v1/taxes/{id}` 🔒
### `DELETE /api/v1/taxes/{id}` 🔒

CRUD de impuestos del negocio.

---

## 💳 Tipos de Pago (Payment Types)

### `GET /api/v1/payment-types` 🔒
### `POST /api/v1/payment-types` 🔒
### `PUT /api/v1/payment-types/{id}` 🔒
### `DELETE /api/v1/payment-types/{id}` 🔒

CRUD de tipos de pago.

---

### `POST /api/v1/payment-types/quick-view/{id}` 🔒
Vista rápida de un tipo de pago específico.

---

## 👤 Usuarios (Users)

### `GET /api/v1/users` 🔒
### `POST /api/v1/users` 🔒
### `PUT /api/v1/users/{id}` 🔒
### `DELETE /api/v1/users/{id}` 🔒

CRUD de usuarios del negocio (sin `show` individual).

---

## 👷 Staff (Staffs)

### `GET /api/v1/staffs` 🔒
### `POST /api/v1/staffs` 🔒
### `GET /api/v1/staffs/{id}` 🔒
### `PUT /api/v1/staffs/{id}` 🔒
### `DELETE /api/v1/staffs/{id}` 🔒

CRUD de staff del negocio.

---

## 🥦 Ingredientes (Ingredients)

### `GET /api/v1/ingredients` 🔒
### `POST /api/v1/ingredients` 🔒
### `PUT /api/v1/ingredients/{id}` 🔒
### `DELETE /api/v1/ingredients/{id}` 🔒

CRUD de ingredientes (usado en compras).

---

## 🔧 Grupos de Modificadores (Modifier Groups)

### `GET /api/v1/modifier-groups` 🔒
### `POST /api/v1/modifier-groups` 🔒
### `GET /api/v1/modifier-groups/{id}` 🔒
### `PUT /api/v1/modifier-groups/{id}` 🔒
### `DELETE /api/v1/modifier-groups/{id}` 🔒

CRUD de grupos de modificadores para productos.

---

## 🔧 Modificadores (Modifiers)

### `GET /api/v1/modifiers` 🔒
### `POST /api/v1/modifiers` 🔒
### `GET /api/v1/modifiers/{id}` 🔒
### `PUT /api/v1/modifiers/{id}` 🔒
### `DELETE /api/v1/modifiers/{id}` 🔒

CRUD de modificadores (opciones de personalización por producto).

---

## 🏠 Direcciones de Entrega (Delivery Address)

### `POST /api/v1/delivery-address` 🔒
Crear dirección de entrega.

**Body (JSON):**
```json
{
  "party_id": 5,
  "name": "Casa",
  "phone": "3001234567",
  "address": "Calle 123 #45-67"
}
```

### `PUT /api/v1/delivery-address/{id}` 🔒
Actualizar dirección de entrega.

### `DELETE /api/v1/delivery-address/{id}` 🔒
Eliminar dirección de entrega.

---

## 🎟️ Cupones (Coupons)

### `GET /api/v1/coupons` 🔒
### `POST /api/v1/coupons` 🔒
### `PUT /api/v1/coupons/{id}` 🔒
### `DELETE /api/v1/coupons/{id}` 🔒

CRUD de cupones de descuento.

---

## 📏 Unidades (Units)

### `GET /api/v1/units` 🔒
### `POST /api/v1/units` 🔒
### `PUT /api/v1/units/{id}` 🔒
### `DELETE /api/v1/units/{id}` 🔒

CRUD de unidades de medida (kg, litros, unidades, etc.).

---

## 🌐 Monedas (Currencies)

### `GET /api/v1/currencies` 🔒
Listar monedas disponibles.

### `GET /api/v1/currencies/{id}` 🔒
Obtener detalle de una moneda.

---

## 💼 Planes y Suscripciones

### `GET /api/v1/plans` 🔒
Listar planes de suscripción disponibles.

### `GET /api/v1/subscribes` 🔒
Listar suscripciones activas del negocio.

---

## 🔐 Roles y Permisos

### `GET /api/v1/role-permission` 🔒
### `POST /api/v1/role-permission` 🔒
### `PUT /api/v1/role-permission/{id}` 🔒
### `DELETE /api/v1/role-permission/{id}` 🔒

CRUD de roles y permisos del negocio.

---

## 📈 Reportes (Reports)

> Todos los endpoints de reportes soportan `no_paginate=true` para exportar todos los registros.

### `GET /api/v1/purchase-report` 🔒
Reporte de compras filtrable.

**Query Params:**
| Parámetro        | Tipo    | Descripción              |
|------------------|---------|--------------------------|
| `search`         | string  | Buscar por factura       |
| `payment_status` | string  | `paid`, `due`            |
| `from_date`      | string  | Fecha inicio             |
| `to_date`        | string  | Fecha fin                |
| `no_paginate`    | boolean | `true` para sin paginar  |

---

### `GET /api/v1/sales-report` 🔒
Reporte de ventas filtrable.

**Query Params:** igual que purchase-report.

---

### `GET /api/v1/quotation-report` 🔒
Reporte de cotizaciones.

**Query Params:**
| Parámetro     | Tipo    | Descripción              |
|---------------|---------|--------------------------|
| `search`      | string  | Buscar                   |
| `from_date`   | string  | Fecha inicio             |
| `to_date`     | string  | Fecha fin                |
| `no_paginate` | boolean | `true` para sin paginar  |

---

### `GET /api/v1/due-collects-report` 🔒
Reporte de cobros de deuda.

---

### `GET /api/v1/due-reports` 🔒
Reporte combinado de deudas pendientes (ventas + compras).

---

### `GET /api/v1/income-report` 🔒
Reporte de ingresos.

---

### `GET /api/v1/expense-report` 🔒
Reporte de gastos.

---

### `GET /api/v1/transaction-report` 🔒
Reporte de transacciones.

---

## 💹 Transacciones (Transactions)

### `GET /api/v1/transactions` 🔒
Listar transacciones del negocio.

**Query Params:**
| Parámetro   | Tipo   | Descripción            |
|-------------|--------|------------------------|
| `search`    | string | Buscar por monto       |
| `from_date` | string | Fecha inicio           |
| `to_date`   | string | Fecha fin              |

---

## 💱 Dinero In/Out

### `GET /api/v1/money-in-out` 🔒
Resumen de entradas y salidas de dinero del negocio.

---

## 👤 Perfil (Profile)

### `GET /api/v1/profile` 🔒
Obtener perfil del usuario autenticado.

### `POST /api/v1/profile` 🔒
Actualizar perfil del usuario.

---

### `POST /api/v1/change-password` 🔒
Cambiar contraseña del usuario autenticado.

**Body (JSON):**
```json
{
  "current_password": "actual_contraseña",
  "password": "nueva_contraseña",
  "password_confirmation": "nueva_contraseña"
}
```

---

## 🌍 Idioma (Language)

### `GET /api/v1/lang` 🔒
Obtener configuración de idioma del negocio.

### `POST /api/v1/lang` 🔒
Establecer idioma del negocio.

---

## 📄 Páginas de Contenido

### `GET /api/v1/about-us` 🔒
Obtener contenido de "Sobre Nosotros".

### `GET /api/v1/privacy-policy` 🔒
Obtener política de privacidad.

### `GET /api/v1/term-condition` 🔒
Obtener términos y condiciones.

---

## 🛍️ E-commerce (Subdominio)

> **URL base especial:** `http://{slug}.{APP_DOMAIN}/api/v1/ecommerce`
>
> Se accede mediante subdominio del negocio (ej: `mi-restaurante.midominio.com`).
> No requiere autenticación — es para clientes externos.

### `POST /api/v1/ecommerce/order`
Crear un pedido de e-commerce. Si el cliente no existe por teléfono, se crea automáticamente como parte de tipo `retailer`.

**Body (JSON):**
```json
{
  "customer_name": "María López",
  "customer_phone": "3001234567",
  "customer_address": "Calle 123 #45-67",
  "totalAmount": 35.00,
  "payment_method": "cash_on_delivery",
  "note": "Sin picante",
  "discountAmount": 0,
  "products": [
    {
      "product_id": 5,
      "quantities": 2,
      "sales_price": 17.50,
      "instructions": "Extra salsa",
      "variation_id": null,
      "detail_options": [
        { "option_id": 1, "modifier_id": 2 }
      ]
    }
  ]
}
```

**Respuesta `201`:**
```json
{
  "message": "Order placed successfully",
  "order_id": 88,
  "invoice_number": "#ECOMM-88"
}
```

---

## 📌 Notas Generales

### Autenticación
- Todos los endpoints marcados con 🔒 requieren el header:
  ```
  Authorization: Bearer {token}
  ```

### Paginación
- La mayoría de listados están paginados con **10 registros** por página.
- Agregar `?page=2` para navegar entre páginas.
- Agregar `?no_paginate=true` en los endpoints que lo soporten para obtener todos los registros.

### Estructura de respuesta estándar
```json
{
  "message": "Data fetched successfully.",
  "data": { ... }
}
```

### Errores comunes
| Código | Descripción                       |
|--------|-----------------------------------|
| `400`  | Bad Request — validación fallida  |
| `401`  | No autorizado                     |
| `404`  | Recurso no encontrado             |
| `406`  | Condición de negocio no cumplida  |
| `422`  | Error de validación               |
| `500`  | Error interno del servidor        |

### Formatos de fecha
Usar formato `YYYY-MM-DD`, por ejemplo: `2025-01-15`.

### Upload de imágenes
Los campos de imagen deben enviarse como `multipart/form-data`. El tamaño máximo es **5 MB por imagen**.
