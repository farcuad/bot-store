import type { BotConfig } from "../models/BotConfig.js";
/**
 * Carga (o recarga) la configuración completa del bot desde Firestore.
 * En modo TESTING: REFRESH_INTERVAL_MS = 0 (sin cache, consulta en cada refresh).
 */
export declare function loadConfig(): Promise<void>;
export declare function startConfigRefresh(): void;
/**
 * Acceso síncrono al cache.
 */
export declare function getConfig(): BotConfig;
/** Nombre de la empresa leído de Firestore */
export declare function getNombre(): string;
export declare function isWithinBusinessHours(): boolean;
export declare function getOutOfHoursMessage(): string;
/**
 * Guarda en Firestore cada mensaje que el bot no pudo clasificar.
 * Colección: bots/{botNumber}/mensajes_no_entendidos/{auto-id}
 */
export declare function registrarNoEntendido(mensaje: string, usuarioId: string, nombreUsuario: string): Promise<void>;
//# sourceMappingURL=configService.d.ts.map