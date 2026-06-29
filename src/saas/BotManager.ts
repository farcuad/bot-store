import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import { db } from "../config/firebase.js";
import { BotInstance } from "./BotInstance.js";
import type { BotStatus } from "./BotInstance.js";
import { canBotStart } from "./billing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS_ROOT = path.resolve(__dirname, "../../bots");

export interface BotRecord {
  botId: string;
  nombre: string;
  ownerUid: string; // Firebase UID del usuario propietario
  createdAt: number;
  active: boolean;
  clientKey?: string | undefined;
  timezone?: string | undefined;
}

export interface BotPublicState {
  botId: string;
  nombre: string;
  ownerUid: string;
  status: BotStatus;
  createdAt: number;
  readySince: number | null;
  lastError: string | null;
  clientKey?: string | undefined;
  hasSession?: boolean | undefined;
  timezone?: string | undefined;
  isAutoResponseEnabled?: boolean;
  debugEnabled?: boolean;
  muevelappMcpEnabled?: boolean;
  ordenalappMcpEnabled?: boolean;
  ordenalappSlug?: string;
  cambialappMcpEnabled?: boolean;
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
    console.log("🤖 BotManager: cargando bots desde Firestore…");
    try {
      const snap = await this.platformBotsRef().get();
      console.log(`🤖 BotManager: se encontraron ${snap.size} bot(s).`);
      for (const doc of snap.docs) {
        const record = doc.data() as BotRecord;
        if (record.active) {
          const instance = await this._registerInstance(record.botId);
          // Solo auto-iniciar si el bot ya tiene una sesión establecida
          if (await instance.hasSession()) {
            console.log(`[${record.botId}] Sesión existente encontrada — iniciando automáticamente.`);
            this.startBot(record.botId).catch((e) =>
              console.error(`[${record.botId}] Error en auto-inicio:`, e),
            );
          } else {
            console.log(`[${record.botId}] Sin sesión activa. En espera hasta que el usuario lo inicie manualmente.`);
          }
        } else {
          await this._registerInstance(record.botId);
        }
      }

      // Start the periodic billing check
      this.startBillingWatcher();
    } catch (e) {
      console.error("BotManager: error al cargar desde Firestore:", e);
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
      `🤖 BotManager: bot por defecto registrado (${botPhoneNumber}).`,
    );
  }

  // ── CRUD ────────────────────────────────────────────────────────────────────

  async createBot(payload: {
    nombre: string;
    password?: string | undefined;
    ownerUid: string;
    timezone?: string | undefined;
  }): Promise<BotRecord> {
    const botId = `bot_${Date.now()}`;
    const clientKey = crypto.randomUUID();
    const record: BotRecord = {
      botId,
      nombre: payload.nombre,
      ownerUid: payload.ownerUid,
      createdAt: Date.now(),
      active: true,
      clientKey,
      timezone: payload.timezone || "America/Caracas",
    };

    // Persist to Firestore — registry (platform/bots/registry/{botId})
    await this.platformBotsRef().doc(botId).set(record);

    // Also initialize the bot's config document in bots/{botId}
    const timezone = payload.timezone || "America/Caracas";
    await db.collection("bots").doc(botId).set(
      { nombre: payload.nombre, activo: true, isAutoResponseEnabled: true, timezone, debugEnabled: false },
      { merge: true }
    );

    // Initialize the attendance schedule with the selected timezone
    await db.collection("bots").doc(botId)
      .collection("horarios").doc("atencion")
      .set({ dias_habiles: [1,2,3,4,5], hora_apertura: 8, hora_cierre: 18, timezone }, { merge: true });

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
    // Eliminar el directorio del bot y todos sus contenidos
    const botDir = path.join(BOTS_ROOT, botId);
    try {
      await fs.rm(botDir, { recursive: true, force: true });
      console.log(`[${botId}] 🗑️ Directorio del bot eliminado: ${botDir}`);
    } catch (e) {
      console.warn(`[${botId}] No se pudo eliminar el directorio del bot:`, e);
    }
  }

  async setTimezone(botId: string, timezone: string): Promise<void> {
    await this.platformBotsRef().doc(botId).update({ timezone });
    await db.collection("bots").doc(botId).update({ timezone });
    await db.collection("bots").doc(botId).collection("horarios").doc("atencion").set({ timezone }, { merge: true });
    
    // Refresh bot config in memory if it's running
    const instance = this.instances.get(botId);
    if (instance) {
      await instance.reloadConfig();
    }
  }

  async renameBot(botId: string, nuevoNombre: string): Promise<void> {
    if (!nuevoNombre || nuevoNombre.trim() === '') {
      throw new Error("El nombre no puede estar vacío");
    }
    const trimmed = nuevoNombre.trim();
    // Update both locations atomically using a batch write
    const batch = db.batch();
    batch.update(this.platformBotsRef().doc(botId), { nombre: trimmed });
    batch.set(db.collection("bots").doc(botId), { nombre: trimmed }, { merge: true });
    await batch.commit();
  }

  async getBotKey(botId: string): Promise<string | null> {
    const doc = await this.platformBotsRef().doc(botId).get();
    if (!doc.exists) return null;
    return (doc.data() as BotRecord).clientKey || null;
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  async startBot(botId: string): Promise<void> {
    if (this._starting.has(botId)) {
      console.log(
        `[${botId}] Inicio ya en progreso — omitiendo llamada duplicada.`,
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

  async stopAll(): Promise<void> {
    console.log("🤖 BotManager: deteniendo todos los bots...");
    const stopPromises = Array.from(this.instances.keys()).map(async (botId) => {
      try {
        await this.stopBot(botId);
      } catch (e) {
        console.error(`[${botId}] Error al detener durante apagado:`, e);
      }
    });
    await Promise.all(stopPromises);
  }

  async restartBot(botId: string): Promise<void> {
    const instance = this._get(botId);
    await instance.restart();
  }

  /** Limpia la sesión del bot: detiene el bot, elimina el directorio Chrome de sesión. */
  async clearSession(botId: string): Promise<void> {
    // Detener si está en ejecución
    const instance = this.instances.get(botId);
    if (instance) {
      await instance.stop();
    }
    // Eliminar solo el subdirectorio de sesión de Chrome, no el directorio completo del bot
    const sessionDir = path.join(BOTS_ROOT, botId, `session-${botId}`);
    try {
      await fs.rm(sessionDir, { recursive: true, force: true });
      console.log(`[${botId}] 🧹 Directorio de sesión limpiado: ${sessionDir}`);
    } catch (e) {
      console.warn(`[${botId}] No se pudo limpiar el directorio de sesión:`, e);
    }
  }

  // ── Queries ─────────────────────────────────────────────────────────────────

  /**
   * List bots. If ownerUid is provided (non-admin), returns only their bots.
   * If ownerUid is undefined (admin), returns all bots.
   */
  async listBots(ownerUid?: string): Promise<BotPublicState[]> {
    const botsRef = this.platformBotsRef();
    let query: FirebaseFirestore.Query = botsRef.orderBy(
      "createdAt",
      "asc",
    );
    if (ownerUid) {
      query = query.where("ownerUid", "==", ownerUid);
    }
    const snap = await query.get();
    const results = await Promise.all(snap.docs.map(async (doc) => {
      const record = doc.data() as BotRecord;
      const instance = this.instances.get(record.botId);
      const liveState = instance?.getState();
      const sessionExists = instance ? await instance.hasSession() : false;
      
      // Fetch auto-response status from the bot's config doc
      const botDoc = await db.collection("bots").doc(record.botId).get();
      const botData = botDoc.data();
      const isAutoResponseEnabled = botData?.isAutoResponseEnabled ?? true;
      const debugEnabled = botData?.debugEnabled ?? false;
      const muevelappMcpEnabled = botData?.muevelappMcpEnabled ?? false;
      const ordenalappMcpEnabled = botData?.ordenalappMcpEnabled ?? false;
      const ordenalappSlug = botData?.ordenalappSlug ?? "";
      const cambialappMcpEnabled = botData?.cambialappMcpEnabled ?? false;

      const state: BotPublicState = {
        botId: doc.id,
        nombre: record.nombre,
        ownerUid: record.ownerUid,
        status: liveState?.status ?? "idle",
        createdAt: record.createdAt,
        readySince: liveState?.readySince ?? null,
        lastError: liveState?.lastError ?? null,
        hasSession: sessionExists,
        timezone: record.timezone,
        isAutoResponseEnabled,
        debugEnabled,
        muevelappMcpEnabled,
        ordenalappMcpEnabled,
        ordenalappSlug,
        cambialappMcpEnabled,
      };
      if (record.clientKey !== undefined) {
        state.clientKey = record.clientKey;
      }
      return state;
    }));
    return results;
  }

  async getBot(botId: string): Promise<BotPublicState | null> {
    const doc = await this.platformBotsRef().doc(botId).get();
    if (!doc.exists) return null;
    const record = doc.data() as BotRecord;
    const instance = this.instances.get(botId);
    const liveState = instance?.getState();
    const sessionExists = instance ? await instance.hasSession() : false;
    
    // Fetch auto-response status from the bot's config doc
    const botDoc = await db.collection("bots").doc(botId).get();
    const botData = botDoc.data();
    const isAutoResponseEnabled = botData?.isAutoResponseEnabled ?? true;
    const debugEnabled = botData?.debugEnabled ?? false;
    const muevelappMcpEnabled = botData?.muevelappMcpEnabled ?? false;
    const ordenalappMcpEnabled = botData?.ordenalappMcpEnabled ?? false;
    const ordenalappSlug = botData?.ordenalappSlug ?? "";
    const cambialappMcpEnabled = botData?.cambialappMcpEnabled ?? false;

    const state: BotPublicState = {
      botId: record.botId,
      nombre: record.nombre,
      ownerUid: record.ownerUid,
      status: liveState?.status ?? "idle",
      createdAt: record.createdAt,
      readySince: liveState?.readySince ?? null,
      lastError: liveState?.lastError ?? null,
      hasSession: sessionExists,
      timezone: record.timezone,
      isAutoResponseEnabled,
      debugEnabled,
      muevelappMcpEnabled,
      ordenalappMcpEnabled,
      ordenalappSlug,
      cambialappMcpEnabled,
    };
    if (record.clientKey !== undefined) {
      state.clientKey = record.clientKey;
    }
    return state;
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
    if (!instance) throw new Error(`Bot no encontrado: ${botId}`);
    return instance;
  }

  // ── Billing Enforcement ─────────────────────────────────────────────────────

  private startBillingWatcher() {
    // Check billing status every hour (3600000ms)
    // For testing you might want to make this faster, but 1 hour is standard for SaaS.
    setInterval(async () => {
      try {
        const instancesList = Array.from(this.instances.entries());
        
        for (const [botId, instance] of instancesList) {
          if (instance.getState().status !== "ready") continue;

          // We need the ownerUid to check billing
          const snap = await this.platformBotsRef().doc(botId).get();
          if (!snap.exists) continue;
          
          const ownerUid = snap.data()?.ownerUid;
          if (!ownerUid || ownerUid === "admin") continue; // Admins are exempt or there's no owner

          const check = await canBotStart(botId, ownerUid);
          
          if (!check.allowed) {
            console.log(`[${botId}] 🛑 Período de facturación expirado/Inválido (${check.reason}). Deteniendo bot.`);
            await this.stopBot(botId);
          }
        }
      } catch (e) {
        console.error("BotManager: Error en la revisión periódica de facturación:", e);
      }
    }, 60 * 60 * 1000); // 1 hora
  }
}

// Singleton export
export const botManager = new BotManager();
