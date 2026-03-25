/**
 * Documento en: bots/{botNumber}/respuestas_info/{intentionId}
 * Representa una respuesta informativa ligada a una intención de la IA.
 */
export interface InfoRespuesta {
    /** El texto que verá el cliente */
    texto: string;
    /** Instrucción para que la IA sepa cuándo usar esta información */
    descripcion_ia?: string;
    /** Si false, la IA no la considerará y el bot no responderá con este doc. Opcional: si no existe se trata como activo. */
    activo?: boolean;
    /** Si true, solo responde en horario laboral; fuera de él avisa del horario */
    requiere_horario?: boolean;
}
/**
 * Documento en: bots/{botNumber}/respuestas_sistema/{messageKey}
 * Mensajes internos del bot (saludos, errores, notificaciones).
 */
export interface SystemRespuesta {
    /** Texto del mensaje. Puede contener el placeholder {name} */
    texto: string;
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
    respuestas_sistema: Record<string, SystemRespuesta>;
    activo: boolean;
    /** Prompt base para la IA. Si no existe, se usa uno por defecto. */
    prompt_ia?: string | undefined;
}
//# sourceMappingURL=BotConfig.d.ts.map