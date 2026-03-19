import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";
import type {
  BotConfig,
  InfoRespuesta,
  SystemRespuesta,
  HorarioConfig,
} from "../models/BotConfig.js";

/** Scope raíz del bot en Firestore: bots/{botNumber} */
const botRef = () => db.collection("bots").doc(BOT_PHONE_NUMBER);

// ─── Cache en memoria ─────────────────────────────────────────────────────────
const defaultHorario: HorarioConfig = {
  dias_habiles: [2, 3, 4, 5, 6],
  hora_apertura: 12,
  timezone: "America/Caracas",
};

let cache: BotConfig = {
  nombre: "Bot",
  respuestas_info: {},
  respuestas_sistema: {},
  horario: defaultHorario,
  activo: false,
};

// ─── Carga de Firestore ───────────────────────────────────────────────────────

async function fetchNombreYActivo(): Promise<{
  nombre: string;
  activo: boolean;
}> {
  const doc = await botRef().get();
  return {
    nombre: (doc.data()?.nombre as string) ?? "Bot",
    activo: (doc.data()?.activo as boolean) ?? false,
  };
}

async function fetchInfoRespuestas(): Promise<Record<string, InfoRespuesta>> {
  const snap = await botRef().collection("respuestas_info").get();
  const result: Record<string, InfoRespuesta> = {};
  snap.forEach((doc) => {
    const data = doc.data() as InfoRespuesta;
    if (data.activo !== false) {
      result[doc.id] = data;
    }
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
  if (!doc.exists) {
    console.warn(
      "⚠️ No se encontró horarios/atencion en Firestore. Usando valores por defecto.",
    );
    return defaultHorario;
  }
  return doc.data() as HorarioConfig;
}

// ─── Carga completa ───────────────────────────────────────────────────────────

/**
 * Carga (o recarga) la configuración completa del bot desde Firestore.
 * En modo TESTING: REFRESH_INTERVAL_MS = 0 (sin cache, consulta en cada refresh).
 */
export async function loadConfig(): Promise<void> {
  try {
    const [{ nombre, activo }, respuestas_info, respuestas_sistema, horario] =
      await Promise.all([
        fetchNombreYActivo(),
        fetchInfoRespuestas(),
        fetchRespuestasSistema(),
        fetchHorario(),
      ]);

    cache = { nombre, respuestas_info, respuestas_sistema, horario, activo };

    console.log(
      `🔥 Config cargada desde Firestore — "${nombre}" | ` +
        `${Object.keys(respuestas_info).length} intenciones, ` +
        `${Object.keys(respuestas_sistema).length} resp. sistema.`,
    );
  } catch (error) {
    console.error("❌ Error al cargar configuración desde Firestore:", error);
  }
}

/**
 * Activa el refresh automático.
 * Mientras TESTING_MODE=true el intervalo es muy corto (5 seg) para ver cambios al instante.
 * En producción subirlo a 5 minutos.
 */
const TESTING_MODE = false;
console.log("TESTING_MODE", TESTING_MODE);
const REFRESH_INTERVAL_MS = TESTING_MODE ? 5_000 : 5 * 60 * 1000;

export function startConfigRefresh(): void {
  setInterval(() => {
    loadConfig().catch((e) => console.error("❌ Refresh fallido:", e));
  }, REFRESH_INTERVAL_MS);
}

/**
 * Acceso síncrono al cache.
 */
export function getConfig(): BotConfig {
  return cache;
}

/** Nombre de la empresa leído de Firestore */
export function getNombre(): string {
  return cache.nombre;
}

// ─── Helpers de horario ───────────────────────────────────────────────────────

export function isWithinBusinessHours(): boolean {
  const { dias_habiles, hora_apertura, hora_cierre, timezone } =
    getConfig().horario;
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const day = now.getDay();
  const hour = now.getHours();
  const afterOpen = hour >= hora_apertura;
  const beforeClose = hora_cierre !== undefined ? hour < hora_cierre : true;
  return dias_habiles.includes(day) && afterOpen && beforeClose;
}

export function getOutOfHoursMessage(): string {
  const { dias_habiles, timezone } = getConfig().horario;
  const now = new Date(
    new Date().toLocaleString("en-US", { timeZone: timezone }),
  );
  const isWeekend = !dias_habiles.includes(now.getDay());

  const sistema = getConfig().respuestas_sistema;
  if (isWeekend && sistema["fueraHorarioFin"]?.texto)
    return sistema["fueraHorarioFin"].texto;
  if (!isWeekend && sistema["fueraHorarioDia"]?.texto)
    return sistema["fueraHorarioDia"].texto;

  const { hora_apertura } = getConfig().horario;
  return isWeekend
    ? `⏰ ¡Hola! Por el momento estamos fuera de horario.\n\n📅 Atendemos de *Martes a Sábado* desde las *${hora_apertura}:00*.\n\nPuedo ayudarte con información de precios, ubicación y horarios. ¡Escríbenos dentro del horario para coordinar tu pedido! 🎂`
    : `⏰ ¡Hola! Aún no hemos abierto hoy.\n\n📅 Recibimos pedidos a partir de las *${hora_apertura}:00* (Martes a Sábado).\n\nPuedo ayudarte con preguntas sobre precios, ubicación y horarios. ¡Vuelve en horario de atención! 🎂`;
}

// ─── Analytics: mensajes no entendidos ───────────────────────────────────────

/**
 * Guarda en Firestore cada mensaje que el bot no pudo clasificar.
 * Colección: bots/{botNumber}/mensajes_no_entendidos/{auto-id}
 */
export async function registrarNoEntendido(
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
    console.error("⚠️ No se pudo registrar mensaje no entendido:", error);
  }
}
