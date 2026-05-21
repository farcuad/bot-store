import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";

const API_BASE_URL = process.env.MUEVELAPP_API_URL || "http://localhost:3000";

class MuevelappServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "muevelapp-server",
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

  private setupHandlers() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "validar_usuario",
            description:
              "Verifica si un usuario se encuentra registrado en el sistema usando su número de teléfono.",
            inputSchema: {
              type: "object",
              properties: {
                countryCode: {
                  type: "string",
                  description: "Código de país (ej: +58, +57)",
                },
                phoneNumber: {
                  type: "string",
                  description: "Número de teléfono a validar",
                },
              },
              required: ["countryCode", "phoneNumber"],
            },
          },
          {
            name: "crear_usuario",
            description: "Registra a un nuevo usuario en la plataforma.",
            inputSchema: {
              type: "object",
              properties: {
                fullName: {
                  type: "string",
                  description: "Nombre completo del usuario",
                },
                countryCode: {
                  type: "string",
                  description: "Código de país (ej: +58, +57)",
                },
                phoneNumber: {
                  type: "string",
                  description: "Número de teléfono sin el código de país",
                },
                email: {
                  type: "string",
                  description: "Correo electrónico del usuario",
                },
              },
              required: ["fullName", "countryCode", "phoneNumber", "email"],
            },
          },
          {
            name: "crear_orden_link",
            description:
              "Crea una orden utilizando enlaces compartidos de Google Maps para extraer las coordenadas de origen y destino.",
            inputSchema: {
              type: "object",
              properties: {
                userId: {
                  type: "string",
                  description: "ID del usuario que solicita la orden",
                },
                sourceLocationUrl: {
                  type: "string",
                  description: "URL o Link de Google Maps para el Origen",
                },
                destinationLocationUrl: {
                  type: "string",
                  description: "URL o Link de Google Maps para el Destino",
                },
              },
              required: [
                "userId",
                "sourceLocationUrl",
                "destinationLocationUrl",
              ],
            },
          },
        ],
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        if (request.params.name === "validar_usuario") {
          const { countryCode, phoneNumber } = request.params.arguments as any;

          try {
            const response = await axios.post(
              `${API_BASE_URL}/validar-usuario`,
              {
                countryCode,
                phoneNumber,
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
          } catch (error: any) {
            if (error.response?.status === 404) {
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(error.response.data, null, 2),
                  },
                ],
              };
            }
            throw error;
          }
        }

        if (request.params.name === "crear_usuario") {
          const args = request.params.arguments as any;
          const response = await axios.post(
            `${API_BASE_URL}/crear-usuario`,
            args,
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

        if (request.params.name === "crear_orden_link") {
          const args = request.params.arguments as any;
          const response = await axios.post(
            `${API_BASE_URL}/crear-orden-link`,
            args,
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
              text: `Error de API al ejecutar ${request.params.name}: ${
                error.response?.data 
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
    console.error("Servidor MCP de Muevelapp corriendo en Stdio");
  }
}

const server = new MuevelappServer();
server.run().catch((error) => {
  console.error(error);
  process.exit(1);
});
