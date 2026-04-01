import { Router } from "express";
import admin from "firebase-admin";
import { db } from "../config/firebase.js";
import { seendMessageController } from "./WhatsappController.js";
import { validateApiKey } from "../middlewares/authWhatsapp.js";
const router = Router();
const usersCol = () => db.collection("users");
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
/**
 * Verifies the Firebase Bearer ID Token and attaches req.firebaseUid.
 * Also sets req.isAdmin = true when the user has role "admin" in Firestore.
 */
export async function requireFirebaseAuth(req, res, next) {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ ok: false, error: "Token de Firebase requerido" });
        return;
    }
    const idToken = authHeader.slice(7);
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        req.firebaseUid = decoded.uid;
        // Check admin role (non-blocking: default false on error)
        try {
            const snap = await usersCol().doc(decoded.uid).get();
            req.isAdmin = snap.exists && snap.data()?.role === "admin";
        }
        catch {
            req.isAdmin = false;
        }
        next();
    }
    catch {
        res.status(401).json({ ok: false, error: "Token inválido o expirado" });
    }
}
/**
 * Verifies the Firebase user has role 'admin' in Firestore.
 */
export async function requireAdminRole(req, res, next) {
    if (!req.firebaseUid) {
        res.status(401).json({ ok: false, error: "No autenticado" });
        return;
    }
    try {
        const snap = await usersCol().doc(req.firebaseUid).get();
        if (snap.exists && snap.data()?.role === "admin") {
            next();
        }
        else {
            res.status(403).json({ ok: false, error: "No tienes permisos de administrador" });
        }
    }
    catch (e) {
        res.status(500).json({ ok: false, error: "Error verificando permisos" });
    }
}
// Legacy alias for bot-management routes still using requireAuth
export function requireAuth(req, res, next) {
    requireFirebaseAuth(req, res, next);
}
// ══════════════════════════════════════════════════════════════════════════════
// Firebase user registration / profile endpoints
// ══════════════════════════════════════════════════════════════════════════════
/**
 * POST /api/auth/firebase-verify
 * Verifica el ID Token de Firebase y crea/actualiza el perfil del usuario.
 * Si es nuevo, queda en estado 'pending'.
 */
router.post("/auth/firebase-verify", async (req, res) => {
    const { idToken, phone } = req.body;
    if (!idToken) {
        res.status(400).json({ ok: false, error: "idToken requerido" });
        return;
    }
    try {
        const decoded = await admin.auth().verifyIdToken(idToken);
        const uid = decoded.uid;
        const userRef = usersCol().doc(uid);
        const snap = await userRef.get();
        if (!snap.exists) {
            // New user — create with pending status, default role and bot limit
            const profile = {
                uid,
                email: decoded.email ?? "",
                displayName: decoded.name ?? "",
                phone: phone ?? "",
                role: "user",
                status: "pending",
                maxBots: 1,
                createdAt: Date.now(),
            };
            await userRef.set(profile);
            res.json({ ok: true, status: "pending", profile });
        }
        else {
            // Existing user — optionally update phone
            const existing = snap.data();
            if (phone && !existing.phone) {
                await userRef.update({ phone });
                existing.phone = phone;
            }
            res.json({ ok: true, status: existing.status, profile: existing });
        }
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
/**
 * GET /api/auth/me
 * Retorna el perfil del usuario autenticado vía Firebase ID Token.
 */
router.get("/auth/me", async (req, res) => {
    const authHeader = req.headers["authorization"];
    if (!authHeader?.startsWith("Bearer ")) {
        res.status(401).json({ ok: false, error: "Token requerido" });
        return;
    }
    try {
        const decoded = await admin.auth().verifyIdToken(authHeader.slice(7));
        const snap = await usersCol().doc(decoded.uid).get();
        if (!snap.exists) {
            res.status(404).json({ ok: false, error: "Usuario no registrado" });
            return;
        }
        res.json({ ok: true, profile: snap.data() });
    }
    catch (e) {
        res.status(401).json({ ok: false, error: "Token inválido" });
    }
});
/** GET /api/admin/users — lista todos los usuarios */
router.get("/admin/users", requireFirebaseAuth, requireAdminRole, async (_req, res) => {
    try {
        const snap = await usersCol().orderBy("createdAt", "desc").get();
        res.json({ ok: true, users: snap.docs.map(d => d.data()) });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
/** POST /api/admin/users/:uid/approve */
router.post("/admin/users/:uid/approve", requireFirebaseAuth, requireAdminRole, async (req, res) => {
    try {
        const uid = req.params["uid"];
        await usersCol().doc(uid).update({ status: "approved", approvedAt: Date.now() });
        res.json({ ok: true, uid, status: "approved" });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
/** PATCH /api/admin/users/:uid/maxBots — admin sets how many bots a user can create */
router.patch("/admin/users/:uid/maxBots", requireFirebaseAuth, requireAdminRole, async (req, res) => {
    try {
        const uid = req.params["uid"];
        const { maxBots } = req.body;
        if (typeof maxBots !== "number" || maxBots < 0) {
            res.status(400).json({ ok: false, error: "maxBots debe ser un número >= 0" });
            return;
        }
        await usersCol().doc(uid).update({ maxBots });
        res.json({ ok: true, uid, maxBots });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
});
/** POST /api/admin/users/:uid/reject */
router.post("/admin/users/:uid/reject", requireFirebaseAuth, requireAdminRole, async (req, res) => {
    try {
        const uid = req.params["uid"];
        await usersCol().doc(uid).update({ status: "rejected" });
        res.json({ ok: true, uid, status: "rejected" });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: e.message });
    }
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