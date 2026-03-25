import { Router } from "express";
import { randomUUID } from "node:crypto";
import { db, BOT_PHONE_NUMBER } from "../config/firebase.js";
import { seendMessageController } from "./WhatsappController.js";
import { validateApiKey } from "../middlewares/authWhatsapp.js";
const router = Router();
router.post("/send-message", validateApiKey, seendMessageController);
const botRef = () => db.collection("bots").doc(BOT_PHONE_NUMBER);
const infoRef = () => botRef().collection("respuestas_info");
const noEntRef = () => botRef().collection("mensajes_no_entendidos");
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
        const snap = await botRef().get();
        const stored = snap.data()?.password;
        if (!stored || stored !== password) {
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
router.get("/stats", async (_req, res) => {
    try {
        const snap = await botRef().collection("estadisticas").doc("resumen").get();
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
router.get("/respuestas-info", async (_req, res) => {
    try {
        const snap = await infoRef().get();
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
        const { id, texto, descripcion_ia, activo, requiere_horario } = req.body;
        if (!id || !texto || !descripcion_ia) {
            res.status(400).json({
                ok: false,
                error: "Faltan campos obligatorios: id, texto, descripcion_ia",
            });
            return;
        }
        const payload = {
            texto,
            descripcion_ia,
            activo: activo ?? true,
            requiere_horario: requiere_horario ?? false,
        };
        await infoRef().doc(id).set(payload);
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.put("/respuestas-info/:id", async (req, res) => {
    try {
        const { id } = req.params;
        const { texto, descripcion_ia, activo, requiere_horario } = req.body;
        const updates = {};
        if (texto !== undefined)
            updates.texto = texto;
        if (descripcion_ia !== undefined)
            updates.descripcion_ia = descripcion_ia;
        if (activo !== undefined)
            updates.activo = activo;
        if (requiere_horario !== undefined)
            updates.requiere_horario = requiere_horario;
        await infoRef().doc(id).update(updates);
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.delete("/respuestas-info/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await infoRef().doc(id).delete();
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
// ══════════════════════════════════════════════════════════════════════════════
// mensajes_no_entendidos
// ══════════════════════════════════════════════════════════════════════════════
router.get("/no-entendidos", async (_req, res) => {
    try {
        const snap = await noEntRef().orderBy("timestamp", "desc").limit(200).get();
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
        await noEntRef().doc(id).update({ revisado: true });
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
router.delete("/no-entendidos/:id", async (req, res) => {
    try {
        const { id } = req.params;
        await noEntRef().doc(id).delete();
        res.json({ ok: true, id });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
export default router;
//# sourceMappingURL=routes.js.map