import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db } from "../config/firebase.js";
import { seendMessageController } from "./WhatsappController.js";
import { validateApiKey } from "../middlewares/authWhatsapp.js";
const router = Router();
router.post("/send-message", validateApiKey, seendMessageController);
const botRef = (req) => {
    const botId = req.headers["x-bot-id"];
    if (!botId)
        return null;
    return db.collection("bots").doc(botId);
};
const infoRef = (req) => {
    const bot = botRef(req);
    if (!bot)
        throw new Error("Falta el número del bot");
    return bot.collection("respuestas_info");
};
const statsRef = (req) => {
    const bot = botRef(req);
    if (!bot)
        throw new Error("Falta el número del bot");
    return bot.collection("stats");
};
const noEntRef = (req) => {
    const bot = botRef(req);
    if (!bot)
        throw new Error("Falta el número del bot");
    return bot.collection("mensajes_no_entendidos");
};
// ══════════════════════════════════════════════════════════════════════════════
// Auth — token en memoria (válido hasta reinicio del proceso)
// ══════════════════════════════════════════════════════════════════════════════
const activeSessions = new Set();
/** Middleware que protege todas las rutas a excepción de /login */
export function requireAuth(req, res, next) {
    const token = req.headers["x-admin-token"];
    if (token && activeSessions.has(token)) {
        next();
        return;
    }
    res.status(401).json({ ok: false, error: "No autenticado" });
}
// ── POST /login ───────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) {
            res.status(400).json({ ok: false, error: "Falta password" });
            return;
        }
        const botId = req.headers["x-bot-id"];
        const master = process.env.ADMIN_PASSWORD;
        let botPassword;
        if (botId) {
            const snap = await db.collection("bots").doc(botId).get();
            botPassword = snap.data()?.password;
        }
        if (!master && !botPassword) {
            res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
            return;
        }
        if (password !== master && (!botPassword || password !== botPassword)) {
            res.status(401).json({ ok: false, error: "Contraseña incorrecta" });
            return;
        }
        const token = randomUUID();
        activeSessions.add(token);
        res.json({ ok: true, token });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// ── POST /logout ──────────────────────────────────────────────────────────────
router.post("/logout", (req, res) => {
    const token = req.headers["x-admin-token"];
    if (token)
        activeSessions.delete(token);
    res.json({ ok: true });
});
// ══════════════════════════════════════════════════════════════════════════════
// A partir de aquí todas las rutas requieren auth
// ══════════════════════════════════════════════════════════════════════════════
router.use(requireAuth);
// ── GET /stats ─────────────────────────────────────────────────────────────────
router.get("/stats", async (req, res) => {
    try {
        const bot = botRef(req);
        if (!bot) {
            res.status(400).json({ ok: false, error: "Falta el número del bot" });
            return;
        }
        const snap = await bot.collection("estadisticas").doc("resumen").get();
        if (!snap.exists) {
            res.json({ ok: true, data: null });
            return;
        }
        res.json({ ok: true, data: snap.data() });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// respuestas_info
// ══════════════════════════════════════════════════════════════════════════════
router.get("/respuestas-info", async (req, res) => {
    try {
        const bot = botRef(req);
        if (!bot) {
            res.status(400).json({ ok: false, error: "Falta el número del bot" });
            return;
        }
        const snap = await infoRef(req).get();
        const data = {};
        snap.forEach((doc) => {
            data[doc.id] = { id: doc.id, ...doc.data() };
        });
        res.json({ ok: true, data });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.post("/respuestas-info", async (req, res) => {
    try {
        const { id, texto, activo } = req.body;
        if (!id || !texto) {
            res.status(400).json({
                ok: false,
                error: "Faltan campos obligatorios: id, texto",
            });
            return;
        }
        const payload = {
            texto,
            activo: activo ?? true,
        };
        await infoRef(req).doc(id).set(payload);
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.put("/respuestas-info/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { texto, activo } = req.body;
        const updates = {};
        if (texto !== undefined)
            updates.texto = texto;
        if (activo !== undefined)
            updates.activo = activo;
        await infoRef(req).doc(id).update(updates);
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.delete("/respuestas-info/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await infoRef(req).doc(id).delete();
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// mensajes_no_entendidos
// ══════════════════════════════════════════════════════════════════════════════
router.get("/no-entendidos", async (req, res) => {
    try {
        const snap = await noEntRef(req).orderBy("timestamp", "desc").limit(200).get();
        const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        res.json({ ok: true, data });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.patch("/no-entendidos/:id/revisado", async (req, res) => {
    try {
        const { id } = req.params;
        await noEntRef(req).doc(id).update({ revisado: true });
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.delete("/no-entendidos/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await noEntRef(req).doc(id).delete();
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// sessions
// ══════════════════════════════════════════════════════════════════════════════
const sessionsRef = (req) => {
    const bot = botRef(req);
    if (!bot)
        throw new Error("Falta el número del bot");
    return bot.collection("sessions");
};
// GET /sessions — listar todas las sesiones
router.get("/sessions", async (req, res) => {
    try {
        const snap = await sessionsRef(req).orderBy("last_interaction", "desc").limit(200).get();
        const data = snap.docs.map((d) => ({ id: d.id, phone: d.id, ...d.data() }));
        res.json({ ok: true, data });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// PATCH /sessions/:phone/status — cambiar status bot ↔ human
router.patch("/sessions/:phone/status", async (req, res) => {
    try {
        const { phone } = req.params;
        const { status } = req.body;
        if (!["bot", "human"].includes(status)) {
            res.status(400).json({ ok: false, error: "status debe ser 'bot' o 'human'" });
            return;
        }
        const update = { status, updated_at: Date.now() };
        if (status === "human")
            update.human_since = Math.floor(Date.now() / 1000);
        else {
            update.human_since = null;
        }
        await sessionsRef(req).doc(phone).update(update);
        res.json({ ok: true, phone, status });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// DELETE /sessions/:phone — eliminar sesión
router.delete("/sessions/:phone", async (req, res) => {
    try {
        const { phone } = req.params;
        await sessionsRef(req).doc(phone).delete();
        res.json({ ok: true, phone });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
export default router;
//# sourceMappingURL=routes.js.map