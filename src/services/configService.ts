import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";
import type {
  BotConfig,
  InfoRespuesta,
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
    activo: false,
    isAutoResponseEnabled: true,
    timezone: "America/Caracas",
  };

  let refreshTimer: ReturnType<typeof setInterval> | null = null;

  async function fetchNombreYActivo(): Promise<{
    nombre: string;
    activo: boolean;
    isAutoResponseEnabled: boolean;
    prompt_ia?: string | undefined;
    timezone?: string | undefined;
    motivosNotificacion?: string[] | undefined;
    debugEnabled?: boolean;
    muevelappMcpEnabled?: boolean;
    ordenalappMcpEnabled?: boolean;
    ordenalappSlug?: string;
    cambialappMcpEnabled?: boolean;
  }> {
    const doc = await botRef().get();
    const data = doc.data();
    return {
      nombre: (data?.nombre as string) ?? "Bot",
      activo: (data?.activo as boolean) ?? false,
      isAutoResponseEnabled: (data?.isAutoResponseEnabled as boolean) ?? true,
      prompt_ia: data?.prompt_ia as string | undefined,
      timezone: data?.timezone as string | undefined,
      motivosNotificacion: Array.isArray(data?.motivosNotificacion)
        ? (data!.motivosNotificacion as string[])
        : undefined,
      debugEnabled: !!data?.debugEnabled,
      muevelappMcpEnabled: !!data?.muevelappMcpEnabled,
      ordenalappMcpEnabled: !!data?.ordenalappMcpEnabled,
      ordenalappSlug: (data?.ordenalappSlug as string) ?? "",
      cambialappMcpEnabled: !!data?.cambialappMcpEnabled,
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

  async function fetchHorario(): Promise<HorarioConfig> {
    const doc = await botRef().collection("horarios").doc("atencion").get();
    if (!doc.exists) return defaultHorario;
    return doc.data() as HorarioConfig;
  }

  async function loadConfig(): Promise<void> {
    try {
      const [
        { nombre, activo, isAutoResponseEnabled, prompt_ia, timezone, motivosNotificacion, debugEnabled, muevelappMcpEnabled, ordenalappMcpEnabled, ordenalappSlug, cambialappMcpEnabled },
        respuestas_info,
        _horario,
      ] = await Promise.all([
        fetchNombreYActivo(),
        fetchInfoRespuestas(),
        fetchHorario(),
      ]);
      cache = {
        nombre,
        respuestas_info,
        activo,
        isAutoResponseEnabled,
        prompt_ia,
        timezone: timezone || "America/Caracas",
        motivosNotificacion: motivosNotificacion ?? [],
        debugEnabled: debugEnabled ?? false,
        muevelappMcpEnabled: muevelappMcpEnabled ?? false,
        ordenalappMcpEnabled: ordenalappMcpEnabled ?? false,
        ordenalappSlug: ordenalappSlug ?? "",
        cambialappMcpEnabled: cambialappMcpEnabled ?? false,
      } as any;
      console.log(
        new Date().toLocaleString(),
        `[${botId}] 🔥 Config cargada — "${nombre}" | ` +
        `${Object.keys(respuestas_info).length} informaciones | ` +
        `${(motivosNotificacion ?? []).length} motivos notificación | ` +
        `Debug: ${debugEnabled ? "ACTIVADO" : "desactivado"}.`,
      );
    } catch (error) {
      console.error(`[${botId}] ❌ Error al cargar configuración:`, error);
    }
  }

  function startConfigRefresh(): void {
    // Ya no se recarga periódicamente, sino bajo demanda cuando se modifica la config
  }

  function stopConfigRefresh(): void {
    // Vacío
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

// ─── Backward-compatible singleton ───────────────────────────────────────────────
// Only created when BOT_PHONE_NUMBER is set (legacy single-bot mode).
// In SaaS mode each BotInstance creates its own ConfigService via createConfigService().

console.log("TESTING_MODE", TESTING_MODE);

const _legacy = BOT_PHONE_NUMBER ? createConfigService(BOT_PHONE_NUMBER) : null;

export const loadConfig = _legacy?.loadConfig ?? (async () => { });
export const startConfigRefresh = _legacy?.startConfigRefresh ?? (() => { });
export const getConfig =
  _legacy?.getConfig ??
  (() => ({ nombre: "Bot", respuestas_info: {}, activo: false }));
export const getNombre = _legacy?.getNombre ?? (() => "Bot");
export const registrarNoEntendido =
  _legacy?.registrarNoEntendido ?? (async () => { });
