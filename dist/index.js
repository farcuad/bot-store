import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
import {
  loadSessions,
  saveSessions,
  appendToHistory,
  TWENTY_FOUR_HOURS,
  AUTO_REACTIVATE_SECONDS,
} from "./services/sessionManager.js";
import { clasificarIntencion } from "./controllers/AiController.js";
import {
  loadStats,
  saveStats,
  incrementarIntencion,
  incrementarUsuariosUnicos,
  imprimirResumenStats,
} from "./services/statsManager.js";
dotenv.config();
const client = new Client({
  authStrategy: new LocalAuth(),
});
// ─── Horario de atención ────────────────────────────────────────────────────
// Mar-Sáb, recepción de pedidos desde las 12:00 PM
const DIAS_HABIL = [2, 3, 4, 5, 6]; // 0=Dom, 1=Lun, 2=Mar...6=Sáb
function isWithinBusinessHours() {
  // Hora Venezuela (UTC-4)
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Caracas" }),
  );
  const day = now.getDay();
  const hour = now.getHours();
  return DIAS_HABIL.includes(day) && hour >= 12;
}
function getOutOfHoursMessage() {
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Caracas" }),
  );
  const day = now.getDay();
  const isWeekend = !DIAS_HABIL.includes(day);
  if (isWeekend) {
    return (
      `⏰ ¡Hola! Por el momento estamos fuera de horario.\n\n` +
      `📅 Atendemos de *Martes a Sábado* desde las *12:00 PM*.\n\n` +
      `Puedo ayudarte con información de precios, ubicación y horarios. ` +
      `¡Escríbenos dentro del horario para coordinar tu pedido! 🎂`
    );
  }
  return (
    `⏰ ¡Hola! Aún no hemos abierto hoy.\n\n` +
    `📅 Recibimos pedidos a partir de las *12:00 PM* (Martes a Sábado).\n\n` +
    `Puedo ayudarte con preguntas sobre precios, ubicación y horarios. ` +
    `¡Vuelve en horario de atención! 🎂`
  );
}
// ─── Respuestas informativas ─────────────────────────────────────────────────
const INFO_RESPUESTAS = {
  precio: `📦 *Listas de precios*:\n1. *Yogurt 16 Oz* - 12$\n\n2. *Tortas Frias 12 Oz* - (8 sabores)\n    $1.5 BCV\n    1$ en divisas\n    $1.25 A partir de 5 unidades\n\n3. *Bizcochos Marmoleados* - $15\n\n4. *Tortas de Piña* -\n    $1.25 BCV\n    1$ en divisas\n    1.25$ precio por docena\n\n5. *Ponquesitos paquete de 8 unidades* -\n    $1.25 BCV\n    1$ en divisas\n\n6. *Quesillo* - \n    $1.35 BCV\n    1$ en divisas\n    $16 la docena\n\n7. *Palmeritas* - $14\n\n8. *Ponqué 300 gramos* -\n    $1.25 BCV\n    1$ en divisas\n    $1.25 precio por docena\n\n9. *Torta ponqué 1.5 kg *\n    $5 BCV`,
  ubicacion: `📍 *Ubicación*:\nAv. Principal de los pozones, una cuadra antes del ambulatorio, Barinas Barinas.`,
  redes: `📱 *Siguemnos en Tiktok*:\n- https://www.tiktok.com/@dulcesporciones`,
  pago_movil: `📲 *Información sobre Pagos*\n\nLo sentimos, no recibimos pagos por adelantado. 🚫\n\n¿Podemos ayudarte con alguna otra duda o información?`,
  agendacion: `🗓️ *Citas y Agendas*\n\nTe informamos que las agendas se gestionan **únicamente de forma personal**. \n\nPor favor, dirígete a nuestra ubicación física durante el horario de trabajo para coordinar tu espacio. 📍`,
  horario: `⏰ *Nuestro Horario de Atención*\n\n📅 *Martes a Sábados*\n\n📥 *Recepción de pedidos:* Después de las 12:00 PM\n🚚 *Despacho de entregas:* Desde las 2:00 PM hasta finalizar ruta.\n\n¡Estamos para servirte! ✨`,
};
// ─── Respuestas del sistema ──────────────────────────────────────────────────
const SystemRespuestas = {
  saludoInicial: `¡Hola {name}! 👋 Bienvenido a *Dulces Porciones*.\n\nPuedes consultarme por:\n- 📦 *Listas de precios*\n- 📍 *Ubicación*\n- 📱 *Redes Sociales*\n- ⏰ *Horarios de Atención*`,
  saludoRecontacto: `¡Hola de nuevo {name}! 👋 Qué gusto verte otra vez por *Dulces Porciones*.\n\n¿En qué te puedo ayudar hoy?\n- 📦 *Listas de precios*\n- 📍 *Ubicación*\n- 📱 *Redes Sociales*\n- ⏰ *Horarios de Atención*`,
  noentendi: `¡Ups! 🤖 No estoy seguro de haber entendido bien.\n\nPara ayudarte mejor, puedes:\n* 📝 Describir brevemente tu duda.\n* 👩 Escribir *'Hablar con Raquel'* para que una persona te atienda.\n* 👋 Despedirte si ya tienes todo lo que necesitabas.\n\n¿En qué más puedo apoyarte hoy?`,
  despedida: `¡Fue un gusto saludarte! 😊\nRecuerda que si necesitas algo más, solo tienes que escribir. ¡Que tengas un excelente día! ✨`,
  mediaRecibida: `📎 ¡Recibí tu mensaje! Sin embargo, solo puedo leer *texto* por ahora.\n\n¿Podrías escribirme tu consulta con palabras? 😊\n\nPor ejemplo:\n- _"¿Cuánto cuesta el quesillo?"_\n- _"¿Dónde están ubicados?"_`,
  agenteAvisoCliente: `👩 ¡Perfecto! Ya avisé a *Raquel* y pronto te atenderá personalmente. 🙌\n\nEn un momento te contactará. ¡Gracias por tu paciencia! 💛`,
  botReactivado: `👋 ¡Hola de nuevo! Estoy de vuelta para ayudarte.\n\nSi necesitas hablar con una persona, escribe *'Raquel'* y te comunicamos de inmediato. 😊`,
};
const INTENCIONES_HORARIO = new Set(["agendacion", "pago_movil"]);
/** Reemplaza el placeholder {name} con el nombre real del contacto */
const renderizar = (template, name) => template.replace(/\{name\}/g, name);
// ─── Inicio del bot ──────────────────────────────────────────────────────────
const bootTime = Date.now();
// Cargar estadísticas al arrancar
await loadStats();
imprimirResumenStats();
client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ Bot listo y operativo."));
// ─── Manejador principal de mensajes ─────────────────────────────────────────
client.on("message_create", async (msg) => {
  const messageTimestamp = msg.timestamp * 1000;
  if (messageTimestamp < bootTime) return;
  // Ignorar mensajes de broadcast y grupos
  if (msg.from === "status@broadcast" || msg.from.includes("@g.us")) return;
  // ── Gestión de sesiones ──────────────────────────────────────────────────
  const sessions = await loadSessions();
  const nowInSeconds = Math.floor(Date.now() / 1000);
  // ── Intervención humana: Si el mensaje es del dueño (fromMe) ─────────────
  if (msg.fromMe) {
    const chat = await msg.getChat();
    const remoteId = chat.id._serialized;
    const isBotResponse =
      Object.values(INFO_RESPUESTAS).some((resp) =>
        msg.body.includes(resp.slice(0, 20)),
      ) ||
      msg.body.includes("¡Hola") ||
      msg.body.includes("📢 Contestale al usuario");
    if (isBotResponse || remoteId === undefined) return;
    sessions[remoteId] = {
      last_interaction: nowInSeconds,
      status: "human",
      human_since: nowInSeconds,
      history: sessions[remoteId]?.history ?? [],
    };
    await saveSessions(sessions);
    console.log(`👤 Intervención humana para: ${remoteId} → modo 'human'.`);
    return;
  }
  const from = msg.from;
  // ── Manejo de media (audio, imagen, video, sticker) ───────────────────────
  const isMedia =
    msg.hasMedia ||
    ["image", "video", "audio", "ptt", "sticker", "document"].includes(
      msg.type,
    );
  if (isMedia && msg.type !== "sticker") {
    console.log(
      `📸 Media recibido de ${from} (tipo: ${msg.type}). Respondiendo.`,
    );
    await msg.reply(SystemRespuestas.mediaRecibida);
    return;
  }
  if (isMedia) return; // silenciar stickers
  // ── Verificar auto-reactivación del bot ───────────────────────────────────
  const session = sessions[from];
  if (session?.status === "human" && session.human_since !== undefined) {
    const tiempoEnModoHumano = nowInSeconds - session.human_since;
    if (tiempoEnModoHumano >= AUTO_REACTIVATE_SECONDS) {
      console.log(
        `🔄 Auto-reactivando bot para ${from} tras ${Math.floor(tiempoEnModoHumano / 60)} min sin respuesta humana.`,
      );
      sessions[from] = {
        last_interaction: nowInSeconds,
        status: "bot",
        history: session.history ?? [],
      };
      await saveSessions(sessions);
      await msg.reply(SystemRespuestas.botReactivado);
      return;
    }
    // Aún en modo humano: ignorar
    console.log(`⏸️ Bot en pausa para ${from} (modo humano). Ignorando.`);
    return;
  }
  // ── Gestión inicial de sesión (nuevo usuario / re-contacto) ───────────────
  const contact = await msg.getContact();
  const nombre = contact.pushname || "amigo";
  let saludoEnviado = false;
  if (!session) {
    sessions[from] = {
      last_interaction: nowInSeconds,
      status: "bot",
      history: [],
    };
    const saludo = renderizar(SystemRespuestas.saludoInicial, nombre);
    await msg.reply(saludo);
    incrementarUsuariosUnicos();
    console.log(`🆕 Nuevo usuario: ${nombre}`);
    saludoEnviado = true;
  } else if (nowInSeconds - session.last_interaction > TWENTY_FOUR_HOURS) {
    sessions[from] = {
      last_interaction: nowInSeconds,
      status: "bot",
      history: [], // reiniciar historial tras 24h
    };
    const saludo = renderizar(SystemRespuestas.saludoRecontacto, nombre);
    await msg.reply(saludo);
    console.log(`🔄 Re-contacto con: ${nombre}`);
    saludoEnviado = true;
  } else {
    sessions[from].last_interaction = nowInSeconds;
  }
  // ── Añadir mensaje del usuario al historial ───────────────────────────────
  appendToHistory(sessions[from], "user", msg.body);
  // ── Detector de palabra clave "Raquel" ────────────────────────────────────
  const textRaw = msg.body.trim().toLowerCase();
  if (textRaw.includes("raquel")) {
    // 1. Avisar al cliente PRIMERO (pausa inmediata)
    await msg.reply(SystemRespuestas.agenteAvisoCliente);
    appendToHistory(
      sessions[from],
      "assistant",
      SystemRespuestas.agenteAvisoCliente,
    );
    // 2. Pausar el bot para este usuario
    sessions[from].status = "human";
    sessions[from].human_since = nowInSeconds;
    // 3. Notificar a la dueña
    const phoneNumber = msg.from.replace(/\D/g, "").slice(0, 12);
    await client.sendMessage(
      msg.to,
      `📢 Contestale al usuario ${nombre}! ${phoneNumber}, que quiere: ${msg.body}`,
    );
    console.log(`🔔 Raquel notificada sobre ${from}. Bot pausado.`);
    await saveSessions(sessions);
    await saveStats();
    return;
  }
  // ── Clasificación de intención por IA ─────────────────────────────────────
  if (!saludoEnviado) {
    try {
      const historial = sessions[from].history.slice(0, -1); // sin el último (ya es el actual)
      const intencion = await clasificarIntencion(msg.body, historial);
      console.log(`🧠 Intención: "${intencion}" para ${nombre}`);
      // Contabilizar estadística
      incrementarIntencion(intencion);
      let respuesta;
      if (intencion === "noentendi") {
        respuesta = SystemRespuestas.noentendi;
      } else if (intencion === "despedida") {
        respuesta = SystemRespuestas.despedida;
      } else {
        const infoResp = INFO_RESPUESTAS[intencion];
        // Detectar si la intención requiere estar en horario hábil
        if (INTENCIONES_HORARIO.has(intencion) && !isWithinBusinessHours()) {
          respuesta = getOutOfHoursMessage();
        } else {
          respuesta = infoResp ?? SystemRespuestas.noentendi;
        }
      }
      await msg.reply(respuesta);
      appendToHistory(sessions[from], "assistant", respuesta);
    } catch (error) {
      console.error("❌ Error al procesar intención:", error);
    }
  } else {
    // Cuando se envió saludo, verificar horario fuera de servicio
    if (!isWithinBusinessHours()) {
      const avisoHorario = getOutOfHoursMessage();
      await msg.reply(avisoHorario);
      appendToHistory(sessions[from], "assistant", avisoHorario);
    }
  }
  // ── Persistir sesiones y estadísticas ────────────────────────────────────
  await saveSessions(sessions);
  await saveStats();
});
client.initialize();
//# sourceMappingURL=index.js.map
