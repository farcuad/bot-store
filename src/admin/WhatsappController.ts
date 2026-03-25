import type { Response, Request } from "express";
import { botManager } from "../saas/BotManager.js";

// Endpoint para intermediario de whatsapp

export const seendMessageController = async (req: Request, res: Response) => {
  try {
    const { to, message, botId } = req.body as {
      to?: string;
      message?: string;
      botId?: string;
    };
    const clientKey = req.headers["x-client-key"] as string;

    if (clientKey !== process.env.API_KEY) {
      return res.status(401).json({ error: "API Key incorrecta" });
    }
    if (!to || !message) {
      return res.status(400).json({ error: "Faltan datos" });
    }

    // Use the specified bot or fall back to the legacy default bot
    const targetBotId = botId ?? "bot_default";
    const instance = botManager.getInstance(targetBotId);
    if (!instance) {
      return res
        .status(404)
        .json({ error: `Bot '${targetBotId}' not found or not started` });
    }

    await instance.sendMessage(to, message);
    res.status(200).json({ succes: true, message: `Mensaje enviado a ${to}` });
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
};
