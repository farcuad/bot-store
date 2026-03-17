import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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
export async function loadSessions() {
    try {
        const raw = await fs.readFile(SESSIONS_PATH, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        // Si el archivo no existe o tiene un formato inválido, retornamos vacío
        return {};
    }
}
/**
 * Guarda las sesiones en sessions.json con formato legible.
 */
export async function saveSessions(data) {
    await fs.writeFile(SESSIONS_PATH, JSON.stringify(data, null, 2), 'utf-8');
}
//# sourceMappingURL=sessionManager.js.map