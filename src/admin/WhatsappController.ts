import type { Response, Request } from "express";
import { botManager } from "../saas/BotManager.js";

// Endpoint para intermediario de whatsapp

export const seendMessageController = async (req: Request, res: Response) => {
  try {
    const { to, message, botId, fromMe } = req.body as {
      to?: string;
      message?: string;
      botId?: string;
      fromMe?: string;
    };
    const clientKey = req.headers["x-client-key"] as string;

    if (!to || !message || !botId || !fromMe) {
      return res
        .status(400)
        .json({ error: "Faltan datos requeridos: to, message, botId o fromMe" });
    }

    const instance = botManager.getInstance(botId);
    if (!instance) {
      return res
        .status(404)
        .json({ error: `Bot '${botId}' no encontrado o no ha iniciado` });
    }

    await instance.sendMessage(to, message);

    // ── Audit Log ─────────────────────────────────────────────────────────────
    try {
      const client = instance.getClient();
      const botNumber = client?.info?.wid?.user || "unknown";

      const { db } = await import("../config/firebase.js");
      const admin = (await import("firebase-admin")).default;

      await db.collection("message_logs").add({
        botId,
        type: "api_outbound",
        from: botNumber,
        to,
        body: message,
        fromMe,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        status: "sent",
      });
    } catch (logError) {
      console.error(`[${botId}] ⚠️ Error recording audit log:`, logError);
      // We don't fail the request if logging fails, but we log the error.
    }
    // ──────────────────────────────────────────────────────────────────────────

    res.status(200).json({ succes: true, message: `Mensaje enviado a ${to}` });
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
};
