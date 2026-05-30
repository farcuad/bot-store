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
          {
            name: "procesar_orden",
            description:
              "Herramienta unificada que orquesta el flujo completo para crear una orden: " +
              "(1) valida si el usuario existe por su número de teléfono, " +
              "(2) si no existe y se proporcionaron fullName y email, lo registra automáticamente, " +
              "(3) si no existe y faltan fullName o email, responde indicando qué datos se deben solicitar al usuario antes de continuar, " +
              "(4) una vez resuelto el usuario, crea la orden con las URLs de Google Maps. " +
              "Úsala como punto de entrada principal para solicitudes de envío.",
            inputSchema: {
              type: "object",
              properties: {
                countryCode: {
                  type: "string",
                  description: "Código de país del teléfono (ej: +58, +57)",
                },
                phoneNumber: {
                  type: "string",
                  description: "Número de teléfono sin el código de país",
                },
                sourceLocationUrl: {
                  type: "string",
                  description: "URL o Link de Google Maps para el Origen",
                },
                destinationLocationUrl: {
                  type: "string",
                  description: "URL o Link de Google Maps para el Destino",
                },
                fullName: {
                  type: "string",
                  description:
                    "Nombre completo del usuario. Solo requerido si el usuario no está registrado.",
                },
                email: {
                  type: "string",
                  description:
                    "Correo electrónico del usuario. Solo requerido si el usuario no está registrado.",
                },
              },
              required: [
                "countryCode",
                "phoneNumber",
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

        if (request.params.name === "procesar_orden") {
          const {
            countryCode,
            phoneNumber,
            sourceLocationUrl,
            destinationLocationUrl,
            fullName,
            email,
          } = request.params.arguments as any;

          // ── Paso 1: Validar si el usuario existe ─────────────────────────
          let userId: string;

          try {
            const validacion = await axios.post(
              `${API_BASE_URL}/validar-usuario`,
              { countryCode, phoneNumber },
            );
            // Usuario encontrado → tomamos su ID
            userId = validacion.data?.id ?? validacion.data?.userId ?? validacion.data?._id;
            if (!userId) {
              throw new Error(
                `La respuesta de validar-usuario no contiene un ID de usuario. Respuesta: ${JSON.stringify(validacion.data)}`,
              );
            }
          } catch (validacionError: any) {
            if (validacionError.response?.status === 404) {
              // ── Usuario NO encontrado ────────────────────────────────────
              const camposFaltantes: string[] = [];
              if (!fullName) camposFaltantes.push("fullName (nombre completo)");
              if (!email) camposFaltantes.push("email (correo electrónico)");

              if (camposFaltantes.length > 0) {
                // Faltan datos → instruir al LLM para pedirlos al usuario
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          status: "usuario_no_registrado",
                          mensaje:
                            "El número de teléfono no está registrado en el sistema. " +
                            "Por favor solicita al usuario los siguientes datos para continuar:",
                          camposRequeridos: camposFaltantes,
                          instruccion:
                            "Una vez que el usuario proporcione estos datos, vuelve a llamar a procesar_orden " +
                            "incluyendo los campos fullName y email junto con los demás parámetros originales.",
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                };
              }

              // Tenemos todos los datos → Paso 2: Crear usuario
              let creacion: any;
              try {
                creacion = await axios.post(`${API_BASE_URL}/crear-usuario`, {
                  fullName,
                  countryCode,
                  phoneNumber,
                  email,
                });
              } catch (creacionError: any) {
                const detail = creacionError.response?.data
                  ? typeof creacionError.response.data === "object"
                    ? JSON.stringify(creacionError.response.data)
                    : creacionError.response.data
                  : creacionError.message;
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          status: "error_creacion_usuario",
                          mensaje: "No se pudo registrar al usuario.",
                          detalle: detail,
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                  isError: true,
                };
              }

              userId =
                creacion.data?.id ??
                creacion.data?.userId ??
                creacion.data?._id;
              if (!userId) {
                return {
                  content: [
                    {
                      type: "text",
                      text: JSON.stringify(
                        {
                          status: "error_creacion_usuario",
                          mensaje:
                            "El usuario fue creado pero la respuesta no contiene un ID reconocible.",
                          respuesta: creacion.data,
                        },
                        null,
                        2,
                      ),
                    },
                  ],
                  isError: true,
                };
              }
            } else {
              // Error inesperado al validar (500, red, etc.)
              const detail = validacionError.response?.data
                ? typeof validacionError.response.data === "object"
                  ? JSON.stringify(validacionError.response.data)
                  : validacionError.response.data
                : validacionError.message;
              return {
                content: [
                  {
                    type: "text",
                    text: JSON.stringify(
                      {
                        status: "error_validacion_usuario",
                        mensaje: "Error inesperado al validar el usuario.",
                        detalle: detail,
                      },
                      null,
                      2,
                    ),
                  },
                ],
                isError: true,
              };
            }
          }

          // ── Paso 3: Crear la orden ───────────────────────────────────────
          try {
            const orden = await axios.post(`${API_BASE_URL}/crear-orden-link`, {
              userId,
              sourceLocationUrl,
              destinationLocationUrl,
            });
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "orden_creada",
                      orden: orden.data,
                    },
                    null,
                    2,
                  ),
                },
              ],
            };
          } catch (ordenError: any) {
            const detail = ordenError.response?.data
              ? typeof ordenError.response.data === "object"
                ? JSON.stringify(ordenError.response.data)
                : ordenError.response.data
              : ordenError.message;
            return {
              content: [
                {
                  type: "text",
                  text: JSON.stringify(
                    {
                      status: "error_creacion_orden",
                      mensaje: "El usuario está registrado pero no se pudo crear la orden.",
                      userId,
                      detalle: detail,
                    },
                    null,
                    2,
                  ),
                },
              ],
              isError: true,
            };
          }
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
