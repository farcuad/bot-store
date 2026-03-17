export interface SessionEntry {
    last_interaction: number;
    status: 'bot' | 'human';
}
export type SessionsData = Record<string, SessionEntry>;
export declare const TWENTY_FOUR_HOURS = 86400;
/**
 * Carga las sesiones desde sessions.json.
 * Si el archivo no existe, retorna un objeto vacío.
 */
export declare function loadSessions(): Promise<SessionsData>;
/**
 * Guarda las sesiones en sessions.json con formato legible.
 */
export declare function saveSessions(data: SessionsData): Promise<void>;
//# sourceMappingURL=sessionManager.d.ts.map