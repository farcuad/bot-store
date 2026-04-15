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
  private recentlySentMessages = new Set<string>();

  // ── Aggregation state ──────────────────────────────────────────────────────
  private aggregationMap = new Map<string, {
    timer: NodeJS.Timeout;
    rawMessages: any[];
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

  async start(): Promise<void> {
    if (
      this.state.status === "initializing" ||
      this.state.status === "qr" ||
      this.state.status === "ready"
    ) {
      console.log(
        `[${this.botId}] Ya en ejecución (${this.state.status}) — omitiendo inicio duplicado.`,
      );
      return;
    }

    this.setState({ status: "initializing", qr: null, lastError: null });
    console.log(`[${this.botId}] 🚀 Iniciando instancia del bot…`);

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
      console.log(`[${this.botId}] ✅ Bot listo y operativo.`);
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
    const remoteId = msg.to;
    const config = this.configSvc.getConfig();
    const nowInSeconds = Math.floor(Date.now() / 1000);

    const remoteSession = await this.sessionMgr.getSession(remoteId);
    if (!remoteSession) return;

    const sessionHistory = remoteSession.history;

    const isHistoryMatch = (() => {
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
      ...Object.values(config.respuestas_sistema).map((r) => r.texto),
      "📢 Contestale al usuario",
    ];

    const isRecentMatch = this.recentlySentMessages.has(msg.body.trim());
    const isConfigMatch = botTexts.some((texto) => {
      if (!texto) return false;
      return msg.body.includes(texto.trim().slice(0, 25));
    });

    if (isHistoryMatch || isConfigMatch || isRecentMatch) {
      this.recentlySentMessages.delete(msg.body.trim());
      return;
    }

    await this.sessionMgr.saveSession(remoteId, {
      ...remoteSession,
      last_interaction: nowInSeconds,
      status: "human",
      human_since: nowInSeconds,
    });
    console.log(`[${this.botId}] 👤 Intervención humana detectada en ${remoteId}.`);
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
        console.log(`[${this.botId}] 📥 Iniciando agregación para ${from}...`);
      } else {
        clearTimeout(pending.timer);
        pending.rawMessages.push(msg);
        pending.timer = setTimeout(() => this._triggerAggregation(from), this.DEBOUNCE_MS);
      }
    } catch (err) {
      console.error(`[${this.botId}] ❌ Error crítico en _handleMessage:`, err);
    }
  }

  private async _triggerAggregation(from: string) {
    const pending = this.aggregationMap.get(from);
    if (!pending) return;
    this.aggregationMap.delete(from);

    try {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const config = this.configSvc.getConfig();
      const sys = (key: string): string => config.respuestas_sistema[key]?.texto ?? "";

      // 1. Obtener datos de sesión y contacto de forma segura
      let session = await this.sessionMgr.getSession(from);
      const firstMsg = pending.rawMessages[0];
      const contact = await firstMsg.getContact();
      const nombre = contact.pushname || "amigo";
      let instruccionExtra = "";

      // 2. Manejo de Sesión Nueva / Recontacto
      if (!session) {
        await this.sessionMgr.saveSession(from, {
          contactName: nombre,
          last_interaction: nowInSeconds,
          status: "bot",
          history: [],
        });
        session = (await this.sessionMgr.getSession(from))!;
        const welcomeTemplate = sys("saludoInicial");
        if (welcomeTemplate) {
          instruccionExtra = `Saluda cálidamente a ${nombre} usando: "${welcomeTemplate.replace(/\{name\}/g, nombre)}".`;
        }
      } else if (nowInSeconds - session.last_interaction > this.sessionMgr.TWENTY_FOUR_HOURS) {
        session.history = [];
        session.status = "bot";
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
          await this.sessionMgr.saveSession(from, session);
          const reactivacionMsg = sys("botReactivado");
          if (reactivacionMsg) {
            this.recentlySentMessages.add(reactivacionMsg.trim());
            await firstMsg.reply(reactivacionMsg);
          }
        } else {
          console.log(`[${this.botId}] 👤 Ignorando ráfaga en ${from} (Estado Humano).`);
          return;
        }
      }

      // 4. Procesar todos los mensajes acumulados
      const resolvedContents: string[] = [];
      for (const msg of pending.rawMessages) {
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
        config.prompt_ia
      );

      // 6. Finalizar respuesta (Validando estado humano nuevamente)
      const currentStatus = await this.sessionMgr.getStatusFromFirestore(from);
      if (currentStatus === "human") {
        console.log(`[${this.botId}] 👤 Abortando respuesta IA en ${from} (Intervención humana detectada durante generación).`);
        return;
      }

      await this._finalizeResponse(from, nombre, session, respuesta, fullText, config);
      await this.statsMgr.saveStats();

    } catch (err) {
      console.error(`[${this.botId}] ❌ Error en agregación (${from}):`, err);
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

      const listeningRes = "Dame un momento mientras escucho tu audio... 🎧";
      this.recentlySentMessages.add(listeningRes);
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
    const sys = (key: string): string => config.respuestas_sistema[key]?.texto ?? "";

    if (respuesta.includes("[NO_ENTENDI]")) {
      respuesta = respuesta.replace("[NO_ENTENDI]", "").trim();
      await this.configSvc.registrarNoEntendido(fullText, from, nombre);
    }

    if (respuesta.includes("[HABLAR_CON_HUMANO]")) {
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
      console.log(`[${this.botId}] 👤 No se sobreescribe estado humano en ${from}.`);
      // Aún así guardamos la historia en memoria si es necesario, pero saveSession ya lo hace.
      // Sin embargo, queremos evitar que el "status: bot" de 'session' machaque el "human" de Firestore.
    }

    if (respuesta.trim()) {
      this.recentlySentMessages.add(respuesta.trim());
      await this.client?.sendMessage(from, respuesta);
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
      console.error(`[${this.botId}] ❌ Error Whisper:`, error.message);
      return null;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        try { fs.unlinkSync(tempFilePath); } catch (e) {}
      }
    }
  }
}
