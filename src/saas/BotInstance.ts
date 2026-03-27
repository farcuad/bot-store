import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import path from "node:path";
import { fileURLToPath } from "node:url";
import { EventEmitter } from "node:events";
import { db } from "../config/firebase.js";
import { generarRespuestaBot } from "../controllers/AiController.js";
import { createSessionManager } from "../services/sessionManager.js";
import { createConfigService } from "../services/configService.js";
import { createStatsManager } from "../services/statsManager.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS_ROOT = path.resolve(__dirname, "../../bots");

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

  async start(): Promise<void> {
    if (
      this.state.status === "initializing" ||
      this.state.status === "qr" ||
      this.state.status === "ready"
    ) {
      console.log(`[${this.botId}] Already running (${this.state.status}) — skipping duplicate start.`);
      return;
    }

    this.setState({ status: "initializing", qr: null, lastError: null });
    console.log(`[${this.botId}] 🚀 Starting bot instance…`);

    const dataPath = path.join(BOTS_ROOT, this.botId);

    // ── Clean up stale Chrome lock files left by an abrupt process kill ────────
    // Puppeteer's LocalAuth stores its Chrome profile under:
    //   <dataPath>/.wwebjs_auth/<clientId>/Default (or similar)
    // The lock lives at the top of the userDataDir.
    const { promises: fsp } = await import("node:fs");
    const wwebjsAuthRoot = path.join(dataPath, ".wwebjs_auth");
    try {
      const entries = await fsp.readdir(wwebjsAuthRoot);
      for (const entry of entries) {
        const lockFile = path.join(wwebjsAuthRoot, entry, "SingletonLock");
        await fsp.unlink(lockFile).catch(() => {}); // ignore if not present
      }
    } catch {
      // .wwebjs_auth doesn't exist yet on first run — that's fine
    }
    // ──────────────────────────────────────────────────────────────────────────

    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: this.botId,
        dataPath,
      }),
      puppeteer: {
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      },
    });

    this.bootTime = Date.now();

    // Load config
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
      // ignore errors on destroy
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

      const sys = (key: string): string =>
        config.respuestas_sistema[key]?.texto ?? "";
      const render = (text: string, name: string): string =>
        text.replace(/\{name\}/g, name);

      // ── Intervención humana (fromMe) ────────────────────────────────────────
      if (msg.fromMe) {
        const chat = await msg.getChat();
        const remoteId = chat.id._serialized;
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

        if (isHistoryMatch || isTextMatch) return;

        await this.sessionMgr.saveSession(remoteId, {
          last_interaction: nowInSeconds,
          status: "human",
          human_since: nowInSeconds,
          history: remoteSession?.history ?? [],
        });
        console.log(`[${this.botId}] 👤 Intervención humana en ${remoteId}.`);
        return;
      }

      const from = msg.from;

      // ── Media ───────────────────────────────────────────────────────────────
      const isMedia =
        msg.hasMedia ||
        ["image", "video", "audio", "ptt", "sticker", "document"].includes(
          msg.type
        );

      if (isMedia && msg.type !== "sticker") {
        await msg.reply(sys("mediaRecibida"));
        return;
      }
      if (isMedia) return;

      // ── Auto-reactivación ───────────────────────────────────────────────────
      const session = await this.sessionMgr.getSession(from);
      const currentStatus = await this.sessionMgr.getStatusFromFirestore(from);

      if (currentStatus === "human") {
        const humanSince = session?.human_since;
        if (humanSince !== undefined) {
          const elapsed = nowInSeconds - humanSince;
          if (elapsed >= this.sessionMgr.AUTO_REACTIVATE_SECONDS) {
            await this.sessionMgr.saveSession(from, {
              last_interaction: nowInSeconds,
              status: "bot",
              history: session?.history ?? [],
            });
            await msg.reply(sys("botReactivado"));
            return;
          }
        }
        return;
      }

      // ── Gestión de sesión ────────────────────────────────────────────────────
      const contact = await msg.getContact();
      const nombre = contact.pushname || "amigo";
      let instruccionExtra = "";

      if (!session) {
        await this.sessionMgr.saveSession(from, {
          last_interaction: nowInSeconds,
          status: "bot",
          history: [],
        });
        this.statsMgr.incrementarUsuariosUnicos();

        const mensajeBienvenida = render(sys("saludoInicial"), nombre);
        instruccionExtra = `El usuario te está escribiendo por primera vez. Tu tarea es darle una cálida bienvenida basándote en esta plantilla: "${mensajeBienvenida}", y además responder a lo que te acaba de escribir.`;
      } else if (
        nowInSeconds - session.last_interaction >
        this.sessionMgr.TWENTY_FOUR_HOURS
      ) {
        await this.sessionMgr.saveSession(from, {
          last_interaction: nowInSeconds,
          status: "bot",
          history: [],
        });
        const mensajeRecontacto = render(sys("saludoRecontacto"), nombre);
        instruccionExtra = `El usuario volvió a escribir después de mucho tiempo. Tu tarea es saludarlo basándote en esta plantilla: "${mensajeRecontacto}", y además responder a lo que te acaba de escribir.`;
      } else {
        session.last_interaction = nowInSeconds;
        await this.sessionMgr.saveSession(from, session);
      }

      const activeSession = (await this.sessionMgr.getSession(from))!;
      this.sessionMgr.appendToHistory(activeSession, "user", msg.body);

      // ── Generación IA ────────────────────────────────────────────────────────
      try {
        let respuesta = await generarRespuestaBot(
          activeSession.history,
          this.configSvc.getNombre(),
          config.respuestas_info,
          instruccionExtra,
          config.prompt_ia
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

          activeSession.status = "human";
          activeSession.human_since = nowInSeconds;
          await this.sessionMgr.saveSession(from, activeSession);

          const phoneNumber = msg.from.replace(/\D/g, "").slice(0, 12);
          await this.client!.sendMessage(
            msg.to,
            `📢 Contestale al usuario ${nombre}! ${phoneNumber}, que quiere: ${msg.body}`
          );
        }

        this.statsMgr.incrementarMensajesRespondidos();
        
        // Save history first so that the `message_create` event (fromMe=true) 
        // can match `isHistoryMatch`.
        this.sessionMgr.appendToHistory(activeSession, "assistant", respuesta);
        await this.sessionMgr.saveSession(from, activeSession);

        await msg.reply(respuesta);
      } catch (error) {
        console.error(`[${this.botId}] ❌ Error generating response:`, error);
      }

      await this.statsMgr.saveStats();
    } catch (outerError) {
      console.error(`[${this.botId}] ❌ Unhandled message error:`, outerError);
    }
  }
}
