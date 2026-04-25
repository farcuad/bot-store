import type { Response, Request } from "express";
import { botManager } from "../saas/BotManager.js";
import { db } from "../config/firebase.js";
import admin from "firebase-admin";

// ══════════════════════════════════════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════════════════════════════════════

interface ContactMessageBody {
  to?: string;
  message?: string;
  fromMe?: string;
  mediaUrl?: string;
}

interface GroupMessageBody {
  to?: string;
  message?: string;
  mediaUrl?: string;
  fromMe?: string;
}

// ══════════════════════════════════════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Validates that the bot instance exists, belongs to the authenticated user,
 * and has an active WhatsApp connection (status = "ready").
 * 
 * NOTE: A bot with `isAutoResponseEnabled = false` (paused) still has status "ready"
 * and a live WhatsApp client, so the API will work normally in that state.
 * This helper ONLY blocks when the bot is truly stopped (idle/disconnected/error).
 */
async function getActiveInstance(
  botId: string,
  req: Request,
  res: Response,
): Promise<import("../saas/BotInstance.js").BotInstance | null> {
  const instance = botManager.getInstance(botId);
  if (!instance) {
    res
      .status(404)
      .json({ error: `Bot '${botId}' no encontrado o no ha iniciado` });
    return null;
  }

  // Verify ownership when authenticated via Firebase (not API key)
  if (req.firebaseUid) {
    const bot = await botManager.getBot(botId);
    if (!bot) {
      res.status(404).json({ error: `Bot '${botId}' no encontrado` });
      return null;
    }
    if (!req.isAdmin && bot.ownerUid !== req.firebaseUid) {
      res.status(403).json({ error: "No autorizado para este bot" });
      return null;
    }
  }

  const state = instance.getState();
  if (state.status !== "ready") {
    // Distinguish between "stopped" and other transient states for a clearer error message
    const hint =
      state.status === "idle" || state.status === "disconnected"
        ? `El bot '${botId}' está detenido. Inícialo desde el panel para poder enviar mensajes.`
        : `El bot '${botId}' no está listo para enviar mensajes (estado actual: ${state.status}).`;
    res.status(409).json({ error: hint });
    return null;
  }

  return instance;
}

// Keep the old name as an alias for any internal callers
const getReadyInstance = getActiveInstance;

/**
 * Records an audit log entry for outbound API messages.
 */
async function recordAuditLog(
  botId: string,
  botNumber: string,
  to: string,
  body: string,
  fromMe: string,
  hasMedia: boolean,
): Promise<void> {
  try {
    await db.collection("bots").doc(botId).collection("message_logs").add({
      type: "api_outbound",
      from: botNumber,
      to,
      body,
      fromMe,
      hasMedia,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      status: "sent",
    });
  } catch (logError) {
    console.error(`[${botId}] ⚠️ Error recording audit log:`, logError);
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// Contact Message Controller (refactored)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /send-message
 * Sends a text (or text + image) message to an individual contact (@c.us).
 */
export const sendContactMessageController = async (
  req: Request,
  res: Response,
) => {
  try {
    const botId = (req.headers["x-client-botid"] || req.params.botId || req.body.botId) as string;
    const { to, message, fromMe, mediaUrl } = req.body as ContactMessageBody;

    if (!botId) {
      return res
        .status(400)
        .json({ error: "botId es requerido (x-client-botid header o parámetro)" });
    }

    if (!to || !message || !fromMe) {
      return res
        .status(400)
        .json({ error: "Faltan datos requeridos: to, message o fromMe" });
    }

    // Validate that the recipient is an individual contact
    const chatId = to.includes("@c.us") ? to : `${to.replace(/\D/g, "")}@c.us`;
    if (!chatId.endsWith("@c.us")) {
      return res
        .status(400)
        .json({
          error: "El destinatario debe ser un contacto individual (@c.us)",
        });
    }

    const instance = await getReadyInstance(botId, req, res);
    if (!instance) return;

    // Send with or without media
    if (mediaUrl) {
      await instance.sendMediaToChat(chatId, mediaUrl, message);
    } else {
      await instance.sendMessageToChat(chatId, message);
    }

    // Audit log
    const client = instance.getClient();
    const botNumber = client?.info?.wid?.user || "unknown";
    await recordAuditLog(botId, botNumber, chatId, message, fromMe, !!mediaUrl);

    res
      .status(200)
      .json({ success: true, message: `Mensaje enviado a ${chatId}` });
  } catch (error) {
    console.error("Error al enviar mensaje a contacto:", error);
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
};

// Keep the legacy export name for backward compatibility
export const seendMessageController = sendContactMessageController;

// ══════════════════════════════════════════════════════════════════════════════
// Group Controllers
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /groupsBots/:botId
 * Lists all WhatsApp groups for the given bot instance and syncs them to Firestore.
 */
export const getGroupsController = async (req: Request, res: Response) => {
  try {
    const botId = (req.headers["x-client-botid"] || req.params.botId) as string;

    if (!botId) {
      return res
        .status(400)
        .json({ error: "botId es requerido (x-client-botid header o parámetro)" });
    }

    const instance = await getReadyInstance(botId, req, res);
    if (!instance) return;

    // Fetch all chats and filter groups
    const chats = await instance.getChats();
    const groups = chats
      .filter((chat: any) => chat.isGroup)
      .map((chat: any) => ({
        id: chat.id._serialized,
        name: chat.name || "Sin nombre",
      }));

    // Sync groups to Firestore under the bot's collection
    const groupsRef = db.collection("bots").doc(botId!).collection("groups");

    const batch = db.batch();
    for (const group of groups) {
      const docRef = groupsRef.doc(group.id);
      batch.set(
        docRef,
        {
          id: group.id,
          name: group.name,
          syncedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }
    await batch.commit();

    res.status(200).json({ success: true, groups });
  } catch (error) {
    console.error("Error al obtener grupos:", error);
    res.status(500).json({ error: "Error al obtener grupos del bot" });
  }
};

/**
 * POST /groupsBots/:botId
 * Sends a text (or text + image) message to a WhatsApp group (@g.us).
 */
export const sendGroupMessageController = async (
  req: Request,
  res: Response,
) => {
  try {
    const botId = (req.headers["x-client-botid"] || req.params.botId || req.body.botId) as string;
    const { to, message, mediaUrl, fromMe } = req.body as GroupMessageBody;

    if (!botId) {
      return res
        .status(400)
        .json({ error: "botId es requerido (x-client-botid header o parámetro)" });
    }

    if (!to || !message || !fromMe) {
      return res
        .status(400)
        .json({ error: "Faltan datos requeridos: to, message o fromMe" });
    }

    // Validate that the recipient is a group
    if (!to.endsWith("@g.us")) {
      return res
        .status(400)
        .json({ error: "El destinatario debe ser un grupo (@g.us)" });
    }

    const instance = await getReadyInstance(botId, req, res);
    if (!instance) return;

    // Send with or without media
    if (mediaUrl) {
      await instance.sendMediaToChat(to, mediaUrl, message);
    } else {
      await instance.sendMessageToChat(to, message);
    }

    // Audit log
    const client = instance.getClient();
    const botNumber = client?.info?.wid?.user || "unknown";
    await recordAuditLog(botId, botNumber, to, message, fromMe, !!mediaUrl);

    res
      .status(200)
      .json({ success: true, message: `Mensaje enviado al grupo ${to}` });
  } catch (error) {
    console.error("Error al enviar mensaje a grupo:", error);
    res.status(500).json({ error: "Error al enviar mensaje al grupo" });
  }
};
