import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Tipos ---
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionEntry {
  last_interaction: number; // timestamp en segundos
  status: 'bot' | 'human';
  human_since?: number | undefined; // timestamp cuando se activó modo humano
  history: ConversationMessage[]; // historial de conversación
}

export type SessionsData = Record<string, SessionEntry>;

// --- Constantes ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_PATH = path.resolve(__dirname, '../../sessions.json');

export const TWENTY_FOUR_HOURS = 86_400;              // 24h en segundos
export const AUTO_REACTIVATE_SECONDS = 30 * 60;       // 30 minutos
export const MAX_HISTORY_MESSAGES = 10;               // máximo de mensajes en historial

// --- Funciones ---

/**
 * Carga las sesiones desde sessions.json.
 * Si el archivo no existe, retorna un objeto vacío.
 */
export async function loadSessions(): Promise<SessionsData> {
  try {
    const raw = await fs.readFile(SESSIONS_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as SessionsData;
    // Migración: añadir history vacío a sesiones antiguas sin él
    for (const key of Object.keys(parsed)) {
      const entry = parsed[key];
      if (entry && !entry.history) entry.history = [];
    }
    return parsed;
  } catch {
    return {};
  }
}

/**
 * Guarda las sesiones en sessions.json con formato legible.
 */
export async function saveSessions(data: SessionsData): Promise<void> {
  await fs.writeFile(SESSIONS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Agrega un mensaje al historial de la sesión y lo limita al máximo definido.
 */
export function appendToHistory(
  session: SessionEntry,
  role: 'user' | 'assistant',
  content: string,
): void {
  if (!session.history) session.history = [];
  session.history.push({ role, content });
  if (session.history.length > MAX_HISTORY_MESSAGES) {
    session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
  }
}
