import { llamarDeepseek } from "../config/deepseek.js";
import type { ConversationMessage } from "../services/sessionManager.js";
import type { InfoRespuesta } from "../models/BotConfig.js";

function buildSystemPrompt(nombreNegocio: string, respuestasInfo: Record<string, InfoRespuesta>): string {
  const infoText = Object.values(respuestasInfo)
    .filter(r => r.activo !== false)
    .map(r => `- ${r.texto}`)
    .join("\n");

  return `
Sos el asistente virtual de ${nombreNegocio}. Tu trabajo es atender clientes por WhatsApp de forma amable, natural y concisa.

INFORMACIÓN DEL NEGOCIO:
${infoText}

REGLAS:
- Si te preguntan varias cosas, respondé todas.
- Respondé siempre de forma corta y amigable.
- Si no sabés algo, decí que lo vas a consultar.
- No inventes información que no está aquí.
- Nunca digas que sos una IA a menos que te lo pregunten.
- Si no entendés lo que quiere el usuario, o te pide algo que no sabés responder, respondé amablemente y agrega obligatoriamente la etiqueta secreta [NO_ENTENDI] al final de tu respuesta.
- Si el usuario indica que necesita hablar con una persona real, un humano, un asesor, o menciona a "Raquel", responde amablemente y agrega obligatoriamente la etiqueta secreta [HABLAR_CON_HUMANO] al final de tu respuesta.
`.trim();
}

export const generarRespuestaBot = async (
  historial: ConversationMessage[],
  nombreNegocio: string,
  respuestasInfo: Record<string, InfoRespuesta>,
  instruccionExtra?: string
): Promise<string> => {
  try {
    let systemPrompt = buildSystemPrompt(nombreNegocio, respuestasInfo);
    if (instruccionExtra) {
      systemPrompt += `\n\nINSTRUCCIÓN ESPECIAL PARA ESTE MENSAJE:\n${instruccionExtra}`;
    }

    // Map existing history to OpenAI spec shape
    const messages = [
      { role: "system", content: systemPrompt },
      ...historial.map(msg => ({
        role: msg.role, 
        content: msg.content
      }))
    ];

    const response = await llamarDeepseek(messages);
    return response.choices[0].message.content?.trim() ?? "Lo siento, tuve un problema para procesar tu mensaje.";
  } catch (error) {
    console.error("❌ Error generando respuesta con IA:", error);
    return "Lo siento, tuve un problema. Por favor intentá de nuevo más tarde.";
  }
};
