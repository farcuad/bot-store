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
];

export const llamarDeepseek = async (messages: any[]) => {
  const response = await axios.post(
    "https://api.deepseek.com/chat/completions",
    {
      model: "deepseek-chat",
      messages,
    },
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${DEEP_SEEK_API_KEY}`,
      },
      timeout: 60000,
    },
  );

  return response.data;
};
