import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import admin from "firebase-admin";
import { db } from "../config/firebase.js";
import type { InfoRespuesta } from "../models/BotConfig.js";

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// User profile types
// ══════════════════════════════════════════════════════════════════════════════
export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  phone: string;
  role: "user" | "admin";
  status: "pending" | "approved" | "rejected";
  maxBots: number;
  createdAt: number;
  trialEndsAt: number;
  approvedAt?: number;
}

const usersCol = () => db.collection("users");

const botRef = (req: Request) => {
  const botId = (req.query.botId || req.body.botId || req.headers["x-bot-id"] || req.headers["x-client-botid"] || req.params.botId) as string;
  if (!botId) return null;
  return db.collection("bots").doc(botId);
};
const infoRef = (req: Request) => {
  const bot = botRef(req);
  if (!bot) throw new Error("Falta el número del bot");
  return bot.collection("respuestas_info");
};
const statsRef = (req: Request) => {
  const bot = botRef(req);
  if (!bot) throw new Error("Falta el número del bot");
  return bot.collection("stats");
};
const noEntRef = (req: Request) => {
  const bot = botRef(req);
  if (!bot) throw new Error("Falta el número del bot");
  return bot.collection("mensajes_no_entendidos");
};

// ══════════════════════════════════════════════════════════════════════════════
// Firebase Auth middleware
// ══════════════════════════════════════════════════════════════════════════════

declare global {
  namespace Express {
    interface Request {
      firebaseUid?: string;
      isAdmin?: boolean;
    }
  }
}

/**
 * Verifies the Firebase Bearer ID Token and attaches req.firebaseUid.
 * Also sets req.isAdmin = true when the user has role "admin" in Firestore.
 */
export async function requireFirebaseAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
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
    } catch {
      req.isAdmin = false;
    }
    next();
  } catch {
    res.status(401).json({ ok: false, error: "Token inválido o expirado" });
  }
}

/**
 * Verifies the Firebase user has role 'admin' in Firestore.
 */
export async function requireAdminRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  if (!req.firebaseUid) {
    res.status(401).json({ ok: false, error: "No autenticado" });
    return;
  }
  try {
    const snap = await usersCol().doc(req.firebaseUid).get();
    if (snap.exists && snap.data()?.role === "admin") {
      next();
    } else {
      res
        .status(403)
        .json({ ok: false, error: "No tienes permisos de administrador" });
    }
  } catch (e: any) {
    res.status(500).json({ ok: false, error: "Error verificando permisos" });
  }
}

// Legacy alias for bot-management routes still using requireAuth
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  requireFirebaseAuth(req, res, next);
}

// ══════════════════════════════════════════════════════════════════════════════
// Plans / Subscriptions (Public & Admin)
// ══════════════════════════════════════════════════════════════════════════════

router.get("/plans", async (_req, res) => {
  try {
    const snap = await db.collection("plans").get();
    const plans = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, plans });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.put(
  "/plans",
  requireFirebaseAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const { plans } = req.body as { plans: any[] };
      if (!Array.isArray(plans)) {
        return res.status(400).json({ ok: false, error: "Formato inválido" });
      }
      const batch = db.batch();
      for (const p of plans) {
        if (!p.id) continue;
        const ref = db.collection("plans").doc(p.id);
        const data = { ...p };
        delete data.id;
        batch.set(ref, data, { merge: true });
      }
      await batch.commit();
      res.json({ ok: true, plans });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },
);

// ══════════════════════════════════════════════════════════════════════════════
// Firebase user registration / profile endpoints
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/auth/firebase-verify
 * Verifica el ID Token de Firebase y crea/actualiza el perfil del usuario.
 * Si es nuevo, queda en estado 'pending'.
 */
router.post("/auth/firebase-verify", async (req, res) => {
  const { idToken, phone } = req.body as { idToken?: string; phone?: string };
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
      const TRIAL_DAYS = 7;
      const profile: UserProfile = {
        uid,
        email: decoded.email ?? "",
        displayName: decoded.name ?? "",
        phone: phone ?? "",
        role: "user",
        status: "pending",
        maxBots: 1,
        createdAt: Date.now(),
        trialEndsAt: Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000,
      };
      await userRef.set(profile);
      res.json({ ok: true, status: "pending", profile });
    } else {
      // Existing user — optionally update phone
      const existing = snap.data() as UserProfile;
      if (phone && !existing.phone) {
        await userRef.update({ phone });
        existing.phone = phone;
      }
      res.json({ ok: true, status: existing.status, profile: existing });
    }
  } catch (e: any) {
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
    res.json({ ok: true, profile: snap.data() as UserProfile });
  } catch (e: any) {
    res.status(401).json({ ok: false, error: "Token inválido" });
  }
});

/** GET /api/admin/users — lista todos los usuarios */
router.get(
  "/admin/users",
  requireFirebaseAuth,
  requireAdminRole,
  async (_req, res) => {
    try {
      const snap = await usersCol().orderBy("createdAt", "desc").get();
      res.json({ ok: true, users: snap.docs.map((d) => d.data()) });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },
);

/** POST /api/admin/users/:uid/approve */
router.post(
  "/admin/users/:uid/approve",
  requireFirebaseAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const uid = req.params["uid"] as string;
      await usersCol()
        .doc(uid)
        .update({ status: "approved", approvedAt: Date.now() });
      res.json({ ok: true, uid, status: "approved" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },
);

/** PATCH /api/admin/users/:uid/maxBots — admin sets how many bots a user can create */
router.patch(
  "/admin/users/:uid/maxBots",
  requireFirebaseAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const uid = req.params["uid"] as string;
      const { maxBots } = req.body as { maxBots?: number };
      if (typeof maxBots !== "number" || maxBots < 0) {
        res
          .status(400)
          .json({ ok: false, error: "maxBots debe ser un número >= 0" });
        return;
      }
      await usersCol().doc(uid).update({ maxBots });
      res.json({ ok: true, uid, maxBots });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },
);

/** POST /api/admin/users/:uid/reject */
router.post(
  "/admin/users/:uid/reject",
  requireFirebaseAuth,
  requireAdminRole,
  async (req, res) => {
    try {
      const uid = req.params["uid"] as string;
      await usersCol().doc(uid).update({ status: "rejected" });
      res.json({ ok: true, uid, status: "rejected" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  },
);

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
  } catch (e: any) {
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
    const data: Record<string, InfoRespuesta & { id: string }> = {};
    snap.forEach((doc) => {
      data[doc.id] = { id: doc.id, ...(doc.data() as InfoRespuesta) };
    });
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.post("/respuestas-info", async (req, res) => {
  try {
    const { id, texto, activo } = req.body as {
      id: string;
      texto: string;
      activo: boolean;
    };
    if (!id || !texto) {
      res.status(400).json({
        ok: false,
        error: "Faltan campos obligatorios: id, texto",
      });
      return;
    }
    const payload: InfoRespuesta = {
      texto,
      activo: activo ?? true,
    };
    await infoRef(req).doc(id).set(payload);
    res.json({ ok: true, id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.put("/respuestas-info/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { texto, activo } = req.body as Partial<InfoRespuesta>;
    const updates: Partial<InfoRespuesta> = {};
    if (texto !== undefined) updates.texto = texto;
    if (activo !== undefined) updates.activo = activo;
    await infoRef(req).doc(id).update(updates);
    res.json({ ok: true, id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete("/respuestas-info/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await infoRef(req).doc(id).delete();
    res.json({ ok: true, id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// mensajes_no_entendidos
// ══════════════════════════════════════════════════════════════════════════════

router.get("/no-entendidos", async (req, res) => {
  try {
    const snap = await noEntRef(req)
      .orderBy("timestamp", "desc")
      .limit(200)
      .get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.patch("/no-entendidos/:id/revisado", async (req, res) => {
  try {
    const { id } = req.params;
    await noEntRef(req).doc(id).update({ revisado: true });
    res.json({ ok: true, id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.delete("/no-entendidos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    await noEntRef(req).doc(id).delete();
    res.json({ ok: true, id });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// sessions
// ══════════════════════════════════════════════════════════════════════════════
const sessionsRef = (req: Request) => {
  const bot = botRef(req);
  if (!bot) throw new Error("Falta el número del bot");
  return bot.collection("sessions");
};

// GET /sessions — listar todas las sesiones
router.get("/sessions", async (req, res) => {
  try {
    const snap = await sessionsRef(req)
      .orderBy("last_interaction", "desc")
      .limit(200)
      .get();
    const data = snap.docs.map((d) => ({ id: d.id, phone: d.id, ...d.data() }));
    res.json({ ok: true, data });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PATCH /sessions/:phone/status — cambiar status bot ↔ human
router.patch("/sessions/:phone/status", async (req, res) => {
  try {
    const { phone } = req.params;
    const { status } = req.body as { status: "bot" | "human" };
    if (!["bot", "human"].includes(status)) {
      res
        .status(400)
        .json({ ok: false, error: "status debe ser 'bot' o 'human'" });
      return;
    }
    const update: Record<string, unknown> = { status, updated_at: Date.now() };
    if (status === "human") update.human_since = Math.floor(Date.now() / 1000);
    else {
      update.human_since = null;
    }
    await sessionsRef(req).doc(phone).update(update);
    res.json({ ok: true, phone, status });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DELETE /sessions/:phone — eliminar sesión
router.delete("/sessions/:phone", async (req, res) => {
  try {
    const { phone } = req.params;
    await sessionsRef(req).doc(phone).delete();
    res.json({ ok: true, phone });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

export default router;
