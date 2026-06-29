import dotenv from "dotenv";
dotenv.config();

import axios from "axios";

const DEEP_SEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";

if (!DEEP_SEEK_API_KEY) {
  console.error("❌ DEEPSEEK_API_KEY no está definida en el .env");
  process.exit(1);
} else {
  console.log("✅ DEEPSEEK_API_KEY cargada correctamente");
}
/* 
export const tools = [
  {
    type: "function",
    function: {
      name: "consultarCatalogo",
      description: "Devuelve la lista completa de productos disponibles",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "verificarPrecio",
      description: "Obtiene el precio de un producto específico",
      parameters: {
        type: "object",
        properties: {
          producto: {
            type: "string",
            description: "nombre del producto",
          },
        },
        required: ["producto"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "obtenerUbicacion",
      description: "Devuelve la ubicación de la tienda",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "crearPedido",
      description: "Crear pedido de producto",
      parameters: {
        type: "object",
        properties: {
          producto: { type: "string" },
          cantidad: { type: "number" },
        },
        required: ["producto", "cantidad"],
      },
    },
  },
]; */


export const llamarDeepseek = async (messages: any[], retries = 2, customTools?: any[]): Promise<any> => {
  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const payload: any = {
        model: "deepseek-chat",
        messages,
      };

      if (customTools && customTools.length > 0) {
        payload.tools = customTools;
        console.log(`[DEEPSEEK REQUEST] Sending ${customTools.length} tools to DeepSeek:`);
      }

      const response = await axios.post(
        "https://api.deepseek.com/chat/completions",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DEEP_SEEK_API_KEY}`,
          },
          timeout: 60000,
        },
      );

      console.log("[DEEPSEEK RESPONSE]:", JSON.stringify(response.data.choices?.[0]?.message, null, 2));
      return response.data;
    } catch (err: any) {
      lastError = err;
      const isTransient =
        err.code === "ECONNRESET" ||
        err.code === "ECONNABORTED" ||
        err.code === "ETIMEDOUT" ||
        err.code === "ENOTFOUND" ||
        err.code === "EAI_AGAIN" ||
        err.code === "ERR_NETWORK" ||
        err.message === "aborted";

      if (isTransient && attempt < retries) {
        const waitMs = 2000 * (attempt + 1); // 2s, 4s
        console.warn(`⚠️ DeepSeek: error transitorio (${err.code || err.message}), reintentando en ${waitMs}ms... (intento ${attempt + 1}/${retries})`);
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
};
