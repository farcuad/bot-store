import pkg from "whatsapp-web.js";
declare const Client: typeof pkg.Client;
import { EventEmitter } from "node:events";
export type BotStatus = "idle" | "initializing" | "qr" | "ready" | "disconnected" | "error";
export interface BotInstanceState {
    botId: string;
    status: BotStatus;
    qr: string | null;
    lastError: string | null;
    readySince: number | null;
}
export declare class BotInstance extends EventEmitter {
    readonly botId: string;
    private client;
    private state;
    private bootTime;
    private sessionMgr;
    private configSvc;
    private statsMgr;
    constructor(botId: string);
    getState(): BotInstanceState;
    getQR(): string | null;
    getClient(): InstanceType<typeof Client> | null;
    private setState;
    start(): Promise<void>;
    stop(): Promise<void>;
    restart(): Promise<void>;
    sendMessage(to: string, message: string): Promise<void>;
    private _handleMessage;
}
export {};
//# sourceMappingURL=BotInstance.d.ts.map