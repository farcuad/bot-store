import { llamarDeepseek } from "../config/deepseek.js";
function buildSystemPrompt(nombreNegocio, respuestasInfo) {
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
`.trim();
}
export const generarRespuestaBot = async (historial, nombreNegocio, respuestasInfo) => {
    try {
        const systemPrompt = buildSystemPrompt(nombreNegocio, respuestasInfo);
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
    }
    catch (error) {
        console.error("❌ Error generando respuesta con IA:", error);
        return "Lo siento, tuve un problema. Por favor intentá de nuevo más tarde.";
    }
};
//# sourceMappingURL=AiController.js.map