import { llamarDeepseek, systemPrompt } from "../config/deepseek.js";
const functions = {
    consultarCatalogo: (_args, inventario) => {
        let res = "Productos disponibles:\n";
        Object.entries(inventario).forEach(([_, item]) => {
            res += `- ${item.nombre}: $${item.precio.toFixed(2)}\n`;
        });
        return res;
    },
    verificarPrecio: (args, inventario) => {
        const query = args.producto.toLowerCase();
        const key = Object.keys(inventario).find((k) => query.includes(k) || inventario[k].nombre.toLowerCase().includes(query));
        const item = key ? inventario[key] : null;
        return item
            ? `El ${item.nombre} cuesta $${item.precio.toFixed(2)}`
            : `No encontré "${args.producto}" en el inventario.`;
    },
    obtenerUbicacion: () => {
        return "Estamos ubicados en: Av. Principal, Local #12. Frente a la plaza central.";
    },
    crearPedido: (args, inventario) => {
        const key = Object.keys(inventario).find((k) => args.producto.toLowerCase().includes(k));
        const item = key ? inventario[key] : null;
        if (!item)
            return `No encontré ${args.producto} en el inventario`;
        const total = item.precio * args.cantidad;
        return `Pedido creado:
    Producto: ${item.nombre}
    Cantidad: ${args.cantidad}
    Total: $${total.toFixed(2)}

    ¿Deseas confirmar el pedido?`;
    },
};
export const procesarMensajeIA = async (mensajeCliente, inventario, historial = []) => {
    let messages = [
        { role: "system", content: systemPrompt },
        ...historial,
        { role: "user", content: mensajeCliente },
    ];
    try {
        while (true) {
            const response = await llamarDeepseek(messages);
            const msg = response.choices[0].message;
            if (!msg.tool_calls) {
                return msg.content;
            }
            const toolCall = msg.tool_calls[0];
            const name = toolCall.function.name;
            const args = JSON.parse(toolCall.function.arguments);
            console.log("🔧 Tool llamada:", name, args);
            const functionHandler = functions[name];
            if (!functionHandler)
                return "Error ejecutando herramienta.";
            const result = functionHandler(args, inventario);
            messages.push({
                role: "assistant",
                content: msg.content,
                tool_calls: msg.tool_calls
            });
            messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: result,
            });
        }
    }
    catch (error) {
        console.error("❌ Error crítico en procesarMensajeIA:", error);
        return "Lo siento, tuve un problema técnico. ¿Podrías repetir tu pregunta?";
    }
};
export const formatearWhatsapp = (texto) => {
    return texto
        .replace(/\*\*(.*?)\*\*/g, '*$1*')
        // Opcional: Convierte __cursiva__ a _cursiva_
        .replace(/__(.*?)__/g, '_$1_')
        // Elimina encabezados de Markdown (###) que WhatsApp no soporta
        .replace(/^#+\s+/gm, '')
        // Asegura que no queden espacios raros al inicio/final
        .trim();
};
//# sourceMappingURL=AiController.js.map