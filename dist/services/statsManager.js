import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// ─── Factory per-bot ──────────────────────────────────────────────────────────
export function createStatsManager(botId) {
    const STATS_PATH = path.resolve(__dirname, `../../bots/${botId}/stats.json`);
    const statsRef = () => db.collection("bots").doc(botId).collection("estadisticas").doc("resumen");
    let stats = {
        total_mensajes: 0,
        usuarios_unicos: 0,
        ultima_actualizacion: new Date().toISOString(),
    };
    async function loadStats() {
        try {
            const raw = await fs.readFile(STATS_PATH, "utf-8");
            const parsed = JSON.parse(raw);
            stats = {
                total_mensajes: parsed.total_mensajes ?? 0,
                usuarios_unicos: parsed.usuarios_unicos ?? 0,
                ultima_actualizacion: parsed.ultima_actualizacion ?? new Date().toISOString(),
            };
            console.log(`[${botId}] 📊 Estadísticas cargadas desde disco.`);
        }
        catch {
            console.log(`[${botId}] 📊 stats.json no encontrado. Iniciando en cero.`);
        }
    }
    async function saveStats() {
        stats.ultima_actualizacion = new Date().toISOString();
        await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
        statsRef()
            .set(stats, { merge: true })
            .catch((e) => console.error(`[${botId}] ⚠️ No se pudo sincronizar stats:`, e));
    }
    function incrementarMensajesRespondidos() {
        stats.total_mensajes++;
    }
    function incrementarUsuariosUnicos() {
        stats.usuarios_unicos++;
    }
    function getStats() {
        return { ...stats };
    }
    return {
        loadStats,
        saveStats,
        incrementarMensajesRespondidos,
        incrementarUsuariosUnicos,
        getStats,
    };
}
// ─── Backward-compatible singleton ───────────────────────────────────────────
const _legacy = createStatsManager(BOT_PHONE_NUMBER);
export const loadStats = _legacy.loadStats;
export const saveStats = _legacy.saveStats;
export const incrementarMensajesRespondidos = _legacy.incrementarMensajesRespondidos;
export const incrementarUsuariosUnicos = _legacy.incrementarUsuariosUnicos;
export const getStats = _legacy.getStats;
export function imprimirResumenStats() {
    const s = _legacy.getStats();
    console.log("\n══════════════════════════════════");
    console.log("📊 ESTADÍSTICAS DEL BOT");
    console.log("══════════════════════════════════");
    console.log(`📨 Total mensajes procesados : ${s.total_mensajes}`);
    console.log(`👥 Usuarios únicos           : ${s.usuarios_unicos}`);
    console.log("══════════════════════════════════\n");
}
//# sourceMappingURL=statsManager.js.map