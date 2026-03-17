import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Intencion } from "../controllers/AiController.js";
import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";

// ─── Tipos ────────────────────────────────────────────────────────────────────
export type StatsData = {
  total_mensajes: number;
  por_intencion: Partial<Record<Intencion, number>>;
  usuarios_unicos: number;
  ultima_actualizacion: string;
};

// ─── Rutas ────────────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const STATS_PATH = path.resolve(__dirname, "../../stats.json");

/** Ref al documento de estadísticas en Firestore */
const statsRef = () =>
  db.collection("bots").doc(BOT_PHONE_NUMBER).collection("estadisticas").doc("resumen");

// ─── Estado en memoria ────────────────────────────────────────────────────────
let stats: StatsData = {
  total_mensajes: 0,
  por_intencion: {},
  usuarios_unicos: 0,
  ultima_actualizacion: new Date().toISOString(),
};

// ─── Carga ────────────────────────────────────────────────────────────────────

export async function loadStats(): Promise<void> {
  try {
    const raw = await fs.readFile(STATS_PATH, "utf-8");
    stats = JSON.parse(raw) as StatsData;
    console.log("📊 Estadísticas cargadas desde disco.");
  } catch {
    console.log("📊 No se encontró stats.json. Iniciando con contadores en cero.");
  }
}

// ─── Guardado ─────────────────────────────────────────────────────────────────

export async function saveStats(): Promise<void> {
  stats.ultima_actualizacion = new Date().toISOString();

  // 1. Persistir en disco (backup local, mantiene compatibilidad)
  await fs.writeFile(STATS_PATH, JSON.stringify(stats, null, 2), "utf-8");

  // 2. Sincronizar con Firestore (sin await — no bloquear el flujo del bot)
  statsRef()
    .set(stats, { merge: true })
    .catch((e) => console.error("⚠️ No se pudo sincronizar stats con Firestore:", e));
}

// ─── Mutaciones ───────────────────────────────────────────────────────────────

export function incrementarIntencion(intencion: Intencion): void {
  stats.total_mensajes++;
  stats.por_intencion[intencion] = (stats.por_intencion[intencion] ?? 0) + 1;
}

export function incrementarUsuariosUnicos(): void {
  stats.usuarios_unicos++;
}

export function getStats(): StatsData {
  return stats;
}

// ─── Consola ──────────────────────────────────────────────────────────────────

export function imprimirResumenStats(): void {
  const s = getStats();
  console.log("\n══════════════════════════════════");
  console.log("📊 ESTADÍSTICAS DEL BOT");
  console.log("══════════════════════════════════");
  console.log(`📨 Total mensajes procesados : ${s.total_mensajes}`);
  console.log(`👥 Usuarios únicos           : ${s.usuarios_unicos}`);
  console.log("📌 Por intención:");
  for (const [k, v] of Object.entries(s.por_intencion)) {
    console.log(`   • ${k.padEnd(15)} → ${v} veces`);
  }
  console.log("══════════════════════════════════\n");
}
