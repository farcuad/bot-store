import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";
const TESTING_MODE = false;
const REFRESH_INTERVAL_MS = TESTING_MODE ? 5_000 : 5 * 60 * 1000;
const defaultHorario = {
    dias_habiles: [2, 3, 4, 5, 6],
    hora_apertura: 12,
    timezone: "America/Caracas",
};
// ─── Factory per-bot ──────────────────────────────────────────────────────────
export function createConfigService(botId) {
    const botRef = () => db.collection("bots").doc(botId);
    let cache = {
        nombre: "Bot",
        respuestas_info: {},
        respuestas_sistema: {},
        activo: false,
    };
    let refreshTimer = null;
    async function fetchNombreYActivo() {
        const doc = await botRef().get();
        const data = doc.data();
        return {
            nombre: data?.nombre ?? "Bot",
            activo: data?.activo ?? false,
            prompt_ia: data?.prompt_ia,
        };
    }
    async function fetchInfoRespuestas() {
        const snap = await botRef().collection("respuestas_info").get();
        const result = {};
        snap.forEach((doc) => {
            const data = doc.data();
            if (data.activo !== false)
                result[doc.id] = data;
        });
        return result;
    }
    async function fetchRespuestasSistema() {
        const snap = await botRef().collection("respuestas_sistema").get();
        const result = {};
        snap.forEach((doc) => {
            result[doc.id] = doc.data();
        });
        return result;
    }
    async function fetchHorario() {
        const doc = await botRef().collection("horarios").doc("atencion").get();
        if (!doc.exists)
            return defaultHorario;
        return doc.data();
    }
    async function loadConfig() {
        try {
            const [{ nombre, activo, prompt_ia }, respuestas_info, respuestas_sistema,] = await Promise.all([
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
            console.log(new Date().toLocaleString(), `[${botId}] 🔥 Config cargada — "${nombre}" | ` +
                `${Object.keys(respuestas_info).length} informaciones, ` +
                `${Object.keys(respuestas_sistema).length} resp. sistema.`);
        }
        catch (error) {
            console.error(`[${botId}] ❌ Error al cargar configuración:`, error);
        }
    }
    function startConfigRefresh() {
        if (refreshTimer)
            return; // already running
        refreshTimer = setInterval(() => {
            loadConfig().catch((e) => console.error(`[${botId}] ❌ Refresh fallido:`, e));
        }, REFRESH_INTERVAL_MS);
    }
    function stopConfigRefresh() {
        if (refreshTimer) {
            clearInterval(refreshTimer);
            refreshTimer = null;
        }
    }
    function getConfig() {
        return cache;
    }
    function getNombre() {
        return cache.nombre;
    }
    async function registrarNoEntendido(mensaje, usuarioId, nombreUsuario) {
        try {
            await botRef().collection("mensajes_no_entendidos").add({
                mensaje,
                usuario_id: usuarioId,
                nombre_usuario: nombreUsuario,
                timestamp: new Date(),
                revisado: false,
            });
        }
        catch (error) {
            console.error(`[${botId}] ⚠️ No se pudo registrar mensaje no entendido:`, error);
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
export const getConfig = _legacy?.getConfig ?? (() => ({ nombre: "Bot", respuestas_info: {}, respuestas_sistema: {}, activo: false }));
export const getNombre = _legacy?.getNombre ?? (() => "Bot");
export const registrarNoEntendido = _legacy?.registrarNoEntendido ?? (async () => { });
//# sourceMappingURL=configService.js.map