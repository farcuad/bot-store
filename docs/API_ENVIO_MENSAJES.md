# 📨 API de Envío de Mensajes — WhaiBot

## Descripción general

El sistema expone un endpoint REST para enviar mensajes de WhatsApp a través de cualquier bot registrado en la plataforma. La autenticación se hace mediante una **API Key por bot** (`clientKey`) almacenada en Firestore.

---

## 🔐 Autenticación

Todos los requests al endpoint de envío deben incluir la **API Key del bot** en el header HTTP:

```
x-client-key: <TU_CLIENT_KEY>
```

Hay dos niveles de autenticación:

| Tipo                         | Descripción                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------- |
| **Llave maestra global**     | La variable de entorno `API_KEY` del servidor. Tiene acceso a todos los bots.           |
| **Llave específica por bot** | El campo `clientKey` del registro del bot en Firestore. Solo permite acceder a ese bot. |

---

## 📮 Endpoint de envío

```
POST /api/send-message
```

### Headers requeridos

| Header         | Valor                                       |
| -------------- | ------------------------------------------- |
| `Content-Type` | `application/json`                          |
| `x-client-key` | Tu `clientKey` o la llave maestra `API_KEY` |

### Body JSON

```json
{
  "to": "584245435637",
  "message": "Hola! Tu pedido está listo 🎉",
  "botId": "584268691664"
}
```

| Campo     | Tipo     | Requerido      | Descripción                                                            |
| --------- | -------- | -------------- | ---------------------------------------------------------------------- |
| `to`      | `string` | ✅ Sí          | Número de destino en formato internacional sin `+`. Ej: `584245435637` |
| `message` | `string` | ✅ Sí          | Texto del mensaje a enviar                                             |
| `botId`   | `string` | ✅ Sí          | ID del bot que enviará el mensaje.                                     |

### Respuesta exitosa (200)

```json
{
  "succes": true,
  "message": "Mensaje enviado a 584245435637"
}
```

### Respuestas de error

| Código | Descripción                                     |
| ------ | ----------------------------------------------- |
| `400`  | Faltan `to` o `message` en el body              |
| `401`  | `x-client-key` ausente o incorrecto para el bot |
| `404`  | El `botId` no existe o el bot no está iniciado  |
| `500`  | Error interno al enviar                         |

---

## 📂 Dónde vive el `clientKey` en Firestore

La arquitectura de Firestore sigue esta ruta:

```
platform/
  bots/
    registry/
      {botId}/           ← documento del bot
        botId: "584268691664"
        nombre: "Dulces Porciones"
        clientKey: "sk_xxxxxxxxxxxxxxxx"   ← AQUÍ ESTÁ LA API KEY
        ownerUid: "firebase-uid-del-usuario"
        active: true
        createdAt: 1712345678000
```

Para el bot de ejemplo con número **584268691664**, la ruta completa en Firestore es:

```
platform/bots/registry/584268691664
```

### Cómo ver / copiar el `clientKey` desde Firebase Console

1. Abre [Firebase Console](https://console.firebase.google.com)
2. Selecciona tu proyecto
3. Ve a **Firestore Database**
4. Navega: `platform` → `bots` → `registry` → `584268691664`
5. Copia el valor del campo `clientKey`

---

## 🧪 Ejemplos de uso

### cURL

```bash
curl -X POST localhost:3000/api/send-message \
  -H "Content-Type: application/json" \
  -H "x-client-key: 12345678" \
  -d '{
    "to": "584245435637",
    "message": "Tu pedido #1234 está listo para retirar 🛍️",
    "botId": "584268691664"
  }'
```

### JavaScript / Fetch

```javascript
const response = await fetch("https://tudominio.com/api/send-message", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-client-key": "sk_xxxxxxxxxxxxxxxx",
  },
  body: JSON.stringify({
    to: "584245435637",
    message: "Tu pedido está listo 🎉",
    botId: "584268691664",
  }),
});

const result = await response.json();
console.log(result); // { succes: true, message: "Mensaje enviado a 584245435637" }
```

### Python / requests

```python
import requests

response = requests.post(
    'https://tudominio.com/api/send-message',
    headers={
        'Content-Type': 'application/json',
        'x-client-key': 'sk_xxxxxxxxxxxxxxxx',
    },
    json={
        'to': '584245435637',
        'message': 'Tu pedido está listo 🎉',
        'botId': '584268691664',
    }
)
print(response.json())
```

### n8n / Make / Zapier

Usa un nodo **HTTP Request** con:

- **Método:** `POST`
- **URL:** `https://tudominio.com/api/send-message`
- **Headers:**
  - `Content-Type: application/json`
  - `x-client-key: sk_xxxxxxxxxxxxxxxx`
- **Body (JSON):**
  ```json
  {
    "to": "{{numero_destino}}",
    "message": "{{texto_del_mensaje}}",
    "botId": "584268691664"
  }
  ```

---

## 🤖 Cómo saber el `botId` de cada bot

El `botId` de cada bot está disponible en:

1. **Panel de administración** → `Mis Bots` → bajo el nombre de cada bot:

   ```
   bot_1774909948909   ← este es el botId
   584268691664        ← o puede ser el número de teléfono directamente
   ```

2. **Firestore** → `platform/bots/registry/` → cada documento tiene su ID como `botId`

### Bots del sistema actualmente registrados (ejemplo)

| Nombre                | botId               | Estado        |
| --------------------- | ------------------- | ------------- |
| Bot WhaiBot           | `bot_1774909948909` | Esperando QR  |
| Boot Personal Trainer | `bot_1775061382356` | Inicializando |
| Dulces Porciones      | `584268691664`      | ✅ Activo     |

---

## ⚠️ Consideraciones importantes

1. **El bot debe estar en estado `ready`** para poder enviar mensajes. Si está en `qr`, `initializing` o `disconnected`, el envío fallará con 404.

2. **Formato del número:** Siempre incluye el código de país sin `+`. Ejemplos:
   - Venezuela: `584141234567`
   - Colombia: `584245435637`
   - México: `521551234567`

3. **Rate limiting:** WhatsApp puede bloquear números que envíen mensajes masivos muy rápido. Respeta pausas entre envíos en campañas masivas (mínimo 1-2 segundos entre mensaje y mensaje).

4. **El `clientKey` es sensible** — no lo expongas en el frontend. Úsalo solo desde un servidor backend o desde herramientas server-side como n8n self-hosted.

5. **Si no tienes `clientKey` configurado**, contacta al administrador para que lo genere desde Firestore o lo configure al crear el bot.

---

## 🔧 Cómo generar / asignar un `clientKey` a un bot

Si el bot no tiene `clientKey`, un admin puede asignarlo directamente en Firestore:

1. Ve a `platform/bots/registry/{botId}`
2. Agrega el campo `clientKey` con un valor seguro:
   ```
   clientKey: "sk_" + uuid_generado
   ```

O bien, usa la llave maestra (`API_KEY` del `.env`) mientras tanto.

---

## 📁 Estructura del proyecto relacionada

```
src/
  admin/
    routes.ts              ← Declara POST /api/send-message con validateApiKey
    WhatsappController.ts  ← Controlador: extrae botId, llama instance.sendMessage()
  middlewares/
    authWhatsapp.ts        ← Valida x-client-key contra Firestore o API_KEY global
  saas/
    BotManager.ts          ← getBotKey() lee clientKey desde platform/bots/registry/{botId}
    BotInstance.ts         ← sendMessage() usa whatsapp-web.js para enviar
```
