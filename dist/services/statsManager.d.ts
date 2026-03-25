export type StatsData = {
    total_mensajes: number;
    usuarios_unicos: number;
    ultima_actualizacion: string;
};
export declare function createStatsManager(botId: string): {
    loadStats: () => Promise<void>;
    saveStats: () => Promise<void>;
    incrementarMensajesRespondidos: () => void;
    incrementarUsuariosUnicos: () => void;
    getStats: () => StatsData;
};
export declare const loadStats: () => Promise<void>;
export declare const saveStats: () => Promise<void>;
export declare const incrementarMensajesRespondidos: () => void;
export declare const incrementarUsuariosUnicos: () => void;
export declare const getStats: () => StatsData;
export declare function imprimirResumenStats(): void;
//# sourceMappingURL=statsManager.d.ts.map