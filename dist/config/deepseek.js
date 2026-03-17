import dotenv from "dotenv";
dotenv.config();
import axios from "axios";
const DEEP_SEEK_API_KEY = process.env.DEEPSEEK_API_KEY || "";
if (!DEEP_SEEK_API_KEY) {
    console.error("❌ DEEPSEEK_API_KEY no está definida en el .env");
    process.exit(1);
}
else {
    console.log("✅ DEEPSEEK_API_KEY cargada correctamente");
}
export const systemPrompt = `
Eres un vendedor de la tienda "El Avance".
Tu trabajo es ayudar a los clientes.

IMPORTANTE SOBRE EL FORMATO:
- No uses negritas con doble asterisco (**). 
- Si quieres resaltar algo, usa un solo asterisco (*) al principio y al final, ejemplo: *Producto*.
- No uses listas con numerales complejos ni encabezados tipo #.
- Mantén las respuestas breves y amigables.
- Si te piden algo que no entiendes, responde con "Lo siento, no entiendo tu solicitud. ¿Podrías reformularla?".
`;
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
export const llamarDeepseek = async (messages) => {
    const response = await axios.post("https://api.deepseek.com/chat/completions", {
        model: "deepseek-chat",
        messages,
        tools,
        tool_choice: "auto",
    }, {
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${DEEP_SEEK_API_KEY}`,
        },
    });
    return response.data;
};
export const testDeepseekConnection = async () => {
    try {
        const res = await axios.get("https://api.deepseek.com/models", {
            headers: {
                Authorization: `Bearer ${DEEP_SEEK_API_KEY}`
            }
        });
        console.log("✅ Conexión con DeepSeek exitosa");
        console.log("Modelos disponibles:", res.data.data.map((m) => m.id));
    }
    catch (error) {
        if (error.response) {
            console.error("❌ Error DeepSeek:", error.response.data);
        }
        else {
            console.error("❌ Error conexión:", error.message);
        }
    }
};
//# sourceMappingURL=deepseek.js.map