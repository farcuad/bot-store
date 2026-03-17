# Walkthrough: Sistema de Gestión de Sesiones

## Archivos creados/modificados

| Archivo | Acción | Descripción |
|---|---|---|
| [sessionManager.ts](file:///c:/Users/Andres/Documents/proyectos/proyecto-attclient/src/services/sessionManager.ts) | **NEW** | Módulo con [loadSessions()](file:///c:/Users/Andres/Documents/proyectos/proyecto-attclient/src/services/sessionManager.ts#22-35), [saveSessions()](file:///c:/Users/Andres/Documents/proyectos/proyecto-attclient/src/services/sessionManager.ts#36-42), interfaces y constante `TWENTY_FOUR_HOURS` |
| [sessions.json](file:///c:/Users/Andres/Documents/proyectos/proyecto-attclient/sessions.json) | **NEW** | Archivo JSON inicial vacío `{}` |
| [index.ts](file:///c:/Users/Andres/Documents/proyectos/proyecto-attclient/src/index.ts) | **MODIFIED** | Integración completa del sistema de sesiones en `client.on('message')` |

## Flujo lógico implementado

```mermaid
flowchart TD
    A[Mensaje recibido] --> B{broadcast o grupo?}
    B -->|Sí| Z[Ignorar]
    B -->|No| C[Cargar sessions.json]
    C --> D{msg.fromMe?}
    D -->|Sí| E["Marcar status: 'human' + guardar"]
    D -->|No| F{status === human?}
    F -->|Sí| Z
    F -->|No| G{Usuario existe en JSON?}
    G -->|No| H["Crear con status: 'bot' + Saludo Inicial"]
    G -->|Sí| I{Pasaron > 24h?}
    I -->|Sí| J[Saludo de Re-contacto]
    I -->|No| K[Actualizar last_interaction]
    H & J & K --> L{Contiene 'Raquel'?}
    L -->|Sí| M["Notificar al dueño (msg.to)"]
    L -->|No| N[Lógica de keywords existente]
    M --> N
    N --> O[Guardar sessions.json]
```

## Consideraciones técnicas

- **Timestamps**: Se usa `Math.floor(Date.now() / 1000)` para convertir ms → s y comparar con los timestamps de WhatsApp.
- **I/O asíncrono**: Se usan `fs.promises` para no bloquear el event loop.
- **Ruta del JSON**: Se resuelve con `path.resolve(__dirname, '../../sessions.json')` relativa al directorio del módulo compilado.

## Verificación

- ✅ `npm run build` — compilación exitosa sin errores de TypeScript.
