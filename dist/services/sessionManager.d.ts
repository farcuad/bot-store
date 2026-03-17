export interface ConversationMessage {
    role: 'user' | 'assistant';
    content: string;
}
export interface SessionEntry {
    last_interaction: number;
    status: 'bot' | 'human';
    human_since?: number | undefined;
    history: ConversationMessage[];
}
export type SessionsData = Record<string, SessionEntry>;
export declare const TWENTY_FOUR_HOURS = 86400;
export declare const AUTO_REACTIVATE_SECONDS: number;
export declare const MAX_HISTORY_MESSAGES = 10;
/**
 * Carga las sesiones desde sessions.json.
 * Si el archivo no existe, retorna un objeto vacío.
 */
export declare function loadSessions(): Promise<SessionsData>;
/**
 * Guarda las sesiones en sessions.json con formato legible.
 */
export declare function saveSessions(data: SessionsData): Promise<void>;
/**
 * Agrega un mensaje al historial de la sesión y lo limita al máximo definido.
 */
export declare function appendToHistory(session: SessionEntry, role: 'user' | 'assistant', content: string): void;
//# sourceMappingURL=sessionManager.d.ts.map