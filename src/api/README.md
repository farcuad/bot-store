# 📨 API de WhaiBot — Documentación Completa

## Descripción general

WhaiBot expone una API REST para interactuar con los bots de WhatsApp de forma programática. Existen dos grupos de endpoints:

| Prefijo | Autenticación | Descripción |
|---|---|---|
| `POST /api/send-message` | `x-client-key`, `x-client-botid` | Envío de mensajes a contactos individuales |
| `GET/POST /api/groupsBots` | `x-client-key`, `x-client-botid` | Envío a grupos de WhatsApp |
| `/api/saas/*` | Firebase ID Token (`Bearer`) | Gestión de bots, configuración, sesiones, KB, templates, broadcasts |
| `/api/auth/*` | Ninguna / Firebase Token | Registro y perfil de usuario |

> **Dominio Base:** `https://whaibot.com`
> **Puerto local (desarrollo):** `3001` (configurable en `ADMIN_PORT` del `.env`)

---

## 🔐 Autenticación

### 1. `x-client-key` y `x-client-botid` — para envío de mensajes vía API

Todos los endpoints de envío (`/api/send-message`, `/api/groupsBots`) requieren estos headers:

```
x-client-key: <TU_CLIENT_KEY>
x-client-botid: <ID_DEL_BOT>
```

| Header | Descripción |
|---|---|
| `x-client-key` | Llave de seguridad del bot (campo `clientKey` en `platform/bots/registry/{botId}`) |
| `x-client-botid` | Identificador único del bot que enviará el mensaje |

> **Dónde encontrar el `clientKey`:** Firebase Console → Firestore → `platform` → `bots` → `registry` → `{botId}` → campo `clientKey`.

---

### 2. Firebase ID Token — para rutas SaaS (`/api/saas/*`)

Las rutas de gestión requieren un ID Token de Firebase en el header `Authorization`:

```
Authorization: Bearer <FIREBASE_ID_TOKEN>
```

Obtén el token con el SDK de Firebase en tu frontend:

```javascript
const token = await firebase.auth().currentUser.getIdToken();
```

---

## 📮 Endpoints de Envío (autenticación: `x-client-key` y `x-client-botid`)

### `POST /api/send-message` — Mensaje a contacto individual

Envía un mensaje de texto (o texto + imagen) a un número de WhatsApp.

**Headers:**

| Header | Valor |
|---|---|
| `Content-Type` | `application/json` |
| `x-client-key` | Tu `clientKey` |
| `x-client-botid` | ID del bot |

**Body JSON:**

```json
{
  "to": "584245435637",
  "message": "¡Hola! Tu pedido está listo 🎉",
  "fromMe": "Nombre del sistema que llama",
  "mediaUrl": "https://ejemplo.com/imagen.jpg"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `to` | `string` | ✅ | Número destino en formato internacional sin `+`. Ej: `584141234567` |
| `message` | `string` | ✅ | Texto del mensaje. Si `mediaUrl` está presente, se usa como caption |
| `fromMe` | `string` | ✅ | Identificador del sistema/persona que llama (se registra en logs) |
| `mediaUrl` | `string` | ❌ | URL pública de imagen para enviar como adjunto |

**Respuesta exitosa `200`:**

```json
{
  "success": true,
  "message": "Mensaje enviado a 584245435637@c.us"
}
```

**Códigos de error:**

| Código | Descripción |
|---|---|
| `400` | Faltan `to`, `message` o `fromMe` |
| `401` | `x-client-key` o `x-client-botid` ausente o incorrecto |
| `404` | El bot no existe o no ha iniciado |
| `409` | El bot no está en estado `ready` |
| `500` | Error interno al enviar |

---

### `GET /api/groupsBots` — Listar grupos del bot

Obtiene todos los grupos de WhatsApp en los que participa el bot y los sincroniza en Firestore bajo `bots/{botId}/groups`.

**Headers:** `x-client-key`, `x-client-botid`

**Respuesta `200`:**

```json
{
  "success": true,
  "groups": [
    { "id": "1234567890-1234567890@g.us", "name": "Clientes VIP" },
    { "id": "0987654321-0987654321@g.us", "name": "Soporte WhaiBot" }
  ]
}
```

---

### `POST /api/groupsBots` — Mensaje a grupo de WhatsApp

Envía un mensaje de texto (o texto + imagen) a un grupo de WhatsApp.

**Headers:** `Content-Type: application/json`, `x-client-key`, `x-client-botid`

**Body JSON:**

```json
{
  "to": "1234567890-1234567890@g.us",
  "message": "📢 Anuncio importante para el grupo",
  "fromMe": "Sistema de notificaciones",
  "mediaUrl": "https://ejemplo.com/banner.jpg"
}
```

| Campo | Tipo | Requerido | Descripción |
|---|---|---|---|
| `to` | `string` | ✅ | ID del grupo con formato `@g.us` |
| `message` | `string` | ✅ | Texto del mensaje |
| `fromMe` | `string` | ✅ | Identificador del sistema que llama |
| `mediaUrl` | `string` | ❌ | URL pública de imagen adjunta |

**Respuesta `200`:**

```json
{
  "success": true,
  "message": "Mensaje enviado al grupo 1234567890-1234567890@g.us"
}
```

---

## 🤖 Endpoints SaaS (autenticación: Firebase Token)

Base path: `/api/saas`

### Bots — Gestión

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots` | Listar bots del usuario (admins ven todos) |
| `POST` | `/bots` | Crear nuevo bot |
| `GET` | `/bots/:id` | Estado detallado de un bot |
| `PUT` | `/bots/:id/name` | Renombrar un bot |
| `DELETE` | `/bots/:id` | Eliminar bot y todos sus datos |

#### `POST /api/saas/bots` — Crear bot

```json
{
  "nombre": "Mi Bot de Ventas"
}
```

Respuesta incluye el `botId`, `clientKey` generado y metadatos del bot.

#### `PUT /api/saas/bots/:id/name` — Renombrar bot

```json
{ "nombre": "Nuevo Nombre" }
```

> **Nota:** actualiza el nombre en ambas colecciones Firestore (`platform/bots/registry` y `bots/{botId}`) de forma atómica.

---

### Bots — Ciclo de Vida

| Método | Ruta | Descripción |
|---|---|---|
| `POST` | `/bots/:id/start` | Iniciar el bot (muestra QR si no hay sesión) |
| `POST` | `/bots/:id/stop` | Detener el bot |
| `POST` | `/bots/:id/restart` | Reiniciar el bot |
| `POST` | `/bots/:id/clear-session` | Borrar sesión de Chrome (re-vincular QR) |
| `GET` | `/bots/:id/qr` | Obtener QR actual o estado del bot (sin auth) |

#### `GET /api/saas/bots/:id/qr` — Estado del QR (endpoint público)

No requiere autenticación. Útil para polling desde el frontend.

```json
// Bot listo
{ "ok": true, "status": "ready" }

// Bot mostrando QR
{ "ok": true, "status": "qr", "qr": "data:image/png;base64,..." }

// Otros estados: "idle", "initializing", "disconnected", "error"
{ "ok": true, "status": "initializing" }
```

---

### Bots — Configuración

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/config` | Obtener configuración completa del bot |
| `GET` | `/bots/:id/audio-settings` | Configuración de transcripción de audio |
| `PUT` | `/bots/:id/audio-settings` | Actualizar configuración de audio/OpenAI |

#### `PUT /api/saas/bots/:id/audio-settings`

```json
{
  "audioAnalysisEnabled": true,
  "openaiApiKey": "sk-..."
}
```

---

### Base de Conocimiento (`respuestas_info`)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/respuestas-info` | Listar todas las entradas de KB |
| `POST` | `/bots/:id/respuestas-info` | Crear nueva entrada |
| `PUT` | `/bots/:id/respuestas-info/:rid` | Actualizar entrada existente |
| `DELETE` | `/bots/:id/respuestas-info/:rid` | Eliminar entrada |

#### `POST /api/saas/bots/:id/respuestas-info`

```json
{
  "rid": "precio_producto_x",
  "texto": "El producto X cuesta $15",
  "activo": true
}
```

---

### Sesiones de Contactos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/sessions` | Listar todas las sesiones activas |
| `PATCH` | `/bots/:id/sessions/:sessionId` | Cambiar estado (`bot`/`human`) o nombre |
| `DELETE` | `/bots/:id/sessions/:sessionId` | Eliminar sesión (el contacto inicia desde cero) |

#### `PATCH /api/saas/bots/:id/sessions/:sessionId`

```json
{
  "estado": "bot",
  "contactName": "Juan Pérez"
}
```

---

### Mensajes No Entendidos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/no-entendidos` | Listar mensajes que el bot no entendió (últimos 200) |
| `PATCH` | `/bots/:id/no-entendidos/:mid/revisado` | Marcar como revisado |
| `DELETE` | `/bots/:id/no-entendidos/:mid` | Eliminar registro |

---

### Estadísticas

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/stats` | Obtener estadísticas del bot |

---

### Logs

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/logs` | Últimas 500 líneas del log de actividad |
| `DELETE` | `/bots/:id/logs` | Limpiar el archivo de logs (solo admins) |

---

### Templates de Mensajes

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/templates` | Listar templates |
| `POST` | `/bots/:id/templates` | Crear template |
| `PUT` | `/bots/:id/templates/:tid` | Actualizar template |
| `DELETE` | `/bots/:id/templates/:tid` | Eliminar template |

#### `POST /api/saas/bots/:id/templates`

```json
{
  "name": "Confirmación de pedido",
  "text": "¡Hola {name}! Tu pedido #{id} fue confirmado ✅",
  "imageUrl": "https://ejemplo.com/imagen.jpg"
}
```

---

### Broadcasts (Envío Masivo)

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/broadcasts` | Listar broadcasts (últimos 100) |
| `POST` | `/bots/:id/broadcasts` | Crear y programar un broadcast |
| `POST` | `/bots/:id/broadcasts/:bid/send` | Forzar envío inmediato |
| `DELETE` | `/bots/:id/broadcasts/:bid` | Cancelar y eliminar broadcast |

#### `POST /api/saas/bots/:id/broadcasts`

```json
{
  "templateSnapshot": {
    "text": "¡Hola {name}! Tenemos una oferta especial para ti 🎁",
    "imageUrl": "https://ejemplo.com/oferta.jpg"
  },
  "recipients": {
    "contactIds": ["584141234567@c.us", "584242345678@c.us"],
    "groupIds": ["1234567890-9876543210@g.us"]
  },
  "schedule": {
    "type": "now"
  }
}
```

| `schedule.type` | Descripción |
|---|---|
| `now` | Envío inmediato |
| `scheduled` | Envío en fecha/hora específica (requiere `schedule.at`) |
| `recurring` | Envío recurrente (requiere configuración de cron) |

---

### Grupos

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/groups` | Listar grupos WhatsApp del bot (requiere bot `ready`) |

---

### Export / Import de Configuración

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/bots/:id/export` | Exportar KB y prompt como JSON descargable |
| `POST` | `/bots/:id/import` | Importar configuración desde un JSON exportado |

---

## 🔑 Endpoints de Autenticación (`/api/auth/*`)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| `POST` | `/api/auth/firebase-verify` | Ninguna | Registrar/verificar usuario con Firebase token |
| `GET` | `/api/auth/me` | Bearer Token | Obtener perfil del usuario autenticado |

#### `POST /api/auth/firebase-verify`

```json
{
  "idToken": "<FIREBASE_ID_TOKEN>",
  "phone": "584141234567"
}
```

Respuesta:
```json
{
  "ok": true,
  "status": "approved",
  "profile": {
    "uid": "...",
    "email": "usuario@email.com",
    "role": "user",
    "status": "approved",
    "maxBots": 1,
    "trialEndsAt": 1712345678000
  }
}
```

> Nuevos usuarios quedan en estado `pending` hasta ser aprobados por un admin.

---

## 🧪 Ejemplos de Uso — Envío de Mensajes

### cURL — Texto simple

```bash
curl -X POST https://whaibot.com/api/send-message \
  -H "Content-Type: application/json" \
  -H "x-client-key: TU_CLIENT_KEY" \
  -H "x-client-botid: bot_1776008571136" \
  -d '{
    "to": "584245435637",
    "message": "Tu pedido #1234 está listo 🛍️",
    "fromMe": "Sistema de pedidos"
  }'
```

### cURL — Texto + imagen

```bash
curl -X POST https://whaibot.com/api/send-message \
  -H "Content-Type: application/json" \
  -H "x-client-key: TU_CLIENT_KEY" \
  -H "x-client-botid: bot_1776008571136" \
  -d '{
    "to": "584245435637",
    "message": "Mira nuestra nueva promoción 🎉",
    "fromMe": "Marketing",
    "mediaUrl": "https://ejemplo.com/promo.jpg"
  }'
```

### JavaScript / Fetch

```javascript
const response = await fetch("https://whaibot.com/api/send-message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-client-key": "TU_CLIENT_KEY",
    "x-client-botid": "bot_1776008571136",
  },
  body: JSON.stringify({
    to: "584245435637",
    message: "Tu pedido está listo 🎉",
    fromMe: "Tienda Online",
  }),
});

const result = await response.json();
// { success: true, message: "Mensaje enviado a 584245435637@c.us" }
```

### Python / requests — Envío a Contacto

```python
import requests

url = "https://whaibot.com/api/send-message"
headers = {
    "Content-Type": "application/json",
    "x-client-key": "TU_CLIENT_KEY",
    "x-client-botid": "bot_1776008571136"
}
payload = {
    "to": "584245435637",
    "message": "Tu pedido está listo 🎉",
    "fromMe": "Sistema Python"
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

### Python / requests — Envío a Grupo 🆕

```python
import requests

url = "https://whaibot.com/api/groupsBots"
headers = {
    "Content-Type": "application/json",
    "x-client-key": "TU_CLIENT_KEY",
    "x-client-botid": "bot_1776008571136"
}
payload = {
    "to": "1234567890-1234567890@g.us", # ID del grupo obtenido previamente
    "message": "📢 Notificación importante para el grupo",
    "fromMe": "Script de Alerta"
}

response = requests.post(url, headers=headers, json=payload)
print(response.json())
```

### n8n / Make / Zapier

Usa un nodo **HTTP Request** con:

- **Método:** `POST`
- **URL:** `https://whaibot.com/api/send-message`
- **Headers:**
  - `Content-Type: application/json`
  - `x-client-key: TU_CLIENT_KEY`
  - `x-client-botid: bot_1776008571136`
- **Body (JSON):**
  ```json
  {
    "to": "{{numero_destino}}",
    "message": "{{texto_del_mensaje}}",
    "fromMe": "n8n Automation"
  }
  ```

---

## 📂 Estructura Firestore

```
platform/
  bots/
    registry/
      {botId}/                    ← Registro del bot (fuente de verdad del nombre)
        botId: "bot_1776008571136"
        nombre: "Dulces Porciones"
        clientKey: "uuid-generado-automáticamente"
        ownerUid: "firebase-uid-del-usuario"
        active: true
        createdAt: 1712345678000

bots/
  {botId}/                        ← Config operativa del bot (sincronizada)
    nombre: "Dulces Porciones"    ← siempre igual al del registro
    activo: true
    isAutoResponseEnabled: true
    prompt_ia: "Eres un asistente..."
    openaiApiKey: "sk-..."
    audioAnalysisEnabled: false
    
    respuestas_info/              ← Base de conocimiento de la IA
      {rid}/
        texto: "El precio es..."
        descripcion_ia: "Cuando pregunten por precios..."
        activo: true
        requiere_horario: false
    
    sessions/                     ← Conversaciones activas
      {phoneNumber@c.us}/
        contactName: "Juan"
        status: "bot" | "human"
        last_interaction: 1712345678
        history: [...]
    
    templates/                    ← Templates de mensajes
    broadcasts/                   ← Campañas masivas
    horarios/
      atencion/                   ← Horario de atención
    mensajes_no_entendidos/       ← Mensajes sin respuesta adecuada
    estadisticas/

message_logs/                     ← Auditoría de mensajes enviados vía API
  {logId}/
    botId, from, to, body, fromMe, hasMedia, timestamp, status
```

---

## ⚠️ Consideraciones importantes

1. **El bot debe estar `ready`** para poder enviar mensajes. Si está en `qr`, `initializing` o `disconnected`, el envío falla con `409`.

2. **Formato del número destino:** Código de país + número, sin `+`. Ejemplos:
   - Venezuela: `584141234567`
   - Colombia: `571234567890`
   - México: `521551234567`

3. **IDs de grupos:** Tienen formato `XXXXXXXXXX-XXXXXXXXXX@g.us`. Obtenlos con `GET /api/saas/bots/:id/groups` (requiere Firebase Auth) o `GET /api/groupsBots` (requiere API Key).

4. **El `clientKey` es secreto** — nunca lo expongas en el frontend. Úsalo solo desde backend, n8n self-hosted, o herramientas server-side.

5. **Rate limiting de WhatsApp:** En envíos masivos, espera al menos 1–2 segundos entre mensajes para evitar bloqueos.

6. **Logs de auditoría:** Cada mensaje enviado vía `POST /api/send-message` queda registrado en `message_logs/` de Firestore con estado, origen y destino.

---

## 📁 Archivos clave del proyecto

```
src/
  api/
    routes.ts              ← Rutas públicas de API (/send-message, /groupsBots)
    WhatsappController.ts  ← Controladores para enviar mensajes y listar grupos
    authWhatsapp.ts        ← Valida x-client-key y x-client-botid
  admin/
    server.ts              ← Montaje de rutas y servidor Express (puerto 3001)
  saas/
    saasRoutes.ts          ← Todas las rutas /api/saas/*
    BotManager.ts          ← CRUD de bots, renameBot (actualiza ambas colecciones), getBotKey()
    BotInstance.ts         ← sendMessage(), sendImage(), sendMessageToChat(), getChats()
  services/
    broadcastScheduler.ts  ← Scheduler de broadcasts (now / scheduled / recurring)
```
