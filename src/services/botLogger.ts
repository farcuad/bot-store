import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BOTS_ROOT = path.resolve(__dirname, "../../bots");

const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB
const TRUNCATE_TO_LINES = 2000;

function ensureLogFile(botId: string): string {
  const botDir = path.join(BOTS_ROOT, botId);
  if (!fs.existsSync(botDir)) {
    fs.mkdirSync(botDir, { recursive: true });
  }
  return path.join(botDir, "bot.log");
}

function formatTimestamp(): string {
  return new Date().toLocaleString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

let writeQueue: Promise<void> = Promise.resolve();

async function appendLineAsync(logPath: string, line: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      try {
        const stats = await fs.promises.stat(logPath);
        if (stats.size > MAX_LOG_BYTES) {
          const content = await fs.promises.readFile(logPath, "utf8");
          const lines = content.split("\n").filter(Boolean);
          const trimmed = lines.slice(-TRUNCATE_TO_LINES).join("\n") + "\n";
          await fs.promises.writeFile(logPath, trimmed, "utf8");
        }
      } catch {
        // Archivo no existe aún
      }
      await fs.promises.appendFile(logPath, line + "\n", "utf8");
    } catch (e) {
      // Evitar que el loop de logger colapse
      console.error("Error asíncrono en botLogger:", e);
    }
  });
}

function serializeArgs(args: any[]): string {
  return args
    .map((a) => {
      if (typeof a === "string") return a;
      if (a instanceof Error) return a.stack || a.message;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

export interface BotLogger {
  /** Registra un mensaje entrante con el número de origen */
  logMessage(from: string, text: string): void;
  /** Registra un evento de proceso (reemplaza console.log internos) */
  log(...args: any[]): void;
  /** Registra un error de proceso */
  error(...args: any[]): void;
  /** Lee las últimas N líneas del log */
  readLogs(lines?: number): string[];
  /** Devuelve el tamaño actual del archivo en bytes */
  size(): number;
  /** Vacía el archivo de log */
  clearLogs(): void;
}

export function createBotLogger(botId: string): BotLogger {
  const logPath = ensureLogFile(botId);

  return {
    logMessage(from: string, text: string): void {
      // Intencionalmente vacío para reducir uso de CPU y logs
    },

    log(...args: any[]): void {
      const ts = formatTimestamp();
      const msg = serializeArgs(args);
      const line = `[${ts}] ${msg}`;
      console.log(`[BOT:${botId}]`, msg);
      appendLineAsync(logPath, line);
    },

    error(...args: any[]): void {
      const ts = formatTimestamp();
      const msg = serializeArgs(args);
      const line = `[${ts}] ❌ ERROR: ${msg}`;
      console.error(`[BOT:${botId}]`, msg);
      appendLineAsync(logPath, line);
    },

    readLogs(lines = 500): string[] {
      try {
        const content = fs.readFileSync(logPath, "utf8");
        const all = content.split("\n").filter(Boolean);
        return all.slice(-lines);
      } catch {
        return [];
      }
    },

    size(): number {
      try {
        return fs.statSync(logPath).size;
      } catch {
        return 0;
      }
    },

    clearLogs(): void {
      try {
        fs.writeFileSync(logPath, "", "utf8");
      } catch {
        // Ignore if file doesn't exist
      }
    },
  };
}
