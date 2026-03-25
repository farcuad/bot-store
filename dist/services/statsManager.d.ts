export type StatsData = {
    total_mensajes: number;
    usuarios_unicos: number;
    ultima_actualizacion: string;
};
export declare function loadStats(): Promise<void>;
export declare function saveStats(): Promise<void>;
export declare function incrementarMensajesRespondidos(): void;
export declare function incrementarUsuariosUnicos(): void;
export declare function getStats(): StatsData;
export declare function imprimirResumenStats(): void;
//# sourceMappingURL=statsManager.d.ts.map