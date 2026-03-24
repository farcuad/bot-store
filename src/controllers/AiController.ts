import { llamarDeepseek } from "../config/deepseek.js";
import { getConfig, getNombre } from "../services/configService.js";
import type { ConversationMessage } from "../services/sessionManager.js";

export type Intencion = string;

/**
 * Construye el prompt del clasificador dinámicamente desde Firestore.
 * Las categorías de negocio se leen en tiempo real del cache.
 * "saludo", "despedida" y "noentendi" son siempre fijos.
 */
function buildClassifierPrompt(): string {
  const respuestas = getConfig().respuestas_info;
  const nombre = getNombre();

  const categoriasNegocio = Object.entries(respuestas)
    .map(([id, r]) => `- ${id.padEnd(15)} → ${r.descripcion_ia}`)
    .join("\n");

  return `
Eres un clasificador de intenciones para un bot de WhatsApp de "${nombre}".
Tu única tarea es leer el mensaje del usuario y responder con UNA SOLA PALABRA, exactamente uno de estos valores:

${categoriasNegocio}
- saludo         → El usuario saluda, dice hola, buenos días, buenas, etc.
- despedida      → El usuario se está despidiendo, agradeciendo o da por terminada la conversación.
- noentendi      → El mensaje no encaja con ninguna categoría anterior.

REGLAS:
- Responde ÚNICAMENTE con una de las palabras exactas de la lista.
- Sin explicaciones, sin signos de puntuación, sin comillas, sin tildes.
- Si el usuario pregunta por algo fuera de las categorías, responde exactamente: noentendi
`.trim();
}

/**
 * Mapa lowercase → key original para categorías válidas.
 * Permite que la salida lowercaseada de la IA se resuelva
 * correctamente a la key original de Firestore.
 */
function buildCategoriasMap(): Map<string, string> {
  const map = new Map<string, string>();
  for (const key of Object.keys(getConfig().respuestas_info)) {
    map.set(key.toLowerCase(), key);
  }
  // Categorías fijas (ya están en lowercase)
  map.set("saludo", "saludo");
  map.set("despedida", "despedida");
  map.set("noentendi", "noentendi");
  return map;
}

export const clasificarIntencion = async (
  mensajeCliente: string,
  // El historial NO se pasa al clasificador: el contexto previo corrompe
  // la salida y el modelo responde con texto en lugar de una sola palabra.
  _historial: ConversationMessage[] = [],
): Promise<Intencion> => {
  try {
    const messages = [
      { role: "system", content: buildClassifierPrompt() },
      { role: "user", content: mensajeCliente },
    ];

    const response = await llamarDeepseek(messages);
    const fullRaw = response.choices[0].message.content?.trim() ?? "";
    // Tomamos sólo la primera palabra por si el modelo añade algo extra
    const rawContent: string = fullRaw.toLowerCase().split(/[\s\n,.;:]+/)[0];

    console.log(`🤖 IA respuesta completa: "${fullRaw}" → primera palabra: "${rawContent}"`);

    const categoriasMap = buildCategoriasMap();
    const originalKey = categoriasMap.get(rawContent);

    if (!originalKey) {
      console.warn(`⚠️ IA retornó categoría desconocida: "${rawContent}". Usando 'noentendi'.`);
      return "noentendi";
    }

    console.log(`🔍 IA clasificó: "${rawContent}" → key original: "${originalKey}"`);
    return originalKey;
  } catch (error) {
    console.error("❌ Error al clasificar intención con IA:", error);
    return "noentendi";
  }
};
