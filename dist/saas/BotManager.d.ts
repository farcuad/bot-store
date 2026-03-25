import { BotInstance } from "./BotInstance.js";
import type { BotStatus } from "./BotInstance.js";
export interface BotRecord {
    botId: string;
    nombre: string;
    password?: string;
    createdAt: number;
    active: boolean;
}
export interface BotPublicState {
    botId: string;
    nombre: string;
    status: BotStatus;
    createdAt: number;
    readySince: number | null;
    lastError: string | null;
}
declare class BotManager {
    private instances;
    private _starting;
    /** Collection ref for platform-level bot registry */
    private platformBotsRef;
    /** Called at startup: loads all registered bots from Firestore and starts them. */
    initFromFirestore(): Promise<void>;
    /**
     * Ensure a Firestore record exists for the legacy default bot.
     * Does NOT create an instance — initFromFirestore() handles that
     * so we avoid double-starting the same Chrome userDataDir.
     */
    registerDefaultBot(botPhoneNumber: string): Promise<void>;
    createBot(payload: {
        nombre: string;
        password?: string;
    }): Promise<BotRecord>;
    deleteBot(botId: string): Promise<void>;
    startBot(botId: string): Promise<void>;
    stopBot(botId: string): Promise<void>;
    restartBot(botId: string): Promise<void>;
    listBots(): Promise<BotPublicState[]>;
    getBot(botId: string): Promise<BotPublicState | null>;
    getInstance(botId: string): BotInstance | undefined;
    private _registerInstance;
    private _get;
}
export declare const botManager: BotManager;
export {};
//# sourceMappingURL=BotManager.d.ts.map