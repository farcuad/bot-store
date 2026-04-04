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

    if (!to || !message || !botId) {
      return res.status(400).json({ error: "Faltan datos requeridos: to, message o botId" });
    }

    const instance = botManager.getInstance(botId);
    if (!instance) {
      return res
        .status(404)
        .json({ error: `Bot '${botId}' no encontrado o no ha iniciado` });
    }

    await instance.sendMessage(to, message);
    res.status(200).json({ succes: true, message: `Mensaje enviado a ${to}` });
  } catch (error) {
    console.error("Error al enviar mensaje:", error);
    res.status(500).json({ error: "Error al enviar mensaje" });
  }
};
