import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import {
  loadSessions,
  saveSessions,
  TWENTY_FOUR_HOURS,
} from "./services/sessionManager.js";
import { clasificarIntencion } from "./controllers/AiController.js";

dotenv.config();

const client = new Client({
  authStrategy: new LocalAuth(),
});

// --- Configuración Informativa ---
const TASA_BCV = 43.62;

const INFO_RESPUESTAS = {
  precio: `📦 *Listas de precios*:
1. *Yogurt 16 Oz* - 12$

2. *Tortas Frias 12 Oz* - (8 sabores)
    $1.5 BCV
    1$ en divisas
    $1.25 A partir de 5 unidades

3. *Bizcochos Marmoleados* - $15

4. *Tortas de Piña* -
    $1.25 BCV
    1$ en divisas
    1.25$ precio por docena

5. *Ponquesitos paquete de 8 unidades* -
    $1.25 BCV
    1$ en divisas

6. *Quesillo* - 
    $1.35 BCV
    1$ en divisas
    $16 la docena

7. *Palmeritas* - $14

8. *Ponqué 300 gramos* -
    $1.25 BCV
    1$ en divisas
    $1.25 precio por docena

9. *Torta ponqué 1.5 kg *
    $5 BCV`,

  ubicacion: `📍 *Ubicación*:
Av. Principal de los pozones, una cuadra antes del ambulatorio, Barinas Barinas.`,

  redes: `📱 *Siguemnos en Tiktok*:
- https://www.tiktok.com/@dulcesporciones`,

  pago_movil: `📲 *Información sobre Pagos*\n\nLo sentimos, no recibimos pagos por adelantado. 🚫\n\n¿Podemos ayudarte con alguna otra duda o información?`,

  agendacion: `🗓️ *Citas y Agendas*\n\nTe informamos que las agendas se gestionan **únicamente de forma personal**. \n\nPor favor, dirígete a nuestra ubicación física durante el horario de trabajo para coordinar tu espacio. 📍`,

  horario: `⏰ *Nuestro Horario de Atención*\n\n📅 *Martes a Sábados*\n\n📥 *Recepción de pedidos:* Después de las 12:00 PM\n🚚 *Despacho de entregas:* Desde las 2:00 PM hasta finalizar ruta.\n\n¡Estamos para servirte! ✨`,
};

// --- Respuestas del sistema ---
const SystemRespuestas = {
  saludoInicial: `¡Hola {name}! 👋 Bienvenido a *Dulces Porciones*.

Puedes consultarme por:
- 📦 *Listas de precios*
- 📍 *Ubicación*
- 📱 *Redes Sociales*
- ⏰ *Horarios de Atención*`,

  saludoRecontacto: `¡Hola de nuevo {name}! 👋 Qué gusto verte otra vez por *Dulces Porciones*.

¿En qué te puedo ayudar hoy?
- 📦 *Listas de precios*
- 📍 *Ubicación*
- 📱 *Redes Sociales*
- ⏰ *Horarios de Atención*`,

  noentendi: `¡Ups! 🤖 No estoy seguro de haber entendido bien.

Para ayudarte mejor, puedes:
* 📝 Describir brevemente tu duda.
* 👩 Escribir *'Hablar con Raquel'* para que una persona te atienda.
* 👋 Despedirte si ya tienes todo lo que necesitabas.

¿En qué más puedo apoyarte hoy?`,

  despedida: `¡Fue un gusto saludarte! 😊
Recuerda que si necesitas algo más, solo tienes que escribir. ¡Que tengas un excelente día! ✨`,
};

/** Reemplaza el placeholder {name} con el nombre real del contacto */
const renderizar = (template: string, name: string): string =>
  template.replace(/\{name\}/g, name);

// Al inicio de tu archivo, fuera de los eventos
const bootTime = Date.now();
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ Bot listo"));

client.on("message_create", async (msg) => {
  //console.log(msg); // Opcional: descomentar para depuración

  const messageTimestamp = msg.timestamp * 1000;
  if (messageTimestamp < bootTime) {
    return;
  }

  // Ignorar mensajes de broadcast y grupos
  if (msg.from === "status@broadcast" || msg.from.includes("@g.us")) return;

  // --- Gestión de Sesiones ---
  const sessions = await loadSessions();
  const nowInSeconds = Math.floor(Date.now() / 1000);

  // Intervención Humana: Si el mensaje es del dueño (fromMe)
  if (msg.fromMe) {
    const chat = await msg.getChat();
    const remoteId = chat.id._serialized;

    // Evitar que el bot se marque como humano a sí mismo al enviar sus respuestas automáticas
    // O al enviarse notificaciones a sí mismo (Raquel)
    const isBotResponse =
      Object.values(INFO_RESPUESTAS).some((resp) =>
        msg.body.includes(resp.slice(0, 20)),
      ) ||
      msg.body.includes("¡Hola") ||
      msg.body.includes("📢 Contestale al usuario");

    if (isBotResponse || remoteId === undefined) {
      return;
    }

    sessions[remoteId] = {
      last_interaction: nowInSeconds,
      status: "human",
    };
    await saveSessions(sessions);
    console.log(
      `👤 Intervención humana manual detectada para: ${remoteId}. Estado cambiado a 'human'.`,
    );
    return;
  }

  const from = msg.from;

  // Si el status es 'human', el bot ignora el mensaje
  if (sessions[from]?.status === "human") {
    console.log(
      `⏸️ Bot en pausa para ${from} (modo humano). Ignorando mensaje.`,
    );
    return;
  }

  // --- Regla de 24 Horas ---
  const session = sessions[from];
  const contact = await msg.getContact();
  let saludoEnviado = false;

  if (!session) {
    // para saludos
    // Usuario nuevo: crear sesión y enviar saludo inicial
    sessions[from] = {
      last_interaction: nowInSeconds,
      status: "bot",
    };
    await msg.reply(
      renderizar(SystemRespuestas.saludoInicial, contact.pushname || "amigo"),
    );
    console.log(`🆕 Nuevo usuario registrado: ${contact.pushname || from}`);
    saludoEnviado = true;
  } else if (nowInSeconds - session.last_interaction > TWENTY_FOUR_HOURS) {
    // Han pasado más de 24h: enviar saludo de re-contacto
    sessions[from] = {
      last_interaction: nowInSeconds,
      status: "bot",
    };
    await msg.reply(
      renderizar(
        SystemRespuestas.saludoRecontacto,
        contact.pushname || "amigo",
      ),
    );
    console.log(`🔄 Re-contacto con: ${contact.pushname || from}`);
    saludoEnviado = true;
  } else {
    // Actualizar last_interaction para usuarios activos
    sessions[from]!.last_interaction = nowInSeconds;
  }

  // --- Palabra Clave "Raquel" ---
  const textRaw = msg.body.trim().toLowerCase();
  if (textRaw.includes("raquel")) {
    const phoneNumber = msg.from.replace(/\D/g, "").slice(0, 12);
    await client.sendMessage(
      msg.to,
      `📢 Contestale al usuario ${contact.pushname || "amigo"}! ${phoneNumber}, que quiere: ${msg.body}`,
    );
    console.log(`🔔 Notificación enviada al dueño sobre "Raquel" de ${from}`);
  }

  // --- Clasificación de Intención por IA (solo si no se envió saludo ya) ---
  if (!saludoEnviado) {
    try {
      const intencion = await clasificarIntencion(msg.body);
      console.log(
        `🧠 Intención detectada por IA: "${intencion}" para ${contact.pushname || from}`,
      );

      if (intencion === "noentendi") {
        await msg.reply(SystemRespuestas.noentendi);
      } else if (intencion === "despedida") {
        await msg.reply(SystemRespuestas.despedida);
      } else {
        // La intención corresponde a una clave de INFO_RESPUESTAS
        const respuesta = (INFO_RESPUESTAS as Record<string, string>)[
          intencion
        ];
        if (respuesta) {
          await msg.reply(respuesta);
        } else {
          await msg.reply(SystemRespuestas.noentendi);
        }
      }
    } catch (error) {
      console.error("❌ Error al procesar intención:", error);
    }
  }

  // Guardar sesiones al final
  await saveSessions(sessions);
});

client.initialize();
