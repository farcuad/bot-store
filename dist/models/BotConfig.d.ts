/**
 * Documento en: bots/{botNumber}/respuestas_info/{intentionId}
 * Representa una respuesta informativa ligada a una intención de la IA.
 */
export interface InfoRespuesta {
    /** Texto que se envía al usuario cuando se detecta esta intención */
    texto: string;
    /** Descripción que se le pasa a la IA para que reconozca la intención */
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
    horario: HorarioConfig;
    activo: boolean;
}
//# sourceMappingURL=BotConfig.d.ts.map