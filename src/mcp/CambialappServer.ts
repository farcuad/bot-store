import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    ErrorCode,
    McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const API_BASE_URL =
    process.env.CAMBIALAPP_API_URL ||
    "https://us-central1-cambialapp.cloudfunctions.net";

const API_KEY = process.env.CAMBIALAPP_API_KEY || "";
const BOT_ID = process.env.CAMBIALAPP_BOT_ID || "";

class CambialappServer {
    private server: Server;

    constructor() {
        this.server = new Server(
            {
                name: "cambialapp-server",
                version: "1.0.0",
            },
            {
                capabilities: {
                    tools: {},
                },
            },
        );

        this.setupHandlers();
    }

    private getHeaders() {
        return {
            "x-api-key": API_KEY,
            "x-bot-id": BOT_ID,
            "Content-Type": "application/json",
        };
    }

    private setupHandlers() {
        this.server.setRequestHandler(ListToolsRequestSchema, async () => {
            return {
                tools: [
                    {
                        name: "consultar_tasas_cambio",
                        description:
                            "Obtiene las tasas de cambio vigentes de Cambialapp. Devuelve las tasas para USD, CLP, COP, PEN, EUR, BOB respecto al Bolívar venezolano.",
                        inputSchema: {
                            type: "object",
                            properties: {},
                            required: [],
                        },
                    },
                    {
                        name: "consultar_metodos_pago",
                        description:
                            "Obtiene los métodos de pago habilitados (transferencia bancaria, QR, etc.) asociados a una moneda de origen específica. Devuelve las cuentas donde el cliente debe enviar su dinero.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                currency: {
                                    type: "string",
                                    description:
                                        "Código de la moneda de origen (ej: CLP, COP, USD, PEN, EUR, BOB)",
                                },
                            },
                            required: ["currency"],
                        },
                    },
                    {
                        name: "crear_transaccion",
                        description:
                            "Registra una nueva solicitud de envío de dinero a Venezuela con estado PENDIENTE. El sistema calcula automáticamente la conversión a Bolívares usando la tasa vigente y envía notificaciones al equipo de validación.",
                        inputSchema: {
                            type: "object",
                            properties: {
                                senderPhone: {
                                    type: "string",
                                    description:
                                        "Número de teléfono de WhatsApp del cliente emisor con código de país (ej: 56912345678)",
                                },
                                senderName: {
                                    type: "string",
                                    description:
                                        "Nombre del cliente emisor (opcional, se usa para registrarlo si no existe)",
                                },
                                code: {
                                    type: "string",
                                    description:
                                        "Código de la moneda desde la cual envía (ej: CLP, COP, USD, PEN, EUR, BOB)",
                                },
                                amount: {
                                    type: "number",
                                    description: "Monto enviado en la moneda seleccionada",
                                },
                                recipientName: {
                                    type: "string",
                                    description:
                                        "Nombre completo del beneficiario en Venezuela",
                                },
                                recipientCi: {
                                    type: "string",
                                    description:
                                        "Cédula de identidad del beneficiario en Venezuela",
                                },
                                recipientPaymentType: {
                                    type: "string",
                                    description:
                                        'Tipo de pago destino. Valores válidos: "Transferencia" o "Pagomovil"',
                                },
                                recipientBank: {
                                    type: "string",
                                    description:
                                        'Nombre o código del banco receptor en Venezuela (ej: "Banesco")',
                                },
                                recipientAccountNumber: {
                                    type: "string",
                                    description:
                                        'Cuenta de 20 dígitos del beneficiario. Obligatorio si recipientPaymentType es "Transferencia"',
                                },
                                recipientPhone: {
                                    type: "string",
                                    description:
                                        'Número telefónico de pago móvil del beneficiario. Obligatorio si recipientPaymentType es "Pagomovil"',
                                },
                                ref: {
                                    type: "string",
                                    description:
                                        "Código de referencia o número de operación de la transferencia que el cliente hizo",
                                },
                                paymentMethodId: {
                                    type: "string",
                                    description:
                                        "Identificador del medio de pago utilizado por el cliente (opcional)",
                                },
                            },
                            required: [
                                "senderPhone",
                                "code",
                                "amount",
                                "recipientName",
                                "recipientCi",
                                "recipientPaymentType",
                                "recipientBank",
                                "ref",
                            ],
                        },
                    },
                ],
            };
        });

        this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
            try {
                if (request.params.name === "consultar_tasas_cambio") {
                    const response = await axios.get(
                        `${API_BASE_URL}/getExchangeRatesBot`,
                        { headers: this.getHeaders() },
                    );

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(response.data, null, 2),
                            },
                        ],
                    };
                }

                if (request.params.name === "consultar_metodos_pago") {
                    const { currency } = request.params.arguments as any;

                    const response = await axios.get(
                        `${API_BASE_URL}/getPaymentMethodsBot`,
                        {
                            headers: this.getHeaders(),
                            params: { currency },
                        },
                    );

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(response.data, null, 2),
                            },
                        ],
                    };
                }

                if (request.params.name === "crear_transaccion") {
                    const args = request.params.arguments as any;

                    const response = await axios.post(
                        `${API_BASE_URL}/createTransactionBot`,
                        args,
                        { headers: this.getHeaders() },
                    );

                    return {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(response.data, null, 2),
                            },
                        ],
                    };
                }

                throw new McpError(
                    ErrorCode.MethodNotFound,
                    `Herramienta desconocida: ${request.params.name}`,
                );
            } catch (error: any) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error de API al ejecutar ${request.params.name}: ${error.response?.data
                                    ? typeof error.response.data === "object"
                                        ? JSON.stringify(error.response.data)
                                        : error.response.data
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
    }
}

const server = new CambialappServer();
server.run().catch((error) => {
    console.error(error);
    process.exit(1);
});
