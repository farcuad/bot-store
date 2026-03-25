import type { BotConfig } from "../models/BotConfig.js";
export declare function createConfigService(botId: string): {
    loadConfig: () => Promise<void>;
    startConfigRefresh: () => void;
    stopConfigRefresh: () => void;
    getConfig: () => BotConfig;
    getNombre: () => string;
    registrarNoEntendido: (mensaje: string, usuarioId: string, nombreUsuario: string) => Promise<void>;
};
export declare const loadConfig: () => Promise<void>;
export declare const startConfigRefresh: () => void;
export declare const getConfig: () => BotConfig;
export declare const getNombre: () => string;
export declare const registrarNoEntendido: (mensaje: string, usuarioId: string, nombreUsuario: string) => Promise<void>;
//# sourceMappingURL=configService.d.ts.map