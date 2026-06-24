// ─── Modelos de Firestore para la configuración del bot ───────────────────────

/**
 * Documento en: bots/{botNumber}/respuestas_info/{intentionId}
 * Representa una respuesta informativa ligada a una intención de la IA.
 */
export interface InfoRespuesta {
  /** Nombre o título identificatorio de la información */
  nombre?: string;
  /** El texto que verá el cliente o la descripción general de la información */
  texto: string;
  /** Instrucción para que la IA sepa cuándo usar esta información */
  descripcion_ia?: string;
  /** Si false, la IA no la considerará y el bot no responderá con este doc. Opcional: si no existe se trata como activo. */
  activo?: boolean;
  /** Si true, solo responde en horario laboral; fuera de él avisa del horario */
  requiere_horario?: boolean;
  /** URL de imagen asociada a la respuesta (legado) */
  mediaUrl?: string;
  /** Arreglo de URLs de imágenes asociadas a la respuesta */
  mediaUrls?: string[];
}

/**
 * Documento en: bots/{botNumber}/horarios/atencion
 * Configura cuándo el bot puede aceptar pedidos/agendas.
 */
export interface HorarioConfig {
  /** Días de la semana hábiles. 0=Dom, 1=Lun, 2=Mar ... 6=Sáb */
  dias_habiles: number[];
  /** Hora de apertura en formato 24h (ej. 12 = 12:00 PM) */
  hora_apertura: number;
  /** Hora de cierre en formato 24h (ej. 20 = 8:00 PM). Opcional. */
  hora_cierre?: number;
  /** Zona horaria IANA (ej. "America/Caracas") */
  timezone: string;
}

/**
 * Estado completo de configuración del bot cargada en memoria.
 */
export interface BotConfig {
  nombre: string;
  respuestas_info: Record<string, InfoRespuesta>;
  //horario: HorarioConfig;
  activo: boolean;
  /** Si false, el bot no responde automáticamente a mensajes entrantes. */
  isAutoResponseEnabled: boolean;
  /** Activar Integración MCP de Muevelapp */
  muevelappMcpEnabled?: boolean;
  /** Activar Integración MCP de OrdenalApp (E-commerce) */
  ordenalappMcpEnabled?: boolean;
  /** Subdominio/Slug de OrdenalApp */
  ordenalappSlug?: string;
  /** Activar Integración MCP de Cambialapp (Remesas) */
  cambialappMcpEnabled?: boolean;
  /** Prompt base para la IA. Si no existe, se usa uno por defecto. */
  prompt_ia?: string | undefined;
  /** Zona horaria configurada para el bot */
  timezone?: string;
  /** Si true, se guardan logs detallados de cada paso del bot. */
  debugEnabled?: boolean;
}
