import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
dotenv.config();

import {
  getSession,
  saveSession,
  appendToHistory,
  getStatusFromFirestore,
  TWENTY_FOUR_HOURS,
  AUTO_REACTIVATE_SECONDS,
} from "./services/sessionManager.js";
import { generarRespuestaBot } from "./controllers/AiController.js";
import {
  loadStats,
  saveStats,
  incrementarMensajesRespondidos,
  incrementarUsuariosUnicos,
  imprimirResumenStats,
} from "./services/statsManager.js";
import {
  loadConfig,
  startConfigRefresh,
  getConfig,
  getNombre,
  registrarNoEntendido,
} from "./services/configService.js";
import { startAdminServer } from "./admin/server.js";

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Lee una respuesta de sistema del cache de Firestore */
function sys(key: string): string {
  return getConfig().respuestas_sistema[key]?.texto ?? "";
}

/** Reemplaza el placeholder {name} con el nombre del contacto */
const render = (text: string, name: string): string =>
  text.replace(/\{name\}/g, name);

// ─── Inicio ───────────────────────────────────────────────────────────────────
const bootTime = Date.now();

await loadConfig();
startConfigRefresh();
startAdminServer();
await loadStats();
imprimirResumenStats();

client.on("qr", (qr) => qrcode.generate(qr, { small: true }));
client.on("ready", () => console.log("✅ Bot listo y operativo."));

// ─── Manejador principal de mensajes ─────────────────────────────────────────
client.on("message_create", async (msg) => {
  if (msg.timestamp * 1000 < bootTime) return;
  if (msg.from === "status@broadcast" || msg.from.includes("@g.us")) return;

  const nowInSeconds = Math.floor(Date.now() / 1000);

  // ── Intervención humana: mensaje del dueño (fromMe) ───────────────────────
  if (msg.fromMe) {
    const chat = await msg.getChat();
    const remoteId = chat.id._serialized;

    const remoteSession = await getSession(remoteId);
    const sessionHistory = remoteSession?.history;
    const isHistoryMatch = (() => {
      if (!sessionHistory || sessionHistory.length === 0) return false;
      const lastMsg = sessionHistory[sessionHistory.length - 1];
      if (!lastMsg) return false;
      return (
        lastMsg.role === "assistant" &&
        lastMsg.content.trim() === msg.body.trim()
      );
    })();

    const botTexts = [
      ...Object.values(getConfig().respuestas_info).map((r) => r.texto),
      ...Object.values(getConfig().respuestas_sistema).map((r) => r.texto),
      "📢 Contestale al usuario",
    ];

    const isTextMatch = botTexts.some((texto) => {
      if (!texto) return false;
      const parts = texto.split("{name}");
      const prefix = (parts[0] || "").trim().slice(0, 25);
      if (prefix.length > 4 && msg.body.startsWith(prefix)) return true;
      if (parts.length > 1) {
        const suffix = (parts[1] || "").trim().slice(0, 25);
        if (suffix.length > 4 && msg.body.includes(suffix)) return true;
      }
      return msg.body.startsWith(texto.trim().slice(0, 25));
    });

    if (isHistoryMatch || isTextMatch) return;

    await saveSession(remoteId, {
      last_interaction: nowInSeconds,
      status: "human",
      human_since: nowInSeconds,
      history: remoteSession?.history ?? [],
    });
    console.log(`👤 Intervención humana en ${remoteId}.`);
    return;
  }

  const from = msg.from;

  // ── Manejo de media ───────────────────────────────────────────────────────
  const isMedia =
    msg.hasMedia ||
    ["image", "video", "audio", "ptt", "sticker", "document"].includes(
      msg.type,
    );

  if (isMedia && msg.type !== "sticker") {
    console.log(`📸 Media (${msg.type}) de ${from}.`);
    await msg.reply(sys("mediaRecibida"));
    return;
  }
  if (isMedia) return;

  // ── Auto-reactivación tras inactividad humana ─────────────────────────────
  // Leer status SIEMPRE fresco desde Firestore para detectar cambios externos
  const session = await getSession(from);
  const currentStatus = await getStatusFromFirestore(from);

  if (currentStatus === "human") {
    const humanSince = session?.human_since;
    if (humanSince !== undefined) {
      const elapsed = nowInSeconds - humanSince;
      if (elapsed >= AUTO_REACTIVATE_SECONDS) {
        console.log(
          `🔄 Auto-reactivando bot para ${from} (${Math.floor(elapsed / 60)} min).`,
        );
        await saveSession(from, {
          last_interaction: nowInSeconds,
          status: "bot",
          history: session?.history ?? [],
        });
        await msg.reply(sys("botReactivado"));
        return;
      }
    }
    console.log(`⏸️ Modo humano activo para ${from}. Ignorando.`);
    return;
  }

  // ── Gestión de sesión ─────────────────────────────────────────────────────
  const contact = await msg.getContact();
  const nombre = contact.pushname || "amigo";
  let instruccionExtra = "";

  if (!session) {
    const newSession = {
      last_interaction: nowInSeconds,
      status: "bot" as const,
      history: [],
    };
    await saveSession(from, newSession);
    incrementarUsuariosUnicos();
    console.log(`🆕 Nuevo usuario: ${nombre}`);

    const mensajeBienvenida = render(sys("saludoInicial"), nombre);
    instruccionExtra = `El usuario te está escribiendo por primera vez. Tu tarea es darle una cálida bienvenida basándote en esta plantilla: "${mensajeBienvenida}", y además responder a lo que te acaba de escribir.`;
  } else if (nowInSeconds - session.last_interaction > TWENTY_FOUR_HOURS) {
    const renewedSession = {
      last_interaction: nowInSeconds,
      status: "bot" as const,
      history: [],
    };
    await saveSession(from, renewedSession);
    console.log(`🔄 Re-contacto: ${nombre}`);

    const mensajeRecontacto = render(sys("saludoRecontacto"), nombre);
    instruccionExtra = `El usuario volvió a escribir después de mucho tiempo. Tu tarea es saludarlo basándote en esta plantilla: "${mensajeRecontacto}", y además responder a lo que te acaba de escribir.`;
  } else {
    session.last_interaction = nowInSeconds;
    await saveSession(from, session);
  }

  // Obtener la sesión actualizada del cache en memoria
  const activeSession = (await getSession(from))!;
  appendToHistory(activeSession, "user", msg.body);

  // (El detector hardcodeado de "Raquel" fue reemplazado por la etiqueta de IA [HABLAR_CON_HUMANO])

  // ── Generación de respuesta (IA) ──────────────────────────────────────────
  try {
    let respuesta = await generarRespuestaBot(
      activeSession.history,
      getNombre(),
      getConfig().respuestas_info,
      instruccionExtra
    );

    // Si la IA no entendió, usamos el tag para registrar en Firestore y purgar el mensaje
    if (respuesta.includes("[NO_ENTENDI]")) {
      respuesta = respuesta.replace("[NO_ENTENDI]", "").trim();
      await registrarNoEntendido(msg.body, from, nombre);
      console.log(`📝 Mensaje no entendido registrado: ${msg.body}`);
    }

    // Si la IA detecta que el usuario quiere hablar con un humano
    if (respuesta.includes("[HABLAR_CON_HUMANO]")) {
      respuesta = respuesta.replace("[HABLAR_CON_HUMANO]", "").trim();

      const avisoCliente = sys("agenteAviso");
      respuesta = respuesta ? `${respuesta}\n\n${avisoCliente}` : avisoCliente;

      activeSession.status = "human";
      activeSession.human_since = nowInSeconds;
      await saveSession(from, activeSession);

      const phoneNumber = msg.from.replace(/\D/g, "").slice(0, 12);
      await client.sendMessage(
        msg.to,
        `📢 Contestale al usuario ${nombre}! ${phoneNumber}, que quiere: ${msg.body}`,
      );
      console.log(`🔔 Bot pausado para ${from}. Notificación enviada.`);
    }

    incrementarMensajesRespondidos();
    await msg.reply(respuesta);
    appendToHistory(activeSession, "assistant", respuesta);
    // Persiste la sesión actualizada (last_interaction y status al día)
    await saveSession(from, activeSession);
  } catch (error) {
    console.error("❌ Error generando respuesta:", error);
  }

  // ── Stats ──────────────────────────────────────────────────────────────────
  await saveStats();
});

client.initialize();

export async function senBotMessage(to: string, message: string) {
  const chatId = to.includes("@c.us") ? to : `${to.replace(/\D/g, "")}@c.us`;
  await client.sendMessage(chatId, message);
}
