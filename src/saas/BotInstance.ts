import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
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
  private client: InstanceType<typeof Client> | null = null;
  private state: BotInstanceState;
  private bootTime = 0;

  // Scoped services
  private sessionMgr: ReturnType<typeof createSessionManager>;
  private configSvc: ReturnType<typeof createConfigService>;
  private statsMgr: ReturnType<typeof createStatsManager>;
  private recentlySentMessages = new Set<string>();

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

  getClient(): InstanceType<typeof Client> | null {
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
        `[${this.botId}] Already running (${this.state.status}) — skipping duplicate start.`,
      );
      return;
    }

    this.setState({ status: "initializing", qr: null, lastError: null });
    console.log(`[${this.botId}] 🚀 Starting bot instance…`);

    const dataPath = path.join(BOTS_ROOT, this.botId);

    // ── Clean up stale Chrome lock files left by an abrupt process kill ────────
    const { promises: fsp } = await import("node:fs");
    const sessionDir = path.join(dataPath, `session-${this.botId}`);
    const lockFile = path.join(sessionDir, "SingletonLock");
    try {
      await fsp.unlink(lockFile);
      console.log(`[${this.botId}] 🔓 Removed stale ChromeSingletonLock.`);
    } catch {
      // No lock file
    }
    // ──────────────────────────────────────────────────────────────────────────

    this.client = new Client({
      qrMaxRetries: 2,
      authStrategy: new LocalAuth({
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
      console.log(`[${this.botId}] 📱 QR code received`);
      this.setState({ status: "qr", qr });
      this.emit("qr", qr);
    });

    this.client.on("ready", () => {
      console.log(`[${this.botId}] ✅ Bot ready and operational.`);
      this.setState({ status: "ready", qr: null, readySince: Date.now() });
      this.emit("ready");
    });

    this.client.on("disconnected", (reason: string) => {
      console.log(`[${this.botId}] 🔌 Disconnected: ${reason}`);
      this.setState({ status: "disconnected", qr: null });
      this.emit("disconnected", reason);
    });

    this.client.on("auth_failure", (msg: string) => {
      console.error(`[${this.botId}] ❌ Auth failure: ${msg}`);
      this.setState({ status: "error", lastError: msg });
    });

    this.client.on("message_create", async (msg: any) => {
      await this._handleMessage(msg);
    });

    this.client.initialize();
  }

  async stop(): Promise<void> {
    if (!this.client) return;
    console.log(`[${this.botId}] 🛑 Stopping…`);
    try {
      await this.client.destroy();
    } catch (e) {
      // ignore
    }
    this.client = null;
    this.configSvc.stopConfigRefresh();
    this.setState({ status: "idle", qr: null });
    console.log(`[${this.botId}] ⏹️ Stopped.`);
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

  // ─── Message handler ────────────────────────────────────────────────────────

  private async _handleMessage(msg: any): Promise<void> {
    try {
      if (msg.timestamp * 1000 < this.bootTime) return;
      if (msg.from === "status@broadcast" || msg.from.includes("@g.us")) return;

      const nowInSeconds = Math.floor(Date.now() / 1000);
      const config = this.configSvc.getConfig();
      if (config.isAutoResponseEnabled === false) {
        return;
      }

      const sys = (key: string): string =>
        config.respuestas_sistema[key]?.texto ?? "";
      const render = (text: string, name: string): string =>
        text.replace(/\{name\}/g, name);

      if (msg.fromMe) {
        const remoteId = msg.to;
        console.log(
          `[${this.botId}] Outgoing message caught. To: ${remoteId}. Body length: ${msg.body?.length || 0}. Media: ${msg.hasMedia}`,
        );

        const remoteSession = await this.sessionMgr.getSession(remoteId);
        const sessionHistory = remoteSession?.history;

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

        const isTextMatch = botTexts.some((texto) => {
          if (!texto) return false;
          const parts = texto.split("{name}");
          const prefix = (parts[0] || "").trim().slice(0, 25);
          if (prefix.length > 4 && msg.body.startsWith(prefix)) return true;
          if (parts.length > 1) {
            const suffix = (parts[1] || "").trim().slice(0, 25);
            if (suffix.length > 4 && msg.body.includes(suffix)) return true;
          }
          return msg.body.startsWith(texto.trim().slice(0, 25));
        });

        const isRecentMatch = this.recentlySentMessages.has(msg.body.trim());

        if (isHistoryMatch || isTextMatch || isRecentMatch) {
          if (isHistoryMatch)
            console.log(`[${this.botId}] Output ignored (History match).`);
          if (isTextMatch)
            console.log(`[${this.botId}] Output ignored (Text config match).`);
          if (isRecentMatch) {
            console.log(
              `[${this.botId}] Output ignored (Recent bot reply match).`,
            );
            this.recentlySentMessages.delete(msg.body.trim());
          }
          return;
        }

        await this.sessionMgr.saveSession(remoteId, {
          last_interaction: nowInSeconds,
          status: "human",
          human_since: nowInSeconds,
          contactName: remoteSession?.contactName,
          history: remoteSession?.history ?? [],
        });
        console.log(`[${this.botId}] 👤 Intervención humana en ${remoteId}.`);
        return;
      }

      const from = msg.from;
      const contact = await msg.getContact();
      const nombre = contact.pushname || "amigo";
      let session = await this.sessionMgr.getSession(from);
      let instruccionExtra = "";

      if (!session) {
        await this.sessionMgr.saveSession(from, {
          contactName: nombre,
          last_interaction: nowInSeconds,
          status: "bot",
          history: [],
        });
        this.statsMgr.incrementarUsuariosUnicos();
        session = (await this.sessionMgr.getSession(from))!;

        const mensajeBienvenida = render(sys("saludoInicial"), nombre);
        if (mensajeBienvenida) {
          instruccionExtra = `El usuario te está escribiendo por primera vez. Tu tarea es darle una cálida bienvenida basándote en esta plantilla: "${mensajeBienvenida}", y además responder a lo que te acaba de escribir.`;
        }
      } else if (
        nowInSeconds - session.last_interaction >
        this.sessionMgr.TWENTY_FOUR_HOURS
      ) {
        session.history = [];
        session.last_interaction = nowInSeconds;
        session.status = "bot";
        await this.sessionMgr.saveSession(from, session);

        const mensajeRecontacto = render(sys("saludoRecontacto"), nombre);
        if (mensajeRecontacto) {
          instruccionExtra = `El usuario volvió a escribir después de mucho tiempo. Tu tarea es saludarlo basándote en esta plantilla: "${mensajeRecontacto}", y además responder a lo que te acaba de escribir.`;
        }
      } else {
        session.last_interaction = nowInSeconds;
        session.contactName = nombre;
        await this.sessionMgr.saveSession(from, session);
      }

      const isMedia =
        msg.hasMedia ||
        [
          "image",
          "video",
          "audio",
          "ptt",
          "sticker",
          "document",
          "gif",
        ].includes(msg.type);

      const mediaTypeLabels: Record<string, string> = {
        image: "imagen",
        video: "video",
        sticker: "sticker",
        document: "documento",
        gif: "GIF",
      };

      // Audio / voice note → verificar config y transcribir
      if (isMedia && (msg.type === "audio" || msg.type === "ptt")) {
        try {
          // ── Verificar configuración de audio en Firestore ──────────────────
          const botDoc = await db.collection("bots").doc(this.botId).get();
          const botData = botDoc.data() ?? {};
          const audioEnabled = botData.audioAnalysisEnabled === true;
          const openaiApiKey = (botData.openaiApiKey as string) || "";

          if (!audioEnabled) {
            const disabledMsg =
              "Lo siento pero no puedo procesar audios en este momento. Escribeme 👏🏽👏🏽👏🏽";
            this.recentlySentMessages.add(disabledMsg);
            await msg.reply(disabledMsg);
            return;
          }

          if (!openaiApiKey) {
            const noKeyMsg =
              "Error de configuración: No se pudo procesar el audio (API Key no configurada).";
            this.recentlySentMessages.add(noKeyMsg);
            await msg.reply(noKeyMsg);
            return;
          }

          // Enviar mensaje de cortesía
          const listeningPrompt = [
            {
              role: "system" as const,
              content: `Eres un asistente de WhatsApp amigable. El usuario acaba de enviar un audio. Genera un mensaje corto y variado diciendo que estás escuchando y ya le respondes.`,
            },
            { role: "user" as const, content: "El usuario envió un audio." },
          ];

          const { llamarDeepseek } = await import("../config/deepseek.js");
          const listeningRes = await llamarDeepseek(listeningPrompt);
          let listeningMsg = listeningRes.choices[0].message.content?.trim();
          if (!listeningMsg)
            listeningMsg = "Dame un momento mientras escucho tu audio 🎧";

          if (session) {
            this.sessionMgr.appendToHistory(session, "assistant", listeningMsg);
            await this.sessionMgr.saveSession(from, session);
          }

          this.recentlySentMessages.add(listeningMsg);
          await msg.reply(listeningMsg);

          const transcription = await this._transcribeAudio(msg, openaiApiKey);
          if (!transcription) {
            const fallback = sys("mediaRecibida");
            if (fallback && fallback.trim()) {
              this.recentlySentMessages.add(fallback.trim());
              await msg.reply(fallback);
            }
            return;
          }
          msg.body = transcription;
        } catch (err: any) {
          console.error(`[${this.botId}] ❌ Error procesando audio:`, err);
          const isApiKeyError =
            err?.status === 401 || err?.code === "invalid_api_key";
          if (isApiKeyError) {
            const apiErrorMsg = "Error de configuración: API Key inválida.";
            this.recentlySentMessages.add(apiErrorMsg);
            await msg.reply(apiErrorMsg);
          } else {
            const errorFallback = sys("mediaRecibida");
            if (errorFallback && errorFallback.trim()) {
              this.recentlySentMessages.add(errorFallback.trim());
              await msg.reply(errorFallback);
            }
          }
          return;
        }
      } else if (isMedia) {
        const mediaLabel = mediaTypeLabels[msg.type] || msg.type;
        try {
          const mediaPrompt = [
            {
              role: "system" as const,
              content: `Eres un asistente de WhatsApp. El usuario envió "${mediaLabel}". Explica amablemente que no puedes verlo todavía y pide texto.`,
            },
          ];
          const { llamarDeepseek } = await import("../config/deepseek.js");
          const mediaRes = await llamarDeepseek(mediaPrompt);
          const mediaMsg =
            mediaRes.choices[0].message.content?.trim() ||
            `No puedo interpretar ${mediaLabel}s aún.`;

          if (session) {
            this.sessionMgr.appendToHistory(session, "assistant", mediaMsg);
            await this.sessionMgr.saveSession(from, session);
          }
          await msg.reply(mediaMsg);
        } catch (err) {
          const fallback = sys("mediaRecibida");
          if (fallback) await msg.reply(fallback);
        }
        return;
      }

      const currentStatus = await this.sessionMgr.getStatusFromFirestore(from);
      if (currentStatus === "human") {
        const humanSince = session?.human_since;
        if (humanSince !== undefined) {
          const elapsed = nowInSeconds - humanSince;
          if (elapsed >= this.sessionMgr.AUTO_REACTIVATE_SECONDS) {
            await this.sessionMgr.saveSession(from, {
              last_interaction: nowInSeconds,
              status: "bot",
              contactName: session?.contactName,
              history: session?.history ?? [],
            });
            const reactivacionMsg = sys("botReactivado");
            if (reactivacionMsg) {
              this.recentlySentMessages.add(reactivacionMsg.trim());
              await msg.reply(reactivacionMsg);
            }
          } else {
            return;
          }
        } else {
          return;
        }
      }

      this.sessionMgr.appendToHistory(
        session!,
        "user",
        msg.body || (msg.hasMedia ? `[Envió ${msg.type}]` : ""),
      );

      try {
        let respuesta = await generarRespuestaBot(
          session!.history,
          this.configSvc.getNombre(),
          config.respuestas_info,
          instruccionExtra,
          config.prompt_ia,
        );

        if (respuesta.includes("[NO_ENTENDI]")) {
          respuesta = respuesta.replace("[NO_ENTENDI]", "").trim();
          await this.configSvc.registrarNoEntendido(msg.body, from, nombre);
        }

        if (respuesta.includes("[HABLAR_CON_HUMANO]")) {
          respuesta = respuesta.replace("[HABLAR_CON_HUMANO]", "").trim();
          const avisoCliente = sys("agenteAviso");
          respuesta = respuesta
            ? `${respuesta}\n\n${avisoCliente}`
            : avisoCliente;
          if (session) {
            session.status = "human";
            session.human_since = nowInSeconds;
            await this.sessionMgr.saveSession(from, session);
          }
          const phoneNumber = msg.from.replace(/\D/g, "").slice(0, 12);
          await this.client!.sendMessage(
            msg.to,
            `📢 Contestale al usuario ${nombre}! ${phoneNumber}, que quiere: ${msg.body}`,
          );
        }

        this.statsMgr.incrementarMensajesRespondidos();
        if (session) {
          this.sessionMgr.appendToHistory(session, "assistant", respuesta);
          await this.sessionMgr.saveSession(from, session);
        }

        if (!respuesta || !respuesta.trim()) return;

        this.recentlySentMessages.add(respuesta.trim());
        await msg.reply(respuesta);
      } catch (error) {
        console.error(`[${this.botId}] ❌ Error generating response:`, error);
      }

      await this.statsMgr.saveStats();
    } catch (outerError) {
      console.error(`[${this.botId}] ❌ Unhandled message error:`, outerError);
    }
  }

  // ─── Audio transcription helper (OpenAI Whisper) ─────────────────────────────

  private async _transcribeAudio(msg: any, openaiApiKey: string): Promise<string | null> {
    const tempFilePath = path.join(TEMP_AUDIO_DIR, `temp_${this.botId}_${Date.now()}.ogg`);
    try {
      console.log(`[${this.botId}] 📥 Audio recibido, descargando...`);
      const media = await msg.downloadMedia();
      if (!media) return null;

      fs.writeFileSync(tempFilePath, media.data, { encoding: 'base64' });

      console.log(`[${this.botId}] ☁️ Enviando a OpenAI Whisper...`);

      const openai = new OpenAI({ apiKey: openaiApiKey });
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(tempFilePath),
        model: "whisper-1",
        language: "es",
      });

      console.log(`[${this.botId}] 📝 Texto transcrito:`, transcription.text);
      return transcription.text || null;
    } catch (error: any) {
      console.error(`[${this.botId}] ❌ Error con OpenAI Whisper:`, error.message);
      return null;
    } finally {
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          console.log(`[${this.botId}] 🗑️ Archivo temporal borrado: ${path.basename(tempFilePath)}`);
        } catch (e) {
          // ignore cleanup errors
        }
      }
    }
  }
}
