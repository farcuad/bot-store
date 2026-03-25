import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";
import type {
  BotConfig,
  InfoRespuesta,
  SystemRespuesta,
  HorarioConfig,
} from "../models/BotConfig.js";

const TESTING_MODE = false;
const REFRESH_INTERVAL_MS = TESTING_MODE ? 5_000 : 5 * 60 * 1000;

const defaultHorario: HorarioConfig = {
  dias_habiles: [2, 3, 4, 5, 6],
  hora_apertura: 12,
  timezone: "America/Caracas",
};

// ─── Factory per-bot ──────────────────────────────────────────────────────────

export function createConfigService(botId: string) {
  const botRef = () => db.collection("bots").doc(botId);

  let cache: BotConfig = {
    nombre: "Bot",
    respuestas_info: {},
    respuestas_sistema: {},
    activo: false,
  };

  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchNombreYActivo(): Promise<{
    nombre: string;
    activo: boolean;
    prompt_ia?: string | undefined;
  }> {
    const doc = await botRef().get();
    const data = doc.data();
    return {
      nombre: (data?.nombre as string) ?? "Bot",
      activo: (data?.activo as boolean) ?? false,
      prompt_ia: data?.prompt_ia as string | undefined,
    };
  }

  async function fetchInfoRespuestas(): Promise<Record<string, InfoRespuesta>> {
    const snap = await botRef().collection("respuestas_info").get();
    const result: Record<string, InfoRespuesta> = {};
    snap.forEach((doc) => {
      const data = doc.data() as InfoRespuesta;
      if (data.activo !== false) result[doc.id] = data;
    });
    return result;
  }

  async function fetchRespuestasSistema(): Promise<
    Record<string, SystemRespuesta>
  > {
    const snap = await botRef().collection("respuestas_sistema").get();
    const result: Record<string, SystemRespuesta> = {};
    snap.forEach((doc) => {
      result[doc.id] = doc.data() as SystemRespuesta;
    });
    return result;
  }

  async function fetchHorario(): Promise<HorarioConfig> {
    const doc = await botRef().collection("horarios").doc("atencion").get();
    if (!doc.exists) return defaultHorario;
    return doc.data() as HorarioConfig;
  }

  async function loadConfig(): Promise<void> {
    try {
      const [
        { nombre, activo, prompt_ia },
        respuestas_info,
        respuestas_sistema,
      ] = await Promise.all([
        fetchNombreYActivo(),
        fetchInfoRespuestas(),
        fetchRespuestasSistema(),
        fetchHorario(),
      ]);
      cache = {
        nombre,
        respuestas_info,
        respuestas_sistema,
        activo,
        prompt_ia,
      };
      console.log(
        new Date().toLocaleString(),
        `[${botId}] 🔥 Config cargada — "${nombre}" | ` +
          `${Object.keys(respuestas_info).length} informaciones, ` +
          `${Object.keys(respuestas_sistema).length} resp. sistema.`,
      );
    } catch (error) {
      console.error(`[${botId}] ❌ Error al cargar configuración:`, error);
    }
  }

  function startConfigRefresh(): void {
    if (refreshTimer) return; // already running
    refreshTimer = setInterval(() => {
      loadConfig().catch((e) =>
        console.error(`[${botId}] ❌ Refresh fallido:`, e),
      );
    }, REFRESH_INTERVAL_MS);
  }

  function stopConfigRefresh(): void {
    if (refreshTimer) {
      clearInterval(refreshTimer);
      refreshTimer = null;
    }
  }

  function getConfig(): BotConfig {
    return cache;
  }

  function getNombre(): string {
    return cache.nombre;
  }

  async function registrarNoEntendido(
    mensaje: string,
    usuarioId: string,
    nombreUsuario: string,
  ): Promise<void> {
    try {
      await botRef().collection("mensajes_no_entendidos").add({
        mensaje,
        usuario_id: usuarioId,
        nombre_usuario: nombreUsuario,
        timestamp: new Date(),
        revisado: false,
      });
    } catch (error) {
      console.error(
        `[${botId}] ⚠️ No se pudo registrar mensaje no entendido:`,
        error,
      );
    }
  }

  return {
    loadConfig,
    startConfigRefresh,
    stopConfigRefresh,
    getConfig,
    getNombre,
    registrarNoEntendido,
  };
}

// ─── Backward-compatible singleton ───────────────────────────────────────────

console.log("TESTING_MODE", TESTING_MODE);

const _legacy = createConfigService(BOT_PHONE_NUMBER);

export const loadConfig = _legacy.loadConfig;
export const startConfigRefresh = _legacy.startConfigRefresh;
export const getConfig = _legacy.getConfig;
export const getNombre = _legacy.getNombre;
export const registrarNoEntendido = _legacy.registrarNoEntendido;
