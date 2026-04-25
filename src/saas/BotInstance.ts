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
  private aggregationMap = new Map<string, {
    timer: NodeJS.Timeout;
    rawMessages: any[];
    isProcessing?: boolean;
  }>();
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
  }

  async start(): Promise<void> {
    if (
      this.state.status === "initializing" ||
      this.state.status === "qr" ||
      this.state.status === "ready"
    ) {
      this.logger.log(`Ya en ejecución (${this.state.status}) — omitiendo inicio duplicado.`);
      return;
    }

    this.setState({ status: "initializing", qr: null, lastError: null });
    this.logger.log(`🚀 Iniciando instancia del bot…`);

    const dataPath = path.join(BOTS_ROOT, this.botId);

    const { promises: fsp } = await import("node:fs");
    const sessionDir = path.join(dataPath, `session-${this.botId}`);
    // El archivo lock se deja para que el SO gestione la exclusión mutua
    // y evitar que múltiples procesos accidentales usen la misma sesión.

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
    this.configSvc.startConfigRefresh();
    await this.statsMgr.loadStats();

    this.client.on("qr", (qr: string) => {
      this.setState({ status: "qr", qr });
      this.emit("qr", qr);
    });

    this.client.on("ready", () => {
      this.logger.log(`✅ Bot listo y operativo.`);
      this.setState({ status: "ready", qr: null, readySince: Date.now() });
      this.emit("ready");
    });

    this.client.on("disconnected", (reason: string) => {
      this.setState({ status: "disconnected", qr: null });
      this.emit("disconnected", reason);
    });

    this.client.on("auth_failure", (msg: string) => {
      this.setState({ status: "error", lastError: msg });
    });

    this.client.on("message_create", (msg: any) => {
      this._handleMessage(msg);
    });

    this.client.initialize();
  }

  async stop(): Promise<void> {
    if (!this.client) return;
    try {
      await this.client.destroy();
    } catch (e) {}
    this.client = null;
    this.configSvc.stopConfigRefresh();
    this.setState({ status: "idle", qr: null });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async sendMessage(to: string, message: string): Promise<void> {
    if (!this.client || this.state.status !== "ready") {
      throw new Error(`Bot ${this.botId} is not ready.`);
    }
    const chatId = to.includes("@c.us") ? to : `${to.replace(/\D/g, "")}@c.us`;
    await this.client.sendMessage(chatId, message);
  }

  async sendImage(to: string, source: string, caption?: string): Promise<void> {
    if (!this.client || this.state.status !== "ready") {
      throw new Error(`Bot ${this.botId} is not ready.`);
    }
    const chatId = to.includes("@c.us") ? to : `${to.replace(/\D/g, "")}@c.us`;
    let media: pkg.MessageMedia;
    if (source.startsWith("http")) {
      media = await pkg.MessageMedia.fromUrl(source);
    } else {
      media = pkg.MessageMedia.fromFilePath(source);
    }
    const options = caption ? { caption } : {};
    await this.client.sendMessage(chatId, media, options);
  }

  // ── Generic chat methods (contacts + groups) ────────────────────────────────

  /**
   * Send a text message to any pre-normalized chatId (@c.us or @g.us).
   */
  async sendMessageToChat(chatId: string, message: string): Promise<void> {
    if (!this.client || this.state.status !== "ready") {
      throw new Error(`Bot ${this.botId} is not ready.`);
    }
    await this.client.sendMessage(chatId, message);
  }

  /**
   * Send a media message (from URL or file path) to any pre-normalized chatId.
   */
  async sendMediaToChat(chatId: string, source: string, caption?: string): Promise<void> {
    if (!this.client || this.state.status !== "ready") {
      throw new Error(`Bot ${this.botId} is not ready.`);
    }
    let media: pkg.MessageMedia;
    if (source.startsWith("http")) {
      media = await pkg.MessageMedia.fromUrl(source);
    } else {
      media = pkg.MessageMedia.fromFilePath(source);
    }
    const options = caption ? { caption } : {};
    await this.client.sendMessage(chatId, media, options);
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
    // Remove domain part (@c.us, @lid, etc)
    const number = withoutDevice.split("@")[0];
    return `${number}@c.us`;
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
    const rawTo = typeof msg.to === "string" ? msg.to : msg.to._serialized;
    const remoteId = rawTo.split(':')[0].split('@')[0] + "@c.us";

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

    const botTexts = [
      ...Object.values(config.respuestas_info).map((r) => r.texto),
      "📢 Contéstale al usuario",
    ];

    const isRecentMatch = this.recentlySentMessages.has(msg.body.trim());
    const isConfigMatch = botTexts.some((texto) => {
      if (!texto) return false;
      return msg.body.includes(texto.trim().slice(0, 25));
    });

    // Si es un mensaje con media (imagen, doc, audio) y recientemente le enviamos un media al mismo chat
    if (msg.hasMedia && this.recentlySentMediaTo.has(remoteId)) {
      this.recentlySentMediaTo.delete(remoteId);
      return;
    }

    if (isHistoryMatch || isConfigMatch || isRecentMatch) {
      this.recentlySentMessages.delete(msg.body.trim());
      return;
    }

    // Es un mensaje humano real. Actualizar o crear la sesión con estado "human".
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

    // Cancelar cualquier agregación pendiente si el humano respondió
    const pending = this.aggregationMap.get(remoteId);
    if (pending) {
      if (pending.timer) clearTimeout(pending.timer);
      this.aggregationMap.delete(remoteId);
      this.logger.log(`🛑 Agregación cancelada en ${remoteId} por intervención humana.`);
    }

    this.logger.log(`👤 Intervención humana detectada en ${remoteId}.`);
  }

  // ─── Incoming Message Handler (Aggregator) ──────────────────────────────

  private _handleMessage(msg: any): void {
    try {
      if (msg.timestamp * 1000 < this.bootTime) return;
      if (msg.type && BotInstance.IGNORED_MSG_TYPES.has(msg.type)) return;
      if (msg.from === "status@broadcast" || msg.from.includes("@g.us")) return;

      const from = typeof msg.from === "string" ? msg.from : msg.from._serialized;
      const msgId = msg.id?._serialized || msg.id?.id;

      if (this.processedMsgIds.has(msgId)) return;
      this.processedMsgIds.add(msgId);
      setTimeout(() => this.processedMsgIds.delete(msgId), 30000);

      if (msg.fromMe) {
        this._handleOutgoingMessage(msg).catch(() => {});
        return;
      }

      const config = this.configSvc.getConfig();
      if (config.isAutoResponseEnabled === false) return;

      let pending = this.aggregationMap.get(from);
      if (!pending) {
        pending = {
          timer: setTimeout(() => this._triggerAggregation(from), this.DEBOUNCE_MS),
          rawMessages: [msg],
        };
        this.aggregationMap.set(from, pending);
        this.logger.log(`📥 Iniciando agregación para ${from}...`);
      } else {
        // Si ya se está procesando en la IA, no reiniciamos el timer de esa instancia,
        // pero acumulamos los mensajes para que se procesen después o se ignoren si ya terminó.
        pending.rawMessages.push(msg);

        // Solo reiniciamos el timer si NO se está procesando actualmente en la IA
        if (!pending.isProcessing) {
          clearTimeout(pending.timer);
          pending.timer = setTimeout(() => this._triggerAggregation(from), this.DEBOUNCE_MS);
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

    try {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const config = this.configSvc.getConfig();
      // sys: reads named system messages stored in respuestas_info with key prefix "sys_"
      // (kept as a helper for backward compatibility; returns empty string if not found)
      const sys = (key: string): string => (config.respuestas_info as any)[`sys_${key}`]?.texto ?? "";

      // 1. Obtener datos de sesión y contacto de forma segura
      // IMPORTANTE: Limpiamos rawMessages ANTES del primer await para evitar que
      // mensajes que lleguen durante el procesamiento se dupliquen si hay un error.
      const snapshotMessages = [...pending.rawMessages];
      pending.rawMessages = [];

      const firstMsg = snapshotMessages[0];
      
      // Obtener contacto con fallback seguro si getContact() falla (ej: IDs @lid inestables)
      let contact: any;
      let realFrom: string;
      try {
        contact = await firstMsg.getContact();
        realFrom = contact.id._serialized;
        // Siempre normalizar a @c.us para garantizar compatibilidad con sendMessage
        realFrom = this.normalizeToContactId(realFrom);
      } catch (contactErr) {
        // Fallback: usar el `from` original normalizado a @c.us
        this.logger.error(`Error obteniendo contacto para ${from}, usando fallback:`, contactErr);
        contact = null;
        realFrom = this.normalizeToContactId(from);
      }

      // Log del mensaje entrante
      const incomingText = snapshotMessages
        .map((m: any) => m.body || `[${m.type}]`)
        .join(" | ");
      this.logger.logMessage(realFrom, incomingText);

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
      } else if (nowInSeconds - session.last_interaction > this.sessionMgr.TWENTY_FOUR_HOURS) {
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
        if (nowInSeconds - humanSince >= this.sessionMgr.AUTO_REACTIVATE_SECONDS) {
          session.status = "bot";
          await this.sessionMgr.saveSession(realFrom, session);
          const reactivacionMsg = sys("botReactivado");
          if (reactivacionMsg) {
            this.addRecentSent(reactivacionMsg.trim());
            await firstMsg.reply(reactivacionMsg);
          }
        } else {
          this.logger.log(`👤 Ignorando ráfaga en ${realFrom} (Estado Humano).`);
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

      let respuesta = await generarRespuestaBot(
        session.history,
        this.configSvc.getNombre(),
        config.respuestas_info,
        instruccionExtra,
        config.prompt_ia,
        config.timezone
      );

      // 6. Verificar estado humano ANTES de finalizar (puede haber cambiado durante la generación IA)
      const currentStatus = await this.sessionMgr.getStatusFromFirestore(realFrom);
      if (currentStatus === "human") {
        this.logger.log(`👤 Abortando respuesta IA en ${realFrom} (Intervención humana detectada durante generación).`);
        // Limpiar el mensaje del usuario del historial para no contaminar la siguiente consulta IA
        if (session.history.length > 0 && session.history[session.history.length - 1]?.role === "user") {
          session.history.pop();
        }
        return;
      }

      await this._finalizeResponse(realFrom, nombre, session, respuesta, fullText, config);
      await this.statsMgr.saveStats();

    } catch (err) {
      this.logger.error(`Error en agregación (${from}):`, err);
    } finally {
      pending.isProcessing = false;
      
      // Si llegaron nuevos mensajes mientras procesábamos, re-enviamos la agregación
      if (pending.rawMessages.length > 0) {
        this.logger.log(`🔄 Re-programando agregación para ${from} (nuevos mensajes durante proceso).`);
        pending.timer = setTimeout(() => this._triggerAggregation(from), this.DEBOUNCE_MS);
      } else {
        this.aggregationMap.delete(from);
      }
    }
  }

  private async _resolveMessageContent(msg: any, session: any, sys: (k: string) => string): Promise<string | null> {
    const isMedia = msg.hasMedia || ["image", "video", "audio", "ptt", "sticker", "document", "gif"].includes(msg.type);

    if (isMedia && (msg.type === "audio" || msg.type === "ptt")) {
      // ⚠️ IMPORTANTE: Validar status BOT antes de proceder con respuestas automáticas de media
      if (session.status !== "bot") return "[Envió audio]";

      const botDoc = await db.collection("bots").doc(this.botId).get();
      const botData = botDoc.data() ?? {};
      const openaiApiKey = (botData.openaiApiKey as string) || "";
      if (!botData.audioAnalysisEnabled || !openaiApiKey) return "[Envió audio]";

      // 🛑 Gate by Subscription Plan
      const subContext = await subscriptionService.getBotSubscriptionContext(this.botId);
      if (!subContext.plan.features.audioTranscription) {
        const warning = "Mi administrador no me tiene permitido escuchar audios de voz en este momento. Por favor, escríbeme por texto. 📝";
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
      const labels: any = { image: "imagen", sticker: "sticker", video: "video" };
      return `[Envió ${labels[msg.type] || msg.type}]`;
    }

    return msg.body || "";
  }

  private async _finalizeResponse(from: string, nombre: string, session: any, respuesta: string, fullText: string, config: any) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const sys = (key: string): string => (config.respuestas_info as any)[`sys_${key}`]?.texto ?? "";
    const { MessageMedia } = await import("whatsapp-web.js");

    if (respuesta.includes("[NO_ENTENDI]")) {
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
      await this.client?.sendMessage(this.client.info.wid._serialized, `📢 Un humano debe intervenir con ${nombre} (${phoneNumber})!`);
    }

    this.statsMgr.incrementarMensajesRespondidos();
    this.sessionMgr.appendToHistory(session, "assistant", respuesta);
    
    // Solo guardamos si el estado sigue siendo bot para no sobreescribir intervenciones humanas
    const currentStatus = await this.sessionMgr.getStatusFromFirestore(from);
    if (currentStatus === "bot") {
      await this.sessionMgr.saveSession(from, session);
    } else {
      this.logger.log(`👤 No se sobreescribe estado humano en ${from}.`);
    }

    // Extract and parse [URL_IMAGEN: ...] tags
    const imageMatches = [...respuesta.matchAll(/\[URL_IMAGEN:\s*"?\s*(https?:\/\/[^\]"\s]+)\s*"?\s*\]/gi)];
    const imageUrls = imageMatches.map(m => m[1] as string);
    
    // Remove the tags from the final text
    respuesta = respuesta.replace(/\[URL_IMAGEN:[^\]]+\]/gi, "").trim();

    if (respuesta) {
      this.addRecentSent(respuesta);
      // Normalizar siempre el destino a @c.us para evitar errores con IDs @lid
      const safeFrom = this.normalizeToContactId(from);
      await this.client?.sendMessage(safeFrom, respuesta);
    }

    // Send images one by one if there are any
    for (const url of imageUrls) {
      try {
        const safeFrom = this.normalizeToContactId(from);
        this.addRecentMediaSent(safeFrom);
        const media = await pkg.MessageMedia.fromUrl(url, { unsafeMime: true });
        await this.client?.sendMessage(safeFrom, media);
      } catch (err) {
        this.logger.error(`Error enviando imagen extraída (${url}):`, err);
      }
    }
  }

  private async _transcribeAudio(msg: any, openaiApiKey: string): Promise<string | null> {
    const tempFilePath = path.join(TEMP_AUDIO_DIR, `temp_${this.botId}_${Date.now()}.ogg`);
    try {
      const media = await msg.downloadMedia();
      if (!media) return null;
      fs.writeFileSync(tempFilePath, media.data, { encoding: "base64" });
      const openai = new OpenAI({ apiKey: openaiApiKey });
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
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
    }
  }
}
