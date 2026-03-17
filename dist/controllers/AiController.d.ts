import type { ConversationMessage } from "../services/sessionManager.js";
declare const CATEGORIAS_VALIDAS: readonly [
  "precio",
  "ubicacion",
  "redes",
  "horario",
  "despedida",
  "noentendi",
  "saludo",
];
export type Intencion = (typeof CATEGORIAS_VALIDAS)[number];
export declare const clasificarIntencion: (
  mensajeCliente: string,
  historial?: ConversationMessage[],
) => Promise<Intencion>;
export {};
//# sourceMappingURL=AiController.d.ts.map
