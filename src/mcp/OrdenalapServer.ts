import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ErrorCode,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

// Dominio base del SaaS
const APP_DOMAIN = process.env.ORDENALAPP_DOMAIN || "ordenalapp.com";

class OrdenalAppPublicServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: "ordenalapp-public-server",
                version: "1.1.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        this.setupHandlers();
    }

    private setupHandlers() {
        // 1. REGISTRO DE HERRAMIENTAS
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "obtener_catalogo_ecommerce",
                        description: "Obtiene la lista completa de platos, combos y bebidas del restaurante. Devuelve los nombres, categorías, precios y variaciones de cada producto.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                slug: {
                                    type: "string",
                                    description: "El subdominio o identificador único del restaurante (ej: 'mundoolimpico')"
                                },
                                no_paginate: {
                                    type: "boolean",
                                    description: "Forzar a traer todo el menú sin cortes de página. Por defecto true.",
                                    default: true
                                },
                                page: {
                                    type: "integer",
                                    description: "Número de página a consultar en caso de que el menú sea extremadamente largo."
                                }
                            },
                            required: ["slug"]
                        }
                    },
                    {
                        name: "crear_pedido_ecommerce",
                        description: "Envía la orden final del cliente al sistema del restaurante para que se empiece a preparar y despachar.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                slug: { type: "string", description: "El subdominio del restaurante (ej: 'mundoolimpico')" },
                                customer_name: { type: "string", description: "Nombre completo del cliente de WhatsApp" },
                                customer_phone: { type: "string", description: "Número de teléfono celular/WhatsApp del cliente" },
                                customer_address: { type: "string", description: "Dirección de entrega especificada por el cliente" },
                                totalAmount: { type: "number", description: "Suma total exacta a pagar de los productos seleccionados" },
                                payment_method: {
                                    type: "string",
                                    description: "El método seleccionado por el cliente",
                                    enum: ["cash_on_delivery", "card", "bank_transfer"],
                                    default: "cash_on_delivery"
                                },
                                note: { type: "string", description: "Notas generales del pedido (ej: 'Llevar cambio de un billete de $20')" },
                                products: {
                                    type: "array",
                                    description: "Arreglo con los ítems pedidos por el cliente",
                                    items: {
                                        type: "object",
                                        properties: {
                                            product_id: { type: "integer", description: "ID único del producto base (campo 'id' del producto)" },
                                            quantities: { type: "integer", description: "Cantidad ordenada" },
                                            sales_price: { type: "number", description: "Precio final unitario cobrado (si es variación, el precio de la variación)" },
                                            instructions: { type: "string", description: "Notas para la cocina en este plato (ej: 'Sin aderezos', 'Bien tostado')" },
                                            variation_id: {
                                                type: "integer",
                                                description: "ID de la variación seleccionada (campo 'id' dentro del objeto en la lista 'variations'). Si no tiene variaciones, enviar null o no incluir."
                                            }
                                        },
                                        required: ["product_id", "quantities", "sales_price"]
                                    }
                                }
                            },
                            required: ["slug", "customer_name", "customer_phone", "customer_address", "totalAmount", "products"]
                        }
                    }
                ],
            };
        });

        // 2. CONTROLADOR DE LLAMADAS
        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                const { name, arguments: args } = request.params;
                const { slug, ...cleanArgs } = (args || {}) as any;

                if (!slug) {
                    throw new McpError(ErrorCode.InvalidParams, "El parámetro 'slug' es requerido para apuntar al restaurante correcto.");
                }

                // Construcción dinámica usando el slug provisto y el dominio del SaaS
                const baseUrl = `https://${slug}.${APP_DOMAIN}/api/v1/ecommerce`;

                switch (name) {
                    case "obtener_catalogo_ecommerce": {
                        // Pasamos no_paginate: true por defecto para evitar que la IA pierda platos en páginas secundarias
                        const params = { no_paginate: true, ...cleanArgs };
                        const response = await axios.get(`${baseUrl}/products`, { params });

                        return {
                            content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
                        };
                    }

                    case "crear_pedido_ecommerce": {
                        const response = await axios.post(`${baseUrl}/order`, cleanArgs);
                        return {
                            content: [{ type: "text", text: JSON.stringify(response.data, null, 2) }]
                        };
                    }

                    default:
                        throw new McpError(
                            ErrorCode.MethodNotFound,
                            `Operación no soportada en el entorno público: ${name}`,
                        );
                }
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error en la API pública de OrdenalApp [${request.params.name}]: ${error.response?.data
                                ? (typeof error.response.data === 'object' ? JSON.stringify(error.response.data) : error.response.data)
                                : error.message || JSON.stringify(error)
                                }`,
                        },
                    ],
                    isError: true,
                };
            }
        });
    }

    async run() {
        const transport = new StdioServerTransport();
        await this.server.connect(transport);
        console.error("Servidor MCP de OrdenalApp E-commerce activado vía Stdio");
    }
}

const server = new OrdenalAppPublicServer();
server.run().catch((error) => {
    console.error(error);
    process.exit(1);
});