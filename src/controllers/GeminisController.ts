import { geminiModel } from "../config/geminis.js";

const functions = {

    consultarCatalogo: (_args: any, inventario: any) => {
        let res = "Productos disponibles:\n";

        Object.entries(inventario).forEach(([_, item]: [any, any]) => {
            res += `- ${item.nombre}: $${item.precio.toFixed(2)}\n`;
        });

        return res;
    },

    verificarPrecio: (args: { producto: string }, inventario: any) => {

        const query = args.producto.toLowerCase();

        const key = Object.keys(inventario).find(
            k => query.includes(k) || k.includes(query) || inventario[k].nombre.toLowerCase().includes(query)
        );

        const item = key ? inventario[key] : null;

        return item
            ? `El ${item.nombre} cuesta $${item.precio.toFixed(2)}`
            : `No encontré "${args.producto}" en el inventario.`;
    },

    obtenerUbicacion: () => {
        return "Estamos ubicados en: Av. Principal, Local #12. Frente a la plaza central.";
    },
    crearPedido: (args: { producto: string, cantidad: number }, inventario: any) => {

    const key = Object.keys(inventario).find(
        k => args.producto.toLowerCase().includes(k)
    );

    const item = key ? inventario[key] : null;

    if (!item) {
        return `No encontré ${args.producto} en el inventario`;
    }

    const total = item.precio * args.cantidad;

    return `Pedido creado:
        Producto: ${item.nombre}
        Cantidad: ${args.cantidad}
        Total: $${total.toFixed(2)}

        ¿Deseas confirmar el pedido?`;
        }
};
export const procesarMensajeIA = async (mensajeCliente: string, inventario: any, historial: any[] = []) => {
    try {
        const chat = geminiModel.startChat({ history: historial });

        let result = await chat.sendMessage(mensajeCliente);
        let response = result.response;

        // 2. Si hay partes, buscamos la función
        while (true) {

            const functionCall = response.functionCalls()?.[0];

            if (!functionCall) break;

            const { name, args } = functionCall;

            console.log("🔧 Tool llamada:", name, args);

            const functionHandler = (functions as any)[name];

            if (!functionHandler) break;

            const apiResponse = functionHandler(args, inventario);

            result = await chat.sendMessage([
                {
                    functionResponse: {
                        name,
                        response: { content: apiResponse }
                    }
                }
            ]);

            response = result.response;
        }

        return response.text();
    } catch (error) {
        console.error("Error en IA Controller:", error);
        return "Disculpa, ocurrió un problema. ¿Podrías repetirlo?";
    }
};