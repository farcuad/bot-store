import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { Tool } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();
// const apikey = process.env.GEMINI_API_KEY || "";
// if(!apikey) {
//     console.error("⚠️  GEMINI_API_KEY no está configurada. Asegúrate de agregarla al archivo .env");
// }else {
//     console.log("✅ GEMINI_API_KEY cargada correctamente.");
// }
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const functionDefinitions: Tool[] = [{
        functionDeclarations: [
            {
                name: "consultarCatalogo",
                description: "Devuelve la lista completa de productos disponibles y sus precios.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {}
                }
            },
            {
                name: "verificarPrecio",
                description: "Obtiene el precio de un producto específico.",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                        producto: { type: SchemaType.STRING, description: "El nombre del producto (ej: harina, arroz)" }
                    },
                    required: ["producto"]
                }
            },
            {
                name: "obtenerUbicacion",
                description: "Devuelve la dirección o ubicación de la tienda",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {}
                }
            },
            {
                name: "crearPedido",
                description: "Disculpa, ocurrió un problema. ¿Podrías repetirlo?",
                parameters: {
                    type: SchemaType.OBJECT,
                    properties: {
                    producto: { type: SchemaType.STRING },
                    cantidad: { type: SchemaType.NUMBER }
                },
                required: ["producto", "cantidad"]
            }
        }
        ]
    }];

export const geminiModel = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: functionDefinitions,
    systemInstruction: `
    Eres un vendedor de la tienda "El Avance".
    Tu trabajo es ayudar a los clientes.

    Puedes:
    - Saludar a los clientes
    - Mostrar productos
    - Decir precios
    - Decir la ubicación de la tienda
    - Despedirte amablemente

    Tienes herramientas para consultar el inventario.

    Reglas importantes:

    - Si preguntan por productos usa consultarCatalogo
    - Si preguntan por el precio usa verificarPrecio
    - Si el cliente quiere comprar algo usa crearPedido
    - Si preguntan por la dirección usa obtenerUbicacion
    - Nunca inventes productos o precios
    - Usa las herramientas cuando necesites información

    Mantén respuestas cortas, naturales y amables.
    `,
});