import { llamarDeepseek } from "../config/deepseek.js";
import type { ConversationMessage } from "../services/sessionManager.js";
import type { InfoRespuesta } from "../models/BotConfig.js";

function buildSystemPrompt(
  nombreNegocio: string,
  respuestasInfo: Record<string, InfoRespuesta>,
  customPrompt?: string,
): string {
  const infoText = Object.values(respuestasInfo)
    .filter((r) => r.activo !== false)
    .map((r) => {
      let line = `- ${r.texto}`;
      if (r.descripcion_ia) {
        line += ` (Nota: ${r.descripcion_ia})`;
      }
      return line;
    })
    .join("\n");

  const basePrompt =
    customPrompt ||
    `Sos el asistente virtual de ${nombreNegocio}. Tu trabajo es atender clientes por WhatsApp de forma amable, natural y concisa.`;

  return `
${basePrompt}

INFORMACIÓN ESTRICTA DEL NEGOCIO:
${infoText}

REGLAS CRÍTICAS:
- Si te preguntan varias cosas, respondé todas.
- Respondé siempre de forma corta y amigable.
- Si el cliente te pide información, productos, sabores o detalles que NO ESTÁN en la INFORMACIÓN ESTRICTA, **NO INVENTES NINGÚN DATO**. Debes responder amablemente que vas a consultarlo o que no tienes esa información y AGREGAR OBLIGATORIAMENTE la etiqueta [NO_ENTENDI] al final de tu respuesta.
- Nunca digas que sos una IA a menos que te lo pregunten.
- Si no entendés lo que quiere el usuario o la consulta es ajena al negocio, responde amablemente y agrega la etiqueta [NO_ENTENDI] al final de tu respuesta.
- Si el usuario indica que necesita hablar con una persona real, un humano, un asesor, o menciona a Jefe, o cualquier palabra que indique que quiere hablar con una persona real, responde amablemente y agrega obligatoriamente la etiqueta secreta [HABLAR_CON_HUMANO] al final de tu respuesta.
`.trim();
}

export const generarRespuestaBot = async (
  historial: ConversationMessage[],
  nombreNegocio: string,
  respuestasInfo: Record<string, InfoRespuesta>,
  instruccionExtra?: string,
  customPrompt?: string,
): Promise<string> => {
  try {
    let systemPrompt = buildSystemPrompt(
      nombreNegocio,
      respuestasInfo,
      customPrompt,
    );
    if (instruccionExtra) {
      systemPrompt += `\n\nINSTRUCCIÓN ESPECIAL PARA ESTE MENSAJE:\n${instruccionExtra}`;
    }

    // Map existing history to OpenAI spec shape
    const messages = [
      { role: "system", content: systemPrompt },
      ...historial.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
    ];

    const response = await llamarDeepseek(messages);
    return (
      response.choices[0].message.content?.trim() ??
      "Lo siento, tuve un problema para procesar tu mensaje."
    );
  } catch (error) {
    console.error("❌ Error generando respuesta con IA:", error);
    return "Lo siento, tuve un problema. Por favor intentá de nuevo más tarde.";
  }
};
