import type { Response, Request, NextFunction } from "express";
import dotenv from "dotenv";
import { botManager } from "../saas/BotManager.js";
dotenv.config();

// Middleware de validación
export const validateApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const clientKey = req.headers["x-client-key"] as string;

  if (!clientKey) {
    console.warn(`🚫 Intento de acceso no autorizado desde: ${req.ip}`);
    res.status(401).json({
      error: "No autorizado",
      message: "API Key ausente en el header x-client-key",
    });
    return;
  }

  // Compatibilidad con la llave maestra global
  if (clientKey === process.env.API_KEY) {
    next();
    return;
  }

  // Verificación de llave específica por bot
  const targetBotId = req.body?.botId;
  
  if (!targetBotId) {
    res.status(400).json({
      error: "Bad Request",
      message: "botId es requerido en el cuerpo de la petición",
    });
    return;
  }
  
  try {
    const botKey = await botManager.getBotKey(targetBotId);
    if (!botKey || botKey !== clientKey) {
      console.warn(`🚫 Intento de acceso no autorizado al bot ${targetBotId} desde: ${req.ip}`);
      res.status(401).json({
        error: "No autorizado",
        message: "API Key inválida para este bot",
      });
      return;
    }
  } catch (error) {
    res.status(500).json({
      error: "Error interno",
      message: "Error al validar la API Key del bot",
    });
    return;
  }

  next(); // Si todo está bien, pasamos a la función de enviar mensaje
};
