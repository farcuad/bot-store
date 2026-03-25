import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import dotenv from "dotenv";
dotenv.config();
import { loadSessions, saveSessions, appendToHistory, TWENTY_FOUR_HOURS, AUTO_REACTIVATE_SECONDS, } from "./services/sessionManager.js";
import { generarRespuestaBot } from "./controllers/AiController.js";
import { loadStats, saveStats, incrementarMensajesRespondidos, incrementarUsuariosUnicos, imprimirResumenStats, } from "./services/statsManager.js";
import { loadConfig, startConfigRefresh, getConfig, getNombre, isWithinBusinessHours, getOutOfHoursMessage, } from "./services/configService.js";
import { startAdminServer } from "./admin/server.js";
const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
});
// ─── Helpers ──────────────────────────────────────────────────────────────────
/** Lee una respuesta de sistema del cache de Firestore */
function sys(key) {
    return getConfig().respuestas_sistema[key]?.texto ?? "";
}
/** Reemplaza el placeholder {name} con el nombre del contacto */
const render = (text, name) => text.replace(/\{name\}/g, name);
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
    if (msg.timestamp * 1000 < bootTime)
        return;
    if (msg.from === "status@broadcast" || msg.from.includes("@g.us"))
        return;
    const sessions = await loadSessions();
    const nowInSeconds = Math.floor(Date.now() / 1000);
    // ── Intervención humana: mensaje del dueño (fromMe) ───────────────────────
    if (msg.fromMe) {
        const chat = await msg.getChat();
        const remoteId = chat.id._serialized;
        const sessionHistory = sessions[remoteId]?.history;
        const isHistoryMatch = (() => {
            if (!sessionHistory || sessionHistory.length === 0)
                return false;
            const lastMsg = sessionHistory[sessionHistory.length - 1];
            if (!lastMsg)
                return false;
            return (lastMsg.role === "assistant" &&
                lastMsg.content.trim() === msg.body.trim());
        })();
        const botTexts = [
            ...Object.values(getConfig().respuestas_info).map((r) => r.texto),
            ...Object.values(getConfig().respuestas_sistema).map((r) => r.texto),
            getOutOfHoursMessage(),
            "📢 Contestale al usuario",
        ];
        const isTextMatch = botTexts.some((texto) => {
            if (!texto)
                return false;
            const parts = texto.split("{name}");
            const prefix = (parts[0] || "").trim().slice(0, 25);
            if (prefix.length > 4 && msg.body.startsWith(prefix))
                return true;
            if (parts.length > 1) {
                const suffix = (parts[1] || "").trim().slice(0, 25);
                if (suffix.length > 4 && msg.body.includes(suffix))
                    return true;
            }
            return msg.body.startsWith(texto.trim().slice(0, 25));
        });
        if (isHistoryMatch || isTextMatch)
            return;
        sessions[remoteId] = {
            last_interaction: nowInSeconds,
            status: "human",
            human_since: nowInSeconds,
            history: sessions[remoteId]?.history ?? [],
        };
        await saveSessions(sessions);
        console.log(`👤 Intervención humana en ${remoteId}.`);
        return;
    }
    const from = msg.from;
    // ── Manejo de media ───────────────────────────────────────────────────────
    const isMedia = msg.hasMedia ||
        ["image", "video", "audio", "ptt", "sticker", "document"].includes(msg.type);
    if (isMedia && msg.type !== "sticker") {
        console.log(`📸 Media (${msg.type}) de ${from}.`);
        await msg.reply(sys("mediaRecibida"));
        return;
    }
    if (isMedia)
        return;
    // ── Auto-reactivación tras inactividad humana ─────────────────────────────
    const session = sessions[from];
    if (session?.status === "human" && session.human_since !== undefined) {
        const elapsed = nowInSeconds - session.human_since;
        if (elapsed >= AUTO_REACTIVATE_SECONDS) {
            console.log(`🔄 Auto-reactivando bot para ${from} (${Math.floor(elapsed / 60)} min).`);
            sessions[from] = {
                last_interaction: nowInSeconds,
                status: "bot",
                history: session.history ?? [],
            };
            await saveSessions(sessions);
            await msg.reply(sys("botReactivado"));
            return;
        }
        console.log(`⏸️ Modo humano activo para ${from}. Ignorando.`);
        return;
    }
    // ── Gestión de sesión ─────────────────────────────────────────────────────
    const contact = await msg.getContact();
    const nombre = contact.pushname || "amigo";
    let saludoEnviado = false;
    /* if (!session) {
      sessions[from] = {
        last_interaction: nowInSeconds,
        status: "bot",
        history: [],
      };
      incrementarUsuariosUnicos();
      console.log(`🆕 Nuevo usuario: ${nombre}`);
  
      const mensajeBienvenida = !isWithinBusinessHours()
        ? getOutOfHoursMessage()
        : render(sys("saludoInicial"), nombre);
  
      await msg.reply(mensajeBienvenida);
      appendToHistory(sessions[from]!, "assistant", mensajeBienvenida);
      saludoEnviado = true;
    } else if (nowInSeconds - session.last_interaction > TWENTY_FOUR_HOURS) {
      sessions[from] = {
        last_interaction: nowInSeconds,
        status: "bot",
        history: [],
      };
      console.log(`🔄 Re-contacto: ${nombre}`);
  
      const mensajeRecontacto = !isWithinBusinessHours()
        ? getOutOfHoursMessage()
        : render(sys("saludoRecontacto"), nombre);
  
      await msg.reply(mensajeRecontacto);
      appendToHistory(sessions[from]!, "assistant", mensajeRecontacto);
      saludoEnviado = true;
    } else {
      sessions[from]!.last_interaction = nowInSeconds;
    } */
    appendToHistory(sessions[from], "user", msg.body);
    // ── Detector de "Raquel" ──────────────────────────────────────────────────
    if (msg.body.trim().toLowerCase().includes("raquel")) {
        const avisoCliente = sys("agenteAviso");
        await msg.reply(avisoCliente);
        appendToHistory(sessions[from], "assistant", avisoCliente);
        sessions[from].status = "human";
        sessions[from].human_since = nowInSeconds;
        const phoneNumber = msg.from.replace(/\D/g, "").slice(0, 12);
        await client.sendMessage(msg.to, `📢 Contestale al usuario ${nombre}! ${phoneNumber}, que quiere: ${msg.body}`);
        console.log(`🔔 Raquel notificada. Bot pausado para ${from}.`);
        await saveSessions(sessions);
        await saveStats();
        return;
    }
    // ── Generación de respuesta (IA) ──────────────────────────────────────────
    if (!saludoEnviado) {
        try {
            /* if (!isWithinBusinessHours()) {
              const respuestaFueraHorario = getOutOfHoursMessage();
              await msg.reply(respuestaFueraHorario);
              appendToHistory(sessions[from]!, "assistant", respuestaFueraHorario);
            } else { */
            const respuesta = await generarRespuestaBot(sessions[from].history, getNombre(), getConfig().respuestas_info);
            incrementarMensajesRespondidos();
            await msg.reply(respuesta);
            appendToHistory(sessions[from], "assistant", respuesta);
            /* } */
        }
        catch (error) {
            console.error("❌ Error generando respuesta:", error);
        }
    }
    // ── Persistir ─────────────────────────────────────────────────────────────
    await saveSessions(sessions);
    await saveStats();
});
client.initialize();
export async function senBotMessage(to, message) {
    const chatId = to.includes("@c.us") ? to : `${to.replace(/\D/g, "")}@c.us`;
    await client.sendMessage(chatId, message);
}
//# sourceMappingURL=index.js.map