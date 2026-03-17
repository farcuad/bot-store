import type { Intencion } from '../controllers/AiController.js';
export type StatsData = {
    total_mensajes: number;
    por_intencion: Partial<Record<Intencion, number>>;
    usuarios_unicos: number;
    ultima_actualizacion: string;
};
export declare function loadStats(): Promise<void>;
export declare function saveStats(): Promise<void>;
export declare function incrementarIntencion(intencion: Intencion): void;
export declare function incrementarUsuariosUnicos(): void;
export declare function getStats(): StatsData;
export declare function imprimirResumenStats(): void;
//# sourceMappingURL=statsManager.d.ts.map