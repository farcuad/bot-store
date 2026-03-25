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
export declare function createSessionManager(botId: string): {
    TWENTY_FOUR_HOURS: number;
    AUTO_REACTIVATE_SECONDS: number;
    MAX_HISTORY_MESSAGES: number;
    getSession: (phone: string) => Promise<SessionEntry | null>;
    saveSession: (phone: string, entry: SessionEntry) => Promise<void>;
    getStatusFromFirestore: (phone: string) => Promise<"bot" | "human" | null>;
    getSessionFromMemory: (phone: string) => SessionEntry | undefined;
    appendToHistory: (session: SessionEntry, role: "user" | "assistant", content: string) => void;
    listSessions: () => Promise<SessionEntry[]>;
};
export declare const getSession: (phone: string) => Promise<SessionEntry | null>;
export declare const saveSession: (phone: string, entry: SessionEntry) => Promise<void>;
export declare const getStatusFromFirestore: (phone: string) => Promise<"bot" | "human" | null>;
export declare const getSessionFromMemory: (phone: string) => SessionEntry | undefined;
export declare const appendToHistory: (session: SessionEntry, role: "user" | "assistant", content: string) => void;
//# sourceMappingURL=sessionManager.d.ts.map