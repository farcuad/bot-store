import { llamarDeepseek } from "../config/deepseek.js";

// --- Clasificador de Intención por IA ---

const CATEGORIAS_VALIDAS = [
  "precio",
  "ubicacion",
  "redes",
  "pago_movil",
  "agendacion",
  "horario",
  "despedida",
  "noentendi",
] as const;

export type Intencion = (typeof CATEGORIAS_VALIDAS)[number];

const intentClassifierPrompt = `
Eres un clasificador de intenciones para un bot de WhatsApp de una pastelería llamada "Dulces Porciones".
Tu única tarea es leer el mensaje del usuario y responder con UNA SOLA PALABRA, exactamente uno de estos valores:

- precio        → El usuario pregunta por precios, lista de productos, catálogo, qué venden, etc.
- ubicacion     → El usuario pregunta por la dirección, dónde están, cómo llegar, etc.
- redes         → El usuario pregunta por Instagram, TikTok, Facebook, redes sociales.
- pago_movil    → El usuario pregunta por pago, transferencia, datos bancarios, formas de pago.
- agendacion    → El usuario quiere agendar, pedir una cita, apartar o encargar algo.
- horario       → El usuario pregunta por el horario, a qué hora abren, cuándo cierran.
- despedida     → El usuario se está despidiendo, agradeciendo o dando por terminada la conversación.
- noentendi     → El mensaje no encaja con ninguna categoría anterior.

IMPORTANTE: Responde ÚNICAMENTE con una de las palabras de la lista. Sin explicaciones, sin puntos, sin comillas.
`;

export const clasificarIntencion = async (
  mensajeCliente: string,
): Promise<Intencion> => {
  try {
    const messages = [
      { role: "system", content: intentClassifierPrompt },
      { role: "user", content: mensajeCliente },
    ];

    const response = await llamarDeepseek(messages);
    const rawContent: string =
      response.choices[0].message.content?.trim().toLowerCase() ?? "noentendi";

    // Validar que la respuesta sea una categoría conocida
    const intencion = CATEGORIAS_VALIDAS.find((c) => c === rawContent);

    if (!intencion) {
      console.warn(
        `⚠️ IA retornó categoría desconocida: "${rawContent}". Usando 'noentendi'.`,
      );
      return "noentendi";
    }

    return intencion;
  } catch (error) {
    console.error("❌ Error al clasificar intención con IA:", error);
    return "noentendi";
  }
};
