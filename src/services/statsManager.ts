import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type StatsData = {
  total_mensajes: number;
  usuarios_unicos: number;
  ultima_actualizacion: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ─── Factory per-bot ──────────────────────────────────────────────────────────

export function createStatsManager(botId: string) {
  const STATS_PATH = path.resolve(__dirname, `../../bots/${botId}/stats.json`);

  const statsRef = () =>
    db.collection("bots").doc(botId).collection("estadisticas").doc("resumen");

  let stats: StatsData = {
    total_mensajes: 0,
    usuarios_unicos: 0,
    ultima_actualizacion: new Date().toISOString(),
  };

  async function loadStats(): Promise<void> {
    try {
      const raw = await fs.readFile(STATS_PATH, "utf-8");
      const parsed = JSON.parse(raw) as Partial<StatsData>;
      stats = {
        total_mensajes: parsed.total_mensajes ?? 0,
        usuarios_unicos: parsed.usuarios_unicos ?? 0,
        ultima_actualizacion: parsed.ultima_actualizacion ?? new Date().toISOString(),
      };
      console.log(`[${botId}] 📊 Estadísticas cargadas desde disco.`);
    } catch {
      console.log(`[${botId}] 📊 stats.json no encontrado. Iniciando en cero.`);
    }
  }

  async function saveStats(): Promise<void> {
    stats.ultima_actualizacion = new Date().toISOString();
    await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
    statsRef()
      .set(stats, { merge: true })
      .catch((e) => console.error(`[${botId}] ⚠️ No se pudo sincronizar stats:`, e));
  }

  function incrementarMensajesRespondidos(): void {
    stats.total_mensajes++;
  }

  function incrementarUsuariosUnicos(): void {
    stats.usuarios_unicos++;
  }

  function getStats(): StatsData {
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

export function imprimirResumenStats(): void {
  const s = _legacy.getStats();
  console.log("\n══════════════════════════════════");
  console.log("📊 ESTADÍSTICAS DEL BOT");
  console.log("══════════════════════════════════");
  console.log(`📨 Total mensajes procesados : ${s.total_mensajes}`);
  console.log(`👥 Usuarios únicos           : ${s.usuarios_unicos}`);
  console.log("══════════════════════════════════\n");
}
