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

function ensureRotation(logPath: string): void {
  try {
    const stats = fs.statSync(logPath);
    if (stats.size > MAX_LOG_BYTES) {
      const content = fs.readFileSync(logPath, "utf8");
      const lines = content.split("\n").filter(Boolean);
      const trimmed = lines.slice(-TRUNCATE_TO_LINES).join("\n") + "\n";
      fs.writeFileSync(logPath, trimmed, "utf8");
    }
  } catch {
    // File may not exist yet — that's fine
  }
}

function appendLine(logPath: string, line: string): void {
  ensureRotation(logPath);
  fs.appendFileSync(logPath, line + "\n", "utf8");
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
      const ts = formatTimestamp();
      const fromClean = from.replace("@c.us", "").replace(/\D/g, "");
      const line = `[${ts}] 📩 MENSAJE de +${fromClean}: ${text}`;
      // Also emit to stdout for process-level visibility
      console.log(`[BOT:${botId}]`, line);
      appendLine(logPath, line);
    },

    log(...args: any[]): void {
      const ts = formatTimestamp();
      const msg = serializeArgs(args);
      const line = `[${ts}] ${msg}`;
      console.log(`[BOT:${botId}]`, msg);
      appendLine(logPath, line);
    },

    error(...args: any[]): void {
      const ts = formatTimestamp();
      const msg = serializeArgs(args);
      const line = `[${ts}] ❌ ERROR: ${msg}`;
      console.error(`[BOT:${botId}]`, msg);
      appendLine(logPath, line);
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
