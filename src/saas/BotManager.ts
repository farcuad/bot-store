import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db } from "../config/firebase.js";
import { BotInstance } from "./BotInstance.js";
import type { BotStatus } from "./BotInstance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS_ROOT = path.resolve(__dirname, "../../bots");

export interface BotRecord {
  botId: string;
  nombre: string;
  ownerUid: string; // Firebase UID del usuario propietario
  createdAt: number;
  active: boolean;
}

export interface BotPublicState {
  botId: string;
  nombre: string;
  ownerUid: string;
  status: BotStatus;
  createdAt: number;
  readySince: number | null;
  lastError: string | null;
}

class BotManager {
  private instances = new Map<string, BotInstance>();
  private _starting = new Set<string>(); // guard against concurrent starts

  /** Collection ref for platform-level bot registry */
  private platformBotsRef() {
    return db.collection("platform").doc("bots").collection("registry");
  }

  // ── Initialization ──────────────────────────────────────────────────────────

  /** Called at startup: loads all registered bots from Firestore and starts them. */
  async initFromFirestore(): Promise<void> {
    console.log("🤖 BotManager: loading bots from Firestore…");
    try {
      const snap = await this.platformBotsRef().get();
      console.log(`🤖 BotManager: found ${snap.size} bot(s).`);
      for (const doc of snap.docs) {
        const record = doc.data() as BotRecord;
        if (record.active) {
          await this._registerInstance(record.botId);
          this.startBot(record.botId).catch((e) =>
            console.error(`[${record.botId}] auto-start error:`, e),
          );
        } else {
          await this._registerInstance(record.botId);
        }
      }
    } catch (e) {
      console.error("BotManager: error loading from Firestore:", e);
    }
  }

  /**
   * Ensure a Firestore record exists for the legacy default bot.
   * Does NOT create an instance — initFromFirestore() handles that
   * so we avoid double-starting the same Chrome userDataDir.
   */
  async registerDefaultBot(botPhoneNumber: string): Promise<void> {
    const botId = "bot_default";
    const snap = await this.platformBotsRef().doc(botId).get();
    if (!snap.exists) {
      const record: BotRecord = {
        botId,
        nombre: "Bot Principal",
        ownerUid: "admin",
        createdAt: Date.now(),
        active: true,
      };
      await this.platformBotsRef().doc(botId).set(record);
    }
    console.log(
      `🤖 BotManager: registered legacy default bot (${botPhoneNumber}).`,
    );
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async createBot(payload: {
    nombre: string;
    password?: string;
  }): Promise<BotRecord> {
    const botId = `bot_${Date.now()}`;
    const record: BotRecord = {
      botId,
      nombre: payload.nombre,
      ownerUid: payload.ownerUid,
      createdAt: Date.now(),
      active: true,
    };

    // Persist to Firestore
    await this.platformBotsRef().doc(botId).set(record);

    // Create isolated directory
    const botDir = path.join(BOTS_ROOT, botId);
    await fs.mkdir(botDir, { recursive: true });

    // Create instance (not started yet)
    await this._registerInstance(botId);

    return record;
  }

  async deleteBot(botId: string): Promise<void> {
    await this.stopBot(botId);
    this.instances.delete(botId);
    await this.platformBotsRef().doc(botId).delete();
    // Optionally: remove bot directory (risky — skip for safety)
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async startBot(botId: string): Promise<void> {
    if (this._starting.has(botId)) {
      console.log(
        `[${botId}] start already in progress — skipping duplicate call.`,
      );
      return;
    }
    this._starting.add(botId);
    try {
      const instance = this._get(botId);
      await instance.start();
    } finally {
      this._starting.delete(botId);
    }
  }

  async stopBot(botId: string): Promise<void> {
    const instance = this._get(botId);
    await instance.stop();
  }

  async restartBot(botId: string): Promise<void> {
    const instance = this._get(botId);
    await instance.restart();
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /**
   * List bots. If ownerUid is provided (non-admin), returns only their bots.
   * If ownerUid is undefined (admin), returns all bots.
   */
  async listBots(ownerUid?: string): Promise<BotPublicState[]> {
    let query: FirebaseFirestore.Query = this.platformBotsRef().orderBy(
      "createdAt",
      "asc",
    );
    if (ownerUid) {
      query = query.where("ownerUid", "==", ownerUid);
    }
    const snap = await query.get();
    return snap.docs.map((doc) => {
      const record = doc.data() as BotRecord;
      const instance = this.instances.get(record.botId);
      const liveState = instance?.getState();
      return {
        botId: record.botId,
        nombre: record.nombre,
        ownerUid: record.ownerUid,
        status: liveState?.status ?? "idle",
        createdAt: record.createdAt,
        readySince: liveState?.readySince ?? null,
        lastError: liveState?.lastError ?? null,
      };
    });
  }

  async getBot(botId: string): Promise<BotPublicState | null> {
    const doc = await this.platformBotsRef().doc(botId).get();
    if (!doc.exists) return null;
    const record = doc.data() as BotRecord;
    const instance = this.instances.get(botId);
    const liveState = instance?.getState();
    return {
      botId: record.botId,
      nombre: record.nombre,
      ownerUid: record.ownerUid,
      status: liveState?.status ?? "idle",
      createdAt: record.createdAt,
      readySince: liveState?.readySince ?? null,
      lastError: liveState?.lastError ?? null,
    };
  }

  getInstance(botId: string): BotInstance | undefined {
    return this.instances.get(botId);
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private async _registerInstance(botId: string): Promise<BotInstance> {
    if (this.instances.has(botId)) return this.instances.get(botId)!;
    const instance = new BotInstance(botId);
    this.instances.set(botId, instance);

    // Ensure bot directory exists
    const botDir = path.join(BOTS_ROOT, botId);
    await fs.mkdir(botDir, { recursive: true });

    return instance;
  }

  private _get(botId: string): BotInstance {
    const instance = this.instances.get(botId);
    if (!instance) throw new Error(`Bot not found: ${botId}`);
    return instance;
  }
}

// Singleton export
export const botManager = new BotManager();
