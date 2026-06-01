import pkg from "whatsapp-web.js";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import OpenAI from "openai";
import { db } from "../config/firebase.js";
import { generarRespuestaBot } from "../controllers/AiController.js";
import { createSessionManager } from "../services/sessionManager.js";
import { createConfigService } from "../services/configService.js";
import { createStatsManager } from "../services/statsManager.js";
import { createBotLogger } from "../services/botLogger.js";
import { subscriptionService } from "../services/subscriptionService.js";
import type { BotLogger } from "../services/botLogger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS_ROOT = path.resolve(__dirname, "../../bots");
const TEMP_AUDIO_DIR = path.resolve(process.cwd(), "temp_audio");

// Ensure temp_audio directory exists
if (!fs.existsSync(TEMP_AUDIO_DIR)) {
  fs.mkdirSync(TEMP_AUDIO_DIR, { recursive: true });
}

export type BotStatus =
  | "idle"
  | "initializing"
  | "qr"
  | "ready"
  | "disconnected"
  | "error";

export interface BotInstanceState {
  botId: string;
  status: BotStatus;
  qr: string | null;
  lastError: string | null;
  readySince: number | null;
}

export class BotInstance extends EventEmitter {
  readonly botId: string;
  private client: InstanceType<typeof pkg.Client> | null = null;
  private state: BotInstanceState;
  private bootTime = 0;

  // Scoped services
  private sessionMgr: ReturnType<typeof createSessionManager>;
  private configSvc: ReturnType<typeof createConfigService>;
  private statsMgr: ReturnType<typeof createStatsManager>;
  private logger: BotLogger;
  private recentlySentMessages = new Set<string>();
  private recentlySentMediaTo = new Set<string>();
  private healthCheckInterval: NodeJS.Timeout | null = null;

  /** Auto-expire entries from recentlySentMessages after 60s to prevent unbounded growth */
  private addRecentSent(text: string): void {
    this.recentlySentMessages.add(text);
    setTimeout(() => this.recentlySentMessages.delete(text), 60_000);
  }

  private addRecentMediaSent(remoteId: string): void {
    this.recentlySentMediaTo.add(remoteId);
    setTimeout(() => this.recentlySentMediaTo.delete(remoteId), 30_000);
  }

  // ── Aggregation state ──────────────────────────────────────────────────────
  private aggregationMap = new Map<
    string,
    {
      timer: NodeJS.Timeout;
      rawMessages: any[];
      isProcessing?: boolean;
    }
  >();
  private readonly DEBOUNCE_MS = 5000;
  private processedMsgIds = new Set<string>();

  constructor(botId: string) {
    super();
    this.botId = botId;
    this.state = {
      botId,
      status: "idle",
      qr: null,
      lastError: null,
      readySince: null,
    };
    this.sessionMgr = createSessionManager(botId);
    this.configSvc = createConfigService(botId);
    this.statsMgr = createStatsManager(botId);
    this.logger = createBotLogger(botId);
  }

  getState(): BotInstanceState {
    return { ...this.state };
  }

  getQR(): string | null {
    return this.state.qr;
  }

  getClient(): InstanceType<typeof pkg.Client> | null {
    return this.client;
  }

  private setState(partial: Partial<BotInstanceState>) {
    this.state = { ...this.state, ...partial };
    this.emit("state_change", this.state);
  }

  async hasSession(): Promise<boolean> {
    const { promises: fsp } = await import("node:fs");
    const sessionDir = path.join(
      BOTS_ROOT,
      this.botId,
      `session-${this.botId}`,
      "Default",
    );
    try {
      const stats = await fsp.stat(sessionDir);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  async reloadConfig(): Promise<void> {
    await this.configSvc.loadConfig();
    const config = this.configSvc.getConfig();
    this.logger.setDebug(!!config.debugEnabled);
  }

  async start(): Promise<void> {
    if (
      this.state.status === "initializing" ||
      this.state.status === "qr" ||
      this.state.status === "ready"
    ) {
      this.logger.log(
        `Ya en ejecución (${this.state.status}) — omitiendo inicio duplicado.`,
      );
      return;
    }

    this.setState({ status: "initializing", qr: null, lastError: null });
    this.logger.log(`🚀 Iniciando instancia del bot…`);

    const dataPath = path.join(BOTS_ROOT, this.botId);

    const { promises: fsp } = await import("node:fs");
    const sessionDir = path.join(dataPath, `session-${this.botId}`);
    
    // Cleanup SingletonLock if it exists (prevents "Profile in use" error after crash)
    try {
      const lockFiles = [
        path.join(sessionDir, 'SingletonLock'),
        path.join(sessionDir, 'SingletonCookie'),
        path.join(sessionDir, 'SingletonSocket'),
        path.join(sessionDir, 'Default', 'SingletonLock'),
        path.join(sessionDir, 'Default', 'SingletonCookie'),
        path.join(sessionDir, 'Default', 'SingletonSocket')
      ];

      for (const lockFile of lockFiles) {
        try {
          const stats = fs.lstatSync(lockFile);
          if (stats) {
            this.logger.log(`⚠️ Archivo de bloqueo detectado (${path.basename(lockFile)}). Eliminando para evitar bloqueo de instancia.`);
            fs.unlinkSync(lockFile);
          }
        } catch (err) {
          // File or broken symlink doesn't exist, ignore
        }
      }
    } catch (e) {
      // Ignore errors during lock removal
    }

    this.client = new pkg.Client({
      qrMaxRetries: 2,
      authStrategy: new pkg.LocalAuth({
        clientId: this.botId,
        dataPath,
      }),
      puppeteer: {
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          "--disable-accelerated-2d-canvas",
          "--disable-gpu",
        ],
        timeout: 60000,
        protocolTimeout: 300000,
      },
    });

    this.bootTime = Date.now();

    await this.configSvc.loadConfig();
    this.logger.setDebug(!!this.configSvc.getConfig().debugEnabled);
    this.configSvc.startConfigRefresh();
    await this.statsMgr.loadStats();

    this.client.on("qr", (qr: string) => {
      this.setState({ status: "qr", qr });
      this.emit("qr", qr);
    });

    this.client.on("ready", async () => {
      this.logger.log(`✅ Bot listo y operativo.`);
      this.setState({ status: "ready", qr: null, readySince: Date.now() });
      
      // Parche para error de estados (canCheckStatusRankingPosterGating)
      try {
        await (this.client as any).pupPage.evaluate(() => {
          if ((window as any).Store && (window as any).Store.StatusUtils) {
            if (!(window as any).Store.StatusUtils.canCheckStatusRankingPosterGating) {
              (window as any).Store.StatusUtils.canCheckStatusRankingPosterGating = () => false;
            }
          }
        });
      } catch (e) {
        this.logger.error("Error al aplicar parche de estados:", e);
      }

      // Parche para error "No LID for user" en grupos (multi-device)
      await this._patchLidResolution();

      this.emit("ready");
    });

    this.client.on("disconnected", (reason: string) => {
      this.setState({ status: "disconnected", qr: null });
      this.emit("disconnected", reason);
    });

    this.client.on("auth_failure", (msg: string) => {
      this.logger.error(`Error de autenticación: ${msg}`);
      this.setState({ status: "error", lastError: msg });
    });

    this.client.on("message_create", (msg: any) => {
      this._handleMessage(msg).catch(err => {
        this.logger.error(`Error no manejado en _handleMessage:`, err);
      });
    });

    // Add error and change state listeners for better monitoring
    this.client.on("error", (err: any) => {
      this.logger.error(`Error crítico del cliente WhatsApp:`, err);
      if (this.state.status === "ready") {
        this.setState({ status: "error", lastError: err.message || "Unknown error" });
      }
    });

    this.client.initialize().catch(err => {
      this.logger.error(`Error al inicializar el cliente:`, err);
      this.setState({ status: "error", lastError: err.message });
    });

    this.startHealthCheck();
  }

  async stop(): Promise<void> {
    this.stopHealthCheck();
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch (e) {}
    this.client = null;
    this.configSvc.stopConfigRefresh();
    this.setState({ status: "idle", qr: null });
  }

  async restart(): Promise<void> {
    this.logger.log(`🔄 Reiniciando bot por inactividad o error...`);
    await this.stop();
    await this.start();
  }

  private startHealthCheck() {
    this.stopHealthCheck();
    this.healthCheckInterval = setInterval(async () => {
      if (this.state.status === "ready" && this.client) {
        try {
          const timeoutPromise = (ms: number, msg: string) => new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error(msg)), ms)
          );

          // Si no responde en 30 segundos, getState lanzará timeout o error
          const state = await Promise.race([
            this.client.getState(),
            timeoutPromise(30000, "Timeout obteniendo estado")
          ]) as string;
          
          // Verificar también que WWebJS siga inyectado (si la página se recargó sola, window.WWebJS será undefined)
          const evaluatePromise = (this.client as any).pupPage.evaluate(() => {
            return typeof window !== "undefined" && (window as any).WWebJS !== undefined;
          });

          const isWWebJSInjected = await Promise.race([
            evaluatePromise,
            timeoutPromise(30000, "Timeout verificando WWebJS inyectado")
          ]).catch(() => false);
          
          if (!state || state === "CONFLICT" || state === "UNPAIRED" || !isWWebJSInjected) {
            this.logger.warn(`⚠️ HealthCheck: Estado anómalo detectado (State: ${state}, WWebJS: ${isWWebJSInjected}). Reiniciando...`);
            await this.restart();
          }
        } catch (e: any) {
          this.logger.error(`❌ HealthCheck falló (posible cuelgue de Puppeteer): ${e.message || e}`);
          await this.restart();
        }
      }
    }, 25_000); // Cada 25 segundos
  }

  private stopHealthCheck() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  async sendMessage(to: string, message: string): Promise<void> {
    const chatId = to.includes("@") ? to : `${to.replace(/\D/g, "")}@c.us`;
    this.addRecentSent(message.trim());
    await this.safeSendMessage(chatId, message, undefined, true);
  }

  async sendImage(to: string, source: string, caption?: string): Promise<void> {
    const chatId = to.includes("@") ? to : `${to.replace(/\D/g, "")}@c.us`;
    this.addRecentMediaSent(chatId);
    if (caption) this.addRecentSent(caption.trim());
    let media: pkg.MessageMedia;
    if (source.startsWith("http")) {
      media = await this._fetchMediaFromUrl(source);
    } else {
      media = pkg.MessageMedia.fromFilePath(source);
    }
    const options = caption ? { caption } : {};
    await this.safeSendMessage(chatId, media, options, true);
  }

  // ── Generic chat methods (contacts + groups) ────────────────────────────────

  /**
   * Send a text message to any pre-normalized chatId (@c.us or @g.us).
   */
  async sendMessageToChat(chatId: string, message: string): Promise<void> {
    // Re-aplicar parche si el destino es un estado
    if (chatId === "status@broadcast") {
      await this._patchStatusCheck();
    }

    this.addRecentSent(message.trim());
    await this.safeSendMessage(chatId, message, undefined, true);
  }

  /**
   * Send a media message (from URL or file path) to any pre-normalized chatId.
   */
  async sendMediaToChat(
    chatId: string,
    source: string,
    caption?: string,
  ): Promise<void> {
    // Re-aplicar parche si el destino es un estado
    if (chatId === "status@broadcast") {
      await this._patchStatusCheck();
    }

    this.addRecentMediaSent(chatId);
    if (caption) this.addRecentSent(caption.trim());
    let media: pkg.MessageMedia;
    if (source.startsWith("http")) {
      media = await this._fetchMediaFromUrl(source);
    } else {
      media = pkg.MessageMedia.fromFilePath(source);
    }
    const options = caption ? { caption } : {};
    await this.safeSendMessage(chatId, media, options, true);
  }

  /**
   * Inyecta un parche en el navegador para evitar el error canCheckStatusRankingPosterGating
   * al enviar estados en versiones recientes de WhatsApp Web.
   */
  private async _patchStatusCheck() {
    try {
      await (this.client as any).pupPage.evaluate(() => {
        try {
          const win = window as any;
          if (win.Store && win.Store.StatusUtils) {
            if (!win.Store.StatusUtils.canCheckStatusRankingPosterGating) {
              win.Store.StatusUtils.canCheckStatusRankingPosterGating = () => false;
            }
          }
        } catch (e) {}
      });
    } catch (e) {}
  }

  /**
   * Inyecta un parche en el navegador para evitar el error "No LID for user"
   * al enviar mensajes a grupos en la arquitectura multi-dispositivo de WhatsApp.
   *
   * Raíz del problema: cuando un grupo tiene isLidAddressingMode=true, WhatsApp Web
   * intenta cifrar el mensaje usando el LID de cada participante. Si alguno no tiene
   * LID en caché local, WAWebSendMsgChatAction.addAndSendMsgToChat lanza el error.
   *
   * Estrategia principal: parchear WWebJS.sendMessage para desactivar temporalmente
   * isLidAddressingMode en el metadata del grupo antes del envío, forzando la ruta
   * de cifrado estándar (por número de teléfono) que sí funciona.
   *
   * Estrategia secundaria: parchear WAWebSendMsgChatAction.addAndSendMsgToChat para
   * capturar el error en origen y silenciarlo cuando ya no hay alternativa.
   */
  private async _patchLidResolution() {
    try {
      await (this.client as any).pupPage.evaluate(() => {
        try {
          const win = window as any;
          if ((win as any).__lidPatchApplied) return; // evitar doble parcheo

          // ── Estrategia principal: parchear WWebJS.sendMessage ──────────────
          // Leído de Utils.js: el error ocurre en addAndSendMsgToChat cuando
          // chat.groupMetadata.isLidAddressingMode === true. Al ponerlo a false
          // temporalmente, WhatsApp usa la ruta de cifrado por número (@c.us)
          // que no requiere LID.
          if (win.WWebJS && win.WWebJS.sendMessage) {
            const origSend = win.WWebJS.sendMessage;
            win.WWebJS.sendMessage = async function(chat: any, content: any, options: any) {
              let prevLidMode: boolean | undefined;
              try {
                // Desactivar temporalmente LID addressing mode en grupos
                if (chat && chat.groupMetadata && chat.groupMetadata.isLidAddressingMode) {
                  prevLidMode = true;
                  chat.groupMetadata.isLidAddressingMode = false;
                }
                return await origSend.call(win.WWebJS, chat, content, options);
              } catch (e: any) {
                if (e && e.message && e.message.includes('No LID for user')) {
                  // Si aún falla, intentar con isLidAddressingMode=false ya aplicado
                  console.warn('[WWebJS Patch] No LID for user tras desactivar LID mode, ignorando:', e.message);
                  return undefined; // mensaje no enviado pero sin romper el flujo
                }
                throw e;
              } finally {
                // Restaurar el valor original para no afectar otras operaciones
                if (prevLidMode !== undefined && chat && chat.groupMetadata) {
                  chat.groupMetadata.isLidAddressingMode = prevLidMode;
                }
              }
            };
          }

          // ── Estrategia secundaria: parchear WAWebSendMsgChatAction ─────────
          // Este es el módulo que lanza el error en origen (identificado por
          // el stack trace: addAndSendMsgToChat → encrypt → getLid → throw)
          try {
            const sendAction = win.require('WAWebSendMsgChatAction');
            if (sendAction && sendAction.addAndSendMsgToChat) {
              const origAddSend = sendAction.addAndSendMsgToChat;
              sendAction.addAndSendMsgToChat = function(chat: any, message: any, ...rest: any[]) {
                // Desactivar LID mode antes de la llamada interna
                let prevLidMode: boolean | undefined;
                if (chat && chat.groupMetadata && chat.groupMetadata.isLidAddressingMode) {
                  prevLidMode = true;
                  chat.groupMetadata.isLidAddressingMode = false;
                }
                try {
                  return origAddSend.call(sendAction, chat, message, ...rest);
                } catch (e: any) {
                  if (e && e.message && e.message.includes('No LID for user')) {
                    console.warn('[WWebJS Patch] addAndSendMsgToChat - No LID ignorado:', e.message);
                    return [Promise.resolve(null), Promise.resolve(null)];
                  }
                  throw e;
                } finally {
                  if (prevLidMode !== undefined && chat && chat.groupMetadata) {
                    chat.groupMetadata.isLidAddressingMode = prevLidMode;
                  }
                }
              };
            }
          } catch (e) {
            // WAWebSendMsgChatAction puede no estar disponible en esta versión
          }

          (win as any).__lidPatchApplied = true;
          console.log('[WWebJS Patch] Parche LID aplicado exitosamente.');
        } catch (patchErr) {
          console.warn('[WWebJS Patch] No se pudo aplicar el parche LID:', patchErr);
        }
      });
    } catch (e) {
      this.logger.warn(`⚠️ Error aplicando parche LID (no crítico): ${(e as any)?.message || e}`);
    }
  }

  /**
   * Returns all chats from the WhatsApp client. Requires READY status.
   */
  async getChats(): Promise<any[]> {
    if (!this.client || this.state.status !== "ready") {
      throw new Error(`Bot ${this.botId} is not ready.`);
    }
    return this.client.getChats();
  }

  /**
   * Normalizes any WhatsApp ID (including @lid, :device suffixes)
   * to a standard @c.us ID for sendMessage compatibility.
   */
  private normalizeToContactId(id: string): string {
    // Remove device suffix (:1, :2, etc)
    const withoutDevice = id.split(":")[0];
    if (!withoutDevice) return id;

    // Preserve LID domain if present
    if (withoutDevice.includes("@lid")) {
      return withoutDevice;
    }

    // Default to @c.us for phone numbers
    const number = withoutDevice.split("@")[0];
    return `${number}@c.us`;
  }

  private checkClientState(): void {
    if (!this.client) {
      throw new Error(`WhatsApp client is not initialized for bot ${this.botId}.`);
    }
    if (this.state.status !== "ready") {
      throw new Error(`WhatsApp client is not ready (current status: ${this.state.status}) for bot ${this.botId}.`);
    }
    if (!this.client.info || !this.client.info.wid) {
      throw new Error(`WhatsApp client info is not available for bot ${this.botId}.`);
    }
  }

  private async resolveToCanonicalContactId(id: string): Promise<string> {
    const normalized = this.normalizeToContactId(id);
    if (normalized.includes("@lid")) {
      try {
        if (this.client && this.state.status === "ready") {
          const contact = await this.client.getContactById(normalized);
          if (contact && contact.number) {
            const canonical = `${contact.number}@c.us`;
            this.logger.log(`🔄 Resolví @lid ${normalized} a @c.us canonical ${canonical}`);
            return canonical;
          }
        }
      } catch (e: any) {
        this.logger.warn(`⚠️ No se pudo resolver @lid ${normalized} a @c.us: ${e.message || e}`);
      }
    }
    return normalized;
  }

  private async safeSendMessage(
    to: string,
    content: string | pkg.MessageMedia,
    options?: any,
    shouldThrow = false,
    retryCount = 0
  ): Promise<any> {
    const maxRetries = 2;
    const baseDelayMs = 1000;

    try {
      // 1. Verificar estado del cliente
      this.checkClientState();

      // 2. Limpieza e intento de resolución de ID (@lid -> @c.us)
      const resolvedTo = await this.resolveToCanonicalContactId(to);

      // 3. Para grupos: re-aplicar parche LID antes de enviar (puede haberse perdido tras recarga)
      if (resolvedTo.endsWith("@g.us")) {
        await this._patchLidResolution();
      }

      // 4. Enviar el mensaje
      if (!this.client) {
        throw new Error("Client is null after checkState");
      }
      return await this.client.sendMessage(resolvedTo, content, options);
    } catch (error: any) {
      const targetId = to;
      const isLidError = typeof error?.message === 'string' && error.message.includes('No LID for user');

      this.logger.error(
        `❌ Error al enviar mensaje a ${targetId} (intento ${retryCount + 1}/${maxRetries + 1}) para bot ${this.botId}: ${error.message || error}`,
        error
      );

      // El error "No LID for user" es un fallo interno del cifrado de WhatsApp.
      // No tiene sentido reintentar con el mismo cliente — el parche ya fue aplicado;
      // si sigue fallando en el primer intento, se intenta una vez más después de
      // esperar que el parche de página surta efecto.
      if (isLidError && retryCount === 0) {
        this.logger.log(`🔄 Error LID detectado en ${targetId} — esperando 2s y reintentando una vez...`);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.safeSendMessage(to, content, options, shouldThrow, maxRetries); // ir directo al último intento
      }

      if (!isLidError && retryCount < maxRetries) {
        const delay = baseDelayMs * Math.pow(2, retryCount);
        this.logger.log(`🔄 Reintentando envío a ${targetId} en ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.safeSendMessage(to, content, options, shouldThrow, retryCount + 1);
      } else {
        this.logger.error(
          `💥 Todos los intentos de envío fallaron para ${targetId} en bot ${this.botId}.`
        );
        if (shouldThrow) {
          throw error;
        }
        return null;
      }
    }
  }

  private async getCanonicalId(msg: any): Promise<string> {
    const rawRemote =
      typeof msg.id.remote === "string"
        ? msg.id.remote
        : msg.id.remote._serialized;
    try {
      // Resolve the actual contact (phone number) from the chat ID (LID or Phone)
      const contact = await this.client?.getContactById(rawRemote);
      if (!contact) throw new Error(`Contact ${rawRemote} not found.`);
      
      // Preferir el número real si está disponible, evita fallos de enrutamiento al intentar enviar a un @lid
      if (contact.number) {
        return `${contact.number}@c.us`;
      }
      return this.normalizeToContactId(contact.id._serialized);
    } catch (e) {
      // Fallback to chat ID if contact resolution fails
      return this.normalizeToContactId(rawRemote);
    }
  }

  private static readonly IGNORED_MSG_TYPES = new Set([
    "e2e_notification",
    "notification_template",
    "call_log",
    "protocol",
    "notification",
    "gp2",
  ]);

  // ─── Outgoing Message Handler (Human Intervention Detection) ──────────────

  private async _handleOutgoingMessage(msg: any): Promise<void> {
    const remoteId = await this.getCanonicalId(msg);
    // this.logger.log(`Saliente (Canónico) - remoteId: ${remoteId}`);

    const config = this.configSvc.getConfig();
    const nowInSeconds = Math.floor(Date.now() / 1000);

    const remoteSession = await this.sessionMgr.getSession(remoteId);

    const isHistoryMatch = (() => {
      if (!remoteSession) return false;
      const sessionHistory = remoteSession.history;
      if (!sessionHistory || sessionHistory.length === 0) return false;
      const lastMsg = sessionHistory[sessionHistory.length - 1];
      if (!lastMsg) return false;
      return (
        lastMsg.role === "assistant" &&
        lastMsg.content.trim() === msg.body.trim()
      );
    })();

    const isRecentMatch = this.recentlySentMessages.has(msg.body.trim());

    // Si es un mensaje con media (imagen, doc, audio) y recientemente le enviamos un media al mismo chat
    if (msg.hasMedia && this.recentlySentMediaTo.has(remoteId)) {
      this.recentlySentMediaTo.delete(remoteId);
      return;
    }

    // Si coincide con algo enviado recientemente o con el historial, lo ignoramos (es el bot)
    if (isHistoryMatch || isRecentMatch) {
      this.recentlySentMessages.delete(msg.body.trim());
      // this.logger.log(`🤖 Mensaje saliente identificado como bot en ${remoteId} — omitiendo cambio a humano.`);
      return;
    }

    // Es un mensaje humano real. Actualizar o crear la sesión con estado "human".
    // this.logger.log(`👤 Intervención humana detectada en ${remoteId}. Cambiando estado a 'human'.`);
    if (remoteSession) {
      await this.sessionMgr.saveSession(remoteId, {
        ...remoteSession,
        last_interaction: nowInSeconds,
        status: "human",
        human_since: nowInSeconds,
      });
    } else {
      // No hay sesión previa: crear una nueva con estado humano para que si el
      // cliente responde luego, el bot sepa que ya hubo intervención humana.
      await this.sessionMgr.saveSession(remoteId, {
        contactName: "desconocido",
        last_interaction: nowInSeconds,
        status: "human",
        human_since: nowInSeconds,
        history: [],
      });
    }

    const pending = this.aggregationMap.get(remoteId);
    if (pending) {
      this.logger.log(`🛑 Cancelando respuesta programada para ${remoteId} por intervención humana.`);
      if (pending.timer) clearTimeout(pending.timer);
      this.aggregationMap.delete(remoteId);
    }
  }

  // ─── Incoming Message Handler (Aggregator) ──────────────────────────────

  private async _handleMessage(msg: any): Promise<void> {
    try {
      if (msg.timestamp * 1000 < this.bootTime) return;
      if (msg.type && BotInstance.IGNORED_MSG_TYPES.has(msg.type)) return;
      if (msg.from === "status@broadcast" || msg.from.includes("@g.us")) return;

      const from = await this.getCanonicalId(msg);
      if (!msg.fromMe) {
        this.logger.logMessage(from, msg.body || `[${msg.type}]`);
        // this.logger.log(`📥 Mensaje entrante de ${from}: ${msg.body || `[${msg.type}]`}`);
      }
      const msgId = msg.id?._serialized || msg.id?.id;

      if (this.processedMsgIds.has(msgId)) return;
      this.processedMsgIds.add(msgId);
      setTimeout(() => this.processedMsgIds.delete(msgId), 30000);

      if (msg.fromMe) {
        await this._handleOutgoingMessage(msg);
        return;
      }

      const config = this.configSvc.getConfig();
      if (config.isAutoResponseEnabled === false) return;

      let pending = this.aggregationMap.get(from);
      if (!pending) {
        pending = {
          timer: setTimeout(
            () => this._triggerAggregation(from),
            this.DEBOUNCE_MS,
          ),
          rawMessages: [msg],
        };
        this.aggregationMap.set(from, pending);
      } else {
        // Si ya se está procesando en la IA, no reiniciamos el timer de esa instancia,
        // pero acumulamos los mensajes para que se procesen después o se ignoren si ya terminó.
        pending.rawMessages.push(msg);

        // Solo reiniciamos el timer si NO se está procesando actualmente en la IA
        if (!pending.isProcessing) {
          clearTimeout(pending.timer);
          pending.timer = setTimeout(
            () => this._triggerAggregation(from),
            this.DEBOUNCE_MS,
          );
        } else {
          // Si lleva procesando más de 5 minutos, probablemente algo falló. 
          // Reseteamos el estado para este usuario.
          const lastUpdate = (pending as any).lastProcessingUpdate || Date.now();
          if (Date.now() - lastUpdate > 25000) { // 25 segundos
             this.logger.warn(`⚠️ Detectado posible cuelgue en procesamiento para ${from}. Reiniciando estado.`);
             pending.isProcessing = false;
             this._triggerAggregation(from);
          }
        }
      }
    } catch (err) {
      this.logger.error(`Error crítico en _handleMessage:`, err);
    }
  }

  private async _triggerAggregation(from: string) {
    const pending = this.aggregationMap.get(from);
    if (!pending) return;

    // Marcar como procesando en lugar de borrar inmediatamente
    pending.isProcessing = true;
    (pending as any).lastProcessingUpdate = Date.now();

    try {
      // this.logger.log(`[Agregación] Procesando ${pending.rawMessages.length} mensajes para ${from}...`);
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const config = this.configSvc.getConfig();
      // sys: reads named system messages stored in respuestas_info with key prefix "sys_"
      // (kept as a helper for backward compatibility; returns empty string if not found)
      const sys = (key: string): string =>
        (config.respuestas_info as any)[`sys_${key}`]?.texto ?? "";

      // 1. Obtener datos de sesión y contacto de forma segura
      // IMPORTANTE: Limpiamos rawMessages ANTES del primer await para evitar que
      // mensajes que lleguen durante el procesamiento se dupliquen si hay un error.
      const snapshotMessages = [...pending.rawMessages];
      pending.rawMessages = [];

      const firstMsg = snapshotMessages[0];

      // Obtener contacto con fallback seguro si getContact() falla (ej: IDs @lid inestables)
      let contact: any;
      let realFrom = from;
      try {
        contact = await firstMsg.getContact();
      } catch (contactErr) {
        this.logger.error(
          `Error obteniendo contacto para ${from}, usando fallback:`,
          contactErr,
        );
        contact = null;
      }

      let session = await this.sessionMgr.getSession(realFrom);
      const nombre = contact?.pushname || "amigo";
      let instruccionExtra = "";

      // 2. Manejo de Sesión Nueva / Recontacto
      if (!session) {
        await this.sessionMgr.saveSession(realFrom, {
          contactName: nombre,
          last_interaction: nowInSeconds,
          status: "bot",
          history: [],
        });
        session = (await this.sessionMgr.getSession(realFrom))!;
        const welcomeTemplate = sys("saludoInicial");
        if (welcomeTemplate) {
          instruccionExtra = `Saluda cálidamente a ${nombre} usando: "${welcomeTemplate.replace(/\{name\}/g, nombre)}".`;
        }
      } else if (
        nowInSeconds - session.last_interaction >
        this.sessionMgr.TWENTY_FOUR_HOURS
      ) {
        // El usuario regresa después de 24h: resetear historial y estado
        // IMPORTANTE: Guardar en Firestore aquí para que human_since quede limpio
        // y no afecte a este ciclo si el bot se reiniciara durante el proceso.
        session.history = [];
        session.status = "bot";
        session.human_since = undefined;
        await this.sessionMgr.saveSession(realFrom, session);
        const recontactTemplate = sys("saludoRecontacto");
        if (recontactTemplate) {
          instruccionExtra = `Saluda nuevamente usando: "${recontactTemplate.replace(/\{name\}/g, nombre)}".`;
        }
      }

      // 3. Respetar Estado de Intervención Humana
      if (session.status === "human") {
        const humanSince = session.human_since || 0;
        if (
          nowInSeconds - humanSince >=
          this.sessionMgr.AUTO_REACTIVATE_SECONDS
        ) {
          session.status = "bot";
          await this.sessionMgr.saveSession(realFrom, session);
          const reactivacionMsg = sys("botReactivado");
          if (reactivacionMsg) {
            this.addRecentSent(reactivacionMsg.trim());
            await firstMsg.reply(reactivacionMsg);
          }
        } else {
          return;
        }
      }

      // 4. Procesar todos los mensajes del snapshot
      const resolvedContents: string[] = [];
      for (const msg of snapshotMessages) {
        const content = await this._resolveMessageContent(msg, session, sys);
        if (content) resolvedContents.push(content);
      }

      if (resolvedContents.length === 0) return;

      // 5. Consolidar texto y enviar a IA
      const fullText = resolvedContents.join("\n");
      this.sessionMgr.appendToHistory(session, "user", fullText);

      // Load per-bot notification triggers (configurable by owner)
      const motivosNotificacion: string[] = Array.isArray(
        (config as any).motivosNotificacion,
      )
        ? (config as any).motivosNotificacion
        : [];

      let respuesta = await generarRespuestaBot(
        session.history,
        this.configSvc.getNombre(),
        config.respuestas_info,
        instruccionExtra,
        config.prompt_ia,
        config.timezone,
        motivosNotificacion,
        config.muevelappMcpEnabled,
        realFrom.split('@')[0]
      );

      // 6. Verificar estado humano ANTES de finalizar (puede haber cambiado durante la generación IA)
      const currentStatus =
        await this.sessionMgr.getStatusFromFirestore(realFrom);
      if (currentStatus === "human") {
        this.logger.log(`👤 Abortando respuesta IA en ${realFrom} (Intervención humana detectada durante generación).`);
        // Limpiar el mensaje del usuario del historial para no contaminar la siguiente consulta IA
        if (
          session.history.length > 0 &&
          session.history[session.history.length - 1]?.role === "user"
        ) {
          session.history.pop();
        }
        return;
      }

      await this._finalizeResponse(
        realFrom,
        nombre,
        session,
        respuesta,
        fullText,
        config,
      );
      await this.statsMgr.saveStats();
    } catch (err) {
      this.logger.error(`Error en agregación (${from}):`, err);
    } finally {
      pending.isProcessing = false;

      // Si llegaron nuevos mensajes mientras procesábamos, re-enviamos la agregación
      if (pending.rawMessages.length > 0) {
        this.logger.log(`🔄 Re-programando agregación para ${from} (nuevos mensajes durante proceso).`);
        pending.timer = setTimeout(
          () => this._triggerAggregation(from),
          this.DEBOUNCE_MS,
        );
      } else {
        this.aggregationMap.delete(from);
      }
    }
  }

  private async _resolveMessageContent(
    msg: any,
    session: any,
    sys: (k: string) => string,
  ): Promise<string | null> {
    // 📍 Detectar y procesar ubicación enviada por WhatsApp (Soporte robusto y resiliente)
    if (msg.type === "location" || msg.type === "liveLocation" || msg.location || msg._data?.lat) {
      console.log(`[📍 DETECTOR UBICACIÓN] msg.type: "${msg.type}", hasMedia: ${msg.hasMedia}`);
      console.log(`[📍 DETECTOR UBICACIÓN] msg.location:`, msg.location);
      console.log(`[📍 DETECTOR UBICACIÓN] msg._data:`, msg._data ? JSON.stringify(msg._data).substring(0, 500) : "undefined");

      const lat = msg.location?.latitude || msg._data?.lat || msg.lat;
      const lng = msg.location?.longitude || msg._data?.lng || msg.lng;

      if (lat && lng) {
        this.logger.log(`📍 Ubicación de WhatsApp procesada con éxito: Lat: ${lat}, Lng: ${lng}`);
        return `https://maps.google.com/?q=${lat},${lng}`;
      } else {
        this.logger.error(`❌ Mensaje recibido como ubicación pero no se pudieron extraer las coordenadas lat/lng.`);
      }
    }

    const isMedia =
      msg.hasMedia ||
      ["image", "video", "audio", "ptt", "sticker", "document", "gif"].includes(
        msg.type,
      );

    if (isMedia && (msg.type === "audio" || msg.type === "ptt")) {
      // ⚠️ IMPORTANTE: Validar status BOT antes de proceder con respuestas automáticas de media
      if (session.status !== "bot") return "[Envió audio]";

      const botDoc = await db.collection("bots").doc(this.botId).get();
      const botData = botDoc.data() ?? {};
      const openaiApiKey = (botData.openaiApiKey as string) || "";
      if (!botData.audioAnalysisEnabled || !openaiApiKey)
        return "[Envió audio]";

      // 🛑 Gate by Subscription Plan
      const subContext = await subscriptionService.getBotSubscriptionContext(
        this.botId,
      );
      if (!subContext.plan.features.audioTranscription) {
        const warning =
          "Mi administrador no me tiene permitido escuchar audios de voz en este momento. Por favor, escríbeme por texto. 📝";
        this.addRecentSent(warning);
        await msg.reply(warning);
        return "[Envió audio (Bloqueado por suscripción)]";
      }

      const listeningRes = "Dame un momento mientras escucho tu audio... 🎧";
      this.addRecentSent(listeningRes);
      await msg.reply(listeningRes);

      const transcription = await this._transcribeAudio(msg, openaiApiKey);
      return transcription ? transcription : "[Audio sin transcripción]";
    }

    if (isMedia) {
      const labels: any = {
        image: "imagen",
        sticker: "sticker",
        video: "video",
      };
      return `[Envió ${labels[msg.type] || msg.type}]`;
    }

    return msg.body || "";
  }

  private async _finalizeResponse(
    from: string,
    nombre: string,
    session: any,
    respuesta: string,
    fullText: string,
    config: any,
  ) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const sys = (key: string): string =>
      (config.respuestas_info as any)[`sys_${key}`]?.texto ?? "";
    const { MessageMedia } = await import("whatsapp-web.js");

    if (respuesta.includes("[NO_ENTENDI]")) {
      this.logger.log(`❓ La IA no entendió el mensaje de ${from}. Registrando en No Entendidos.`);
      respuesta = respuesta.replace("[NO_ENTENDI]", "").trim();
      await this.configSvc.registrarNoEntendido(fullText, from, nombre);
    }

    if (respuesta.includes("[HABLAR_CON_HUMANO]")) {
      this.logger.log(`🚨 Intervención humana detectada por IA para ${nombre}. Respuesta IA: "${respuesta}"`);
      respuesta = respuesta.replace("[HABLAR_CON_HUMANO]", "").trim();
      respuesta = `${respuesta}\n\n${sys("agenteAviso")}`;
      session.status = "human";
      session.human_since = nowInSeconds;
      await this.sessionMgr.saveSession(from, session);
      const phoneNumber = from.replace(/\D/g, "").slice(0, 12);
      const wid = this.client?.info?.wid?._serialized;
      if (wid) {
        await this.safeSendMessage(
          wid,
          `📢 Un humano debe intervenir con ${nombre} (${phoneNumber})!`,
          undefined,
          false
        );
      } else {
        this.logger.error(`❌ No se pudo enviar alerta de intervención humana: client.info.wid no disponible para bot ${this.botId}`);
      }
    }

    this.statsMgr.incrementarMensajesRespondidos();
    this.sessionMgr.appendToHistory(session, "assistant", respuesta);

    // 6. Verificar estado humano FINAL antes de enviar (crucial para evitar race conditions)
    // Recargamos la sesión completa para no sobreescribir con datos viejos de memoria
    const latestSession = await this.sessionMgr.getSession(from);
    if (!latestSession || latestSession.status === "human") {
      this.logger.log(`👤 Abortando envío final en ${from} (Intervención humana confirmada tras recarga).`);
      return;
    }

    // Actualizamos solo el historial en la sesión fresca
    latestSession.history = session.history;
    latestSession.last_interaction = Math.floor(Date.now() / 1000);

    // Guardamos la sesión actualizada (status sigue siendo bot)
    await this.sessionMgr.saveSession(from, latestSession);

    // 7. Enviar la respuesta física
    // Extract and parse [URL_IMAGEN: ...] tags
    const imageMatches = [
      ...respuesta.matchAll(
        /\[URL_IMAGEN:\s*"?\s*(https?:\/\/[^\]"\s]+)\s*"?\s*\]/gi,
      ),
    ];
    const imageUrls = imageMatches.map((m) => m[1] as string);

    // Remove the tags from the final text
    respuesta = respuesta.replace(/\[URL_IMAGEN:[^\]]+\]/gi, "").trim();

    if (respuesta) {
      this.addRecentSent(respuesta);
      await this.safeSendMessage(from, respuesta, undefined, false);
    }

    // Send images one by one if there are any
    for (const url of imageUrls) {
      try {
        const safeFrom = this.normalizeToContactId(from);
        this.addRecentMediaSent(safeFrom);
        const media = await this._fetchMediaFromUrl(url);
        await this.safeSendMessage(from, media, undefined, false);
      } catch (err: any) {
        this.logger.error(`Advertencia: No se pudo enviar la imagen extraída. URL: ${url} - Motivo: ${err.message || 'Error desconocido'}`);
      }
    }
  }

  private async _fetchMediaFromUrl(url: string): Promise<pkg.MessageMedia> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }
      
      let mimetype = response.headers.get("content-type") || "image/jpeg";
      
      // Validar que no sea una respuesta de error en JSON o HTML que el servidor haya devuelto con un status 200
      if (mimetype.includes("application/json") || mimetype.includes("text/html") || mimetype.includes("text/plain")) {
        throw new Error(`El archivo no es multimedia válido (Mime: ${mimetype})`);
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (arrayBuffer.byteLength < 100) {
        throw new Error("El archivo descargado es demasiado pequeño o está corrupto.");
      }

      const buffer = Buffer.from(arrayBuffer);
      const base64 = buffer.toString("base64");

      if (mimetype.includes("application/octet-stream")) {
        const ext = url.split(".").pop()?.split("?")[0]?.toLowerCase();
        if (ext === "jpg" || ext === "jpeg") mimetype = "image/jpeg";
        else if (ext === "png") mimetype = "image/png";
        else if (ext === "mp4") mimetype = "video/mp4";
        else if (ext === "pdf") mimetype = "application/pdf";
      }

      const filename = url.split("/").pop()?.split("?")[0] || "media_file";
      return new pkg.MessageMedia(mimetype, base64, filename);
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private async _transcribeAudio(
    msg: any,
    openaiApiKey: string,
  ): Promise<string | null> {
    const tempFilePath = path.join(
      TEMP_AUDIO_DIR,
      `temp_${this.botId}_${Date.now()}.ogg`,
    );
    try {
      const media = await msg.downloadMedia();
      if (!media) return null;
       await fs.promises.writeFile(tempFilePath, media.data, {
        encoding: "base64",
      });
      const openai = new OpenAI({ apiKey: openaiApiKey, timeout: 45000 });
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: "whisper-1",
        language: "es",
      });
      return transcription.text || null;
    } catch (error: any) {
      this.logger.error(`Error Whisper:`, error.message);
      return null;
    } finally {
      try {
        await fs.promises.access(tempFilePath);
        await fs.promises.unlink(tempFilePath);
      } catch (e) {
        // Ignorar error si el archivo no existe o no se puede borrar
      }
    }
  }
}
