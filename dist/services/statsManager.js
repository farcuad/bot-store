import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";
// ─── Rutas ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATS_PATH = path.resolve(__dirname, "../../stats.json");
/** Ref al documento de estadísticas en Firestore */
const statsRef = () => db.collection("bots").doc(BOT_PHONE_NUMBER).collection("estadisticas").doc("resumen");
// ─── Estado en memoria ────────────────────────────────────────────────────────
let stats = {
    total_mensajes: 0,
    usuarios_unicos: 0,
    ultima_actualizacion: new Date().toISOString(),
};
// ─── Carga ────────────────────────────────────────────────────────────────────
export async function loadStats() {
    try {
        const raw = await fs.readFile(STATS_PATH, "utf-8");
        const parsed = JSON.parse(raw);
        stats = {
            total_mensajes: parsed.total_mensajes ?? 0,
            usuarios_unicos: parsed.usuarios_unicos ?? 0,
            ultima_actualizacion: parsed.ultima_actualizacion ?? new Date().toISOString(),
        };
        console.log("📊 Estadísticas cargadas desde disco.");
    }
    catch {
        console.log("📊 No se encontró stats.json. Iniciando con contadores en cero.");
    }
}
// ─── Guardado ─────────────────────────────────────────────────────────────────
export async function saveStats() {
    stats.ultima_actualizacion = new Date().toISOString();
    // 1. Persistir en disco (backup local, mantiene compatibilidad)
    await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
    // 2. Sincronizar con Firestore (sin await — no bloquear el flujo del bot)
    statsRef()
        .set(stats, { merge: true })
        .catch((e) => console.error("⚠️ No se pudo sincronizar stats con Firestore:", e));
}
// ─── Mutaciones ───────────────────────────────────────────────────────────────
export function incrementarMensajesRespondidos() {
    stats.total_mensajes++;
}
export function incrementarUsuariosUnicos() {
    stats.usuarios_unicos++;
}
export function getStats() {
    return stats;
}
// ─── Consola ──────────────────────────────────────────────────────────────────
export function imprimirResumenStats() {
    const s = getStats();
    console.log("\n══════════════════════════════════");
    console.log("📊 ESTADÍSTICAS DEL BOT");
    console.log("══════════════════════════════════");
    console.log(`📨 Total mensajes procesados : ${s.total_mensajes}`);
    console.log(`👥 Usuarios únicos           : ${s.usuarios_unicos}`);
    console.log("══════════════════════════════════\n");
}
//# sourceMappingURL=statsManager.js.map