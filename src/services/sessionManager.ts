import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// --- Tipos ---
export interface SessionEntry {
    last_interaction: number; // timestamp en segundos
    status: 'bot' | 'human';
}

export type SessionsData = Record<string, SessionEntry>;

// --- Constantes ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SESSIONS_PATH = path.resolve(__dirname, '../../sessions.json');

export const TWENTY_FOUR_HOURS = 86_400; // 24 horas en segundos

// --- Funciones ---

/**
 * Carga las sesiones desde sessions.json.
 * Si el archivo no existe, retorna un objeto vacío.
 */
export async function loadSessions(): Promise<SessionsData> {
    try {
        const raw = await fs.readFile(SESSIONS_PATH, 'utf-8');
        return JSON.parse(raw) as SessionsData;
    } catch {
        // Si el archivo no existe o tiene un formato inválido, retornamos vacío
        return {};
    }
}

/**
 * Guarda las sesiones en sessions.json con formato legible.
 */
export async function saveSessions(data: SessionsData): Promise<void> {
    await fs.writeFile(SESSIONS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
