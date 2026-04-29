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
    } catch {
      console.log(`[${botId}] 📊 stats.json no encontrado. Iniciando en cero.`);
    }
  }

  let saveTimeout: NodeJS.Timeout | null = null;

  async function saveStats(): Promise<void> {
    if (!saveTimeout) {
      saveTimeout = setTimeout(async () => {
        saveTimeout = null;
        stats.ultima_actualizacion = new Date().toISOString();
        try {
          await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");
          await statsRef().set(stats, { merge: true });
        } catch (e) {
          console.error(`[${botId}] ⚠️ No se pudo sincronizar stats:`, e);
        }
      }, 30000);
    }
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

// ─── Backward-compatible singleton ───────────────────────────────────────────────
// Only created when BOT_PHONE_NUMBER is set (legacy single-bot mode).

const _legacy = BOT_PHONE_NUMBER ? createStatsManager(BOT_PHONE_NUMBER) : null;

export const loadStats                      = _legacy?.loadStats                      ?? (async () => {});
export const saveStats                      = _legacy?.saveStats                      ?? (async () => {});
export const incrementarMensajesRespondidos = _legacy?.incrementarMensajesRespondidos ?? (() => {});
export const incrementarUsuariosUnicos      = _legacy?.incrementarUsuariosUnicos      ?? (() => {});
export const getStats                       = _legacy?.getStats                       ?? (() => ({ total_mensajes: 0, usuarios_unicos: 0, ultima_actualizacion: new Date().toISOString() }));

export function imprimirResumenStats(): void {
  if (!_legacy) return; // SaaS mode: no single legacy bot
  const s = _legacy.getStats();
  console.log("\n══════════════════════════════════");
  console.log("📊 ESTADÍSTICAS DEL BOT");
  console.log("══════════════════════════════════");
  console.log(`📨 Total mensajes procesados : ${s.total_mensajes}`);
  console.log(`👥 Usuarios únicos           : ${s.usuarios_unicos}`);
  console.log("══════════════════════════════════\n");
}
