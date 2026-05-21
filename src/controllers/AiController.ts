import { llamarDeepseek } from "../config/deepseek.js";
import type { ConversationMessage } from "../services/sessionManager.js";
import type { InfoRespuesta } from "../models/BotConfig.js";

function buildSystemPrompt(
  nombreNegocio: string,
  respuestasInfo: Record<string, InfoRespuesta>,
  customPrompt?: string,
  timezone?: string,
  motivosNotificacion?: string[]
): string {
  const infoText = Object.values(respuestasInfo)
    .filter((r) => r.activo !== false)
    .map((r) => {
      let line = `- `;
      if (r.nombre) {
        line += `[${r.nombre}]: `;
      }
      line += r.texto;
      if (r.descripcion_ia) {
        line += ` (Nota: ${r.descripcion_ia})`;
      }
      if (r.mediaUrls && r.mediaUrls.length > 0) {
        r.mediaUrls.forEach((url) => {
          line += ` [URL_IMAGEN: ${url}]`;
        });
      } else if (r.mediaUrl) {
        line += ` [URL_IMAGEN: ${r.mediaUrl}]`;
      }
      return line;
    })
    .join("\n");

  const tz = timezone || "America/Caracas";
  const now = new Date();
  const timeStr = now.toLocaleString("es-ES", { timeZone: tz, dateStyle: 'full', timeStyle: 'short' });

  const basePrompt =
    customPrompt ||
    `Sos el asistente virtual de ${nombreNegocio}. Tu trabajo es atender clientes por WhatsApp de forma amable, natural y concisa.`;

  // Build the dynamic HABLAR_CON_HUMANO triggers section
  const motivosBlock =
    motivosNotificacion && motivosNotificacion.length > 0
      ? `Los motivos configurados para notificar al dueño del negocio son:\n${motivosNotificacion
        .map((m, i) => `  ${i + 1}. ${m}`)
        .join(
          "\n"
        )}\nSi el cliente expresa EXPLÍCITAMENTE alguno de estos motivos, responde amablemente y agrega OBLIGATORIAMENTE la etiqueta [HABLAR_CON_HUMANO] al final de tu respuesta.`
      : `Solo si el usuario solicita EXPLÍCITAMENTE hablar con una persona real, un humano, el dueño, un agente o pide ayuda que claramente el bot no puede dar (ej: "quiero hablar con alguien", "pásame con un humano", "necesito soporte técnico real"), responde amablemente y agrega OBLIGATORIAMENTE la etiqueta secreta [HABLAR_CON_HUMANO] al final.`;

  return `
[FECHA Y HORA ACTUAL: ${timeStr}]

${basePrompt}

INFORMACIÓN ESTRICTA DEL NEGOCIO:
${infoText}

REGLAS CRÍTICAS:
- **IDIOMA**: Siempre responde en castellano latinoamericano. NO uses expresiones propias del español de España (ej: "vosotros", "vale", "coger" en sentido neutro, etc.). Usa vocabulario neutro y natural del español latinoamericano.
- **RESPUESTA ÚNICA**: Consolida siempre tu respuesta en un UNICO mensaje claro y bien estructurado. Nunca envíes mensajes fragmentados.
- Si te preguntan varias cosas, respondé todas en ese mismo mensaje único.
- Respondé siempre de forma corta y amigable.
- **IMÁGENES**: Si para responder utilizas información que contiene una etiqueta [URL_IMAGEN: ...], **DEBES incluir obligatoriamente** esa URL tal cual al final de tu respuesta para que el sistema envíe la imagen al cliente.
- **MANEJO DE INFORMACIÓN DESCONOCIDA**: Si el cliente te pide información, productos, precios específicos o detalles que NO ESTÁN en la INFORMACIÓN ESTRICTA, **NO INVENTES NINGÚN DATO**. Debes responder amablemente que no tienes esa información o que vas a consultarlo, y agregar OBLIGATORIAMENTE la etiqueta [NO_ENTENDI] al final de tu respuesta.
- **INTERVENCIÓN HUMANA (CRÍTICO)**: ${motivosBlock}
- **EVITAR FALSOS POSITIVOS**: NO uses la etiqueta [HABLAR_CON_HUMANO] si el usuario solo está bromeando, usa jerga (slang), hace comentarios sarcásticos, se queja de forma general o simplemente dice algo confuso. En esos casos, intenta responder de forma natural o usa [NO_ENTENDI] si es incomprensible, pero NO pidas intervención humana a menos que se cumpla claramente uno de los motivos configurados.
- Nunca digas que sos una IA a menos que te lo pregunten.
- **Formato de Negrita**: En WhatsApp la negrita se logra usando un solo asterisco (\`*\`) al inicio y final. Por ende, siempre que des formato al resumen de la orden, usa un solo asterisco en lugar de dos (ej. usa \`*Origen:*\`, \`*Destino:*\`, \`*Distancia:*\`, \`*Tarifa:*\`, \`*Pago:*\`, \`*ID de orden:*\`). NUNCA uses doble asterisco (\`**\`).

`.trim();
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

let mcpClientInstance: Client | null = null;
async function getMcpClient() {
  if (mcpClientInstance) return mcpClientInstance;

  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", "src/mcp/MuevelappServer.ts"],
  });

  const client = new Client(
    { name: "bot-store-client", version: "1.0.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  mcpClientInstance = client;
  return client;
}

export const generarRespuestaBot = async (
  historial: ConversationMessage[],
  nombreNegocio: string,
  respuestasInfo: Record<string, InfoRespuesta>,
  instruccionExtra?: string,
  customPrompt?: string,
  timezone?: string,
  motivosNotificacion?: string[],
  mcpEnabled?: boolean,
  telefonoUsuario?: string
): Promise<string> => {
  try {
    let systemPrompt = buildSystemPrompt(
      nombreNegocio,
      respuestasInfo,
      customPrompt,
      timezone,
      motivosNotificacion
    );

    if (mcpEnabled) {
      systemPrompt += `\n\n[SISTEMA MCP ACTIVADO]
IMPORTANTE: Realiza las llamadas a herramientas de forma inmediata tan pronto tengas los datos, utilizando el loop de ejecución en un solo turno.`;
    }

    if (telefonoUsuario) {
      systemPrompt += `\n\nEl número de teléfono (WhatsApp) del usuario actual con el que hablas es: ${telefonoUsuario}. NO LE PREGUNTES su número, usa este directamente para cualquier validación o creación de usuario.`;
    }

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

    let openaiTools: any[] = [];
    let mcpClient: Client | null = null;

    if (mcpEnabled) {
      try {
        mcpClient = await getMcpClient();
        const { tools } = await mcpClient.listTools();
        openaiTools = tools.map(tool => ({
          type: "function",
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.inputSchema
          }
        }));
      } catch (e) {
        console.error("Error conectando al MCP de Muevelapp:", e);
      }
    }

    let response = await llamarDeepseek(messages, 2, openaiTools.length > 0 ? openaiTools : undefined);

    let loopCount = 0;
    const maxLoops = 5;

    // Support sequential tool calling loop
    while (mcpEnabled && response.choices && response.choices[0].message.tool_calls && response.choices[0].message.tool_calls.length > 0 && mcpClient && loopCount < maxLoops) {
      loopCount++;
      const toolCalls = response.choices[0].message.tool_calls;

      // Add the assistant's tool call intent to history
      messages.push({
        role: "assistant",
        content: response.choices[0].message.content || "",
        tool_calls: toolCalls
      } as any);

      for (const toolCall of toolCalls) {
        const functionName = toolCall.function.name;
        const functionArgs = JSON.parse(toolCall.function.arguments);

        console.log(`[MCP] 🔧 [Loop ${loopCount}] Ejecutando herramienta: ${functionName}`, functionArgs);
        let result;
        try {
          result = await mcpClient.callTool({
            name: functionName,
            arguments: functionArgs
          });
          console.log(`[MCP] ✅ Resultado de ${functionName}:`, JSON.stringify(result).substring(0, 500) + '...');
        } catch (toolErr: any) {
          console.error(`[MCP] ❌ Error ejecutando herramienta ${functionName}:`, toolErr.message || toolErr);
          result = { content: [{ type: 'text', text: `Error interno ejecutando la herramienta: ${toolErr.message}` }] };
        }

        const contentArr = result.content as any[];
        // Add the tool result to history
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          name: functionName,
          content: (contentArr && contentArr[0]?.type === 'text') ? contentArr[0].text : JSON.stringify(result)
        } as any);
      }

      // Make another call to deepseek to get the next action (could be another tool call or final text)
      response = await llamarDeepseek(messages, 2, openaiTools);
    }

    return (
      response.choices[0].message.content?.trim() ??
      "Lo siento, tuve un problema para procesar tu mensaje."
    );
  } catch (error) {
    console.error("❌ Error generando respuesta con IA:", error);
    return "Lo siento, tuve un problema. Por favor intentá de nuevo más tarde.";
  }
};
