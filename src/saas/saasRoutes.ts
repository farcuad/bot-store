import { Router } from "express";
import type { Request, Response } from "express";
import QRCode from "qrcode";
import { botManager } from "./BotManager.js";
import { requireFirebaseAuth } from "../admin/routes.js";
import { db } from "../config/firebase.js";
import { createConfigService } from "../services/configService.js";
import { createSessionManager } from "../services/sessionManager.js";
import { createStatsManager } from "../services/statsManager.js";
import { createBotLogger } from "../services/botLogger.js";
import type { UserProfile } from "../admin/routes.js";

const router = Router();

// ── Helper ────────────────────────────────────────────────────────────────────

function ok(res: Response, data: unknown) {
  return res.json({ ok: true, data });
}

function fail(res: Response, status: number, message: string) {
  return res.status(status).json({ ok: false, error: message });
}

/** Convert raw QR text → PNG data URL */
async function toDataUrl(qr: string): Promise<string> {
  return QRCode.toDataURL(qr, { width: 220, margin: 2 });
}

// ── QR Polling endpoint ────────────────────────────────────────────────────────

/**
 * GET /api/saas/bots/:id/qr
 * Polled by frontend every 3s to get the latest QR or status.
 */
router.get("/bots/:id/qr", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const instance = botManager.getInstance(id);
  
  if (!instance) {
    res.status(404).json({ ok: false, error: "Bot not found" });
    return;
  }

  const status = instance.getState().status;
  const currentQr = instance.getQR();

  if (status === "ready") {
    res.json({ ok: true, status: "ready" });
    return;
  }

  if (currentQr) {
    try {
      const dataUrl = await toDataUrl(currentQr);
      res.json({ ok: true, status, qr: dataUrl });
      return;
    } catch {
      // Ignore generation errors
    }
  }

  res.json({ ok: true, status });
});

// All other SaaS routes require Firebase authentication (or admin token)
router.use(requireFirebaseAuth);

// Middleware to check approved status for non-admins
router.use(async (req: Request, res: Response, next) => {
  if (req.isAdmin) {
    next();
    return;
  }
  const uid = req.firebaseUid!;
  try {
    const snap = await db.collection("users").doc(uid).get();
    const profile = snap.data() as UserProfile | undefined;
    if (!profile || profile.status !== "approved") {
      res
        .status(403)
        .json({ ok: false, error: "Cuenta pendiente de aprobación" });
      return;
    }
    next();
  } catch {
    res
      .status(500)
      .json({ ok: false, error: "Error verificando estado de cuenta" });
  }
});

// ── Bot CRUD ──────────────────────────────────────────────────────────────────

/** POST /api/saas/bots — create new bot */
router.post("/bots", async (req: Request, res: Response) => {
  const { nombre, password } = req.body as {
    nombre?: string;
    password?: string;
  };
  if (!nombre) return fail(res, 400, "nombre is required");
  const ownerUid = req.isAdmin
    ? (req.body.ownerUid ?? "admin")
    : req.firebaseUid!;

  // ── Enforce per-user bot limit (skip for admins creating their own bots) ────
  if (!req.isAdmin) {
    try {
      const userSnap = await db.collection("users").doc(ownerUid).get();
      const maxBots: number = userSnap.exists
        ? (userSnap.data()?.maxBots ?? 1)
        : 1;
      const currentBots = await botManager.listBots(ownerUid);
      if (currentBots.length >= maxBots) {
        return fail(res, 403, `Límite de bots alcanzado (máximo: ${maxBots})`);
      }
    } catch (e: any) {
      return fail(res, 500, "Error verificando límite de bots: " + e.message);
    }
  }
  // ────────────────────────────────────────────────────────────────────────────

  try {
    const record = await botManager.createBot({ nombre, ownerUid });
    return ok(res, record);
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** GET /api/saas/bots — list bots (filtered by owner unless admin, or admin passes ?onlyMine=true) */
router.get("/bots", async (req: Request, res: Response) => {
  try {
    const ownerUid = req.isAdmin ? undefined : req.firebaseUid;
    const bots = await botManager.listBots(ownerUid);
    return ok(res, bots);
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** GET /api/saas/bots/:id — get one bot state */
router.get("/bots/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const bot = await botManager.getBot(id);
    if (!bot) return fail(res, 404, "Bot not found");
    return ok(res, bot);
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** PUT /api/saas/bots/:id/name — rename bot */
router.put("/bots/:id/name", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { nombre } = req.body;
  if (!nombre) return fail(res, 400, "nombre is required");
  
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }
    await botManager.renameBot(id, nombre);
    return ok(res, { updated: id, nombre });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** DELETE /api/saas/bots/:id — remove bot */
router.delete("/bots/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }
    await botManager.deleteBot(id);
    return ok(res, { deleted: id });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Lifecycle ─────────────────────────────────────────────────────────────────

/** POST /api/saas/bots/:id/start */
router.post("/bots/:id/start", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    // Admins siempre pueden iniciar bots
    if (!req.isAdmin) {
      const uid = req.firebaseUid!;
      const { canBotStart } = await import("./billing.js");
      const check = await canBotStart(id, uid);
      if (!check.allowed) {
        const msg =
          check.reason === "pending_approval"
            ? "Tu solicitud de suscripción está pendiente de aprobación."
            : "trial_expired";
        return fail(res, 402, msg);
      }
    }
    await botManager.startBot(id);
    return ok(res, { started: id });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** POST /api/saas/bots/:id/stop */
router.post("/bots/:id/stop", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    await botManager.stopBot(id);
    return ok(res, { stopped: id });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** POST /api/saas/bots/:id/restart */
router.post("/bots/:id/restart", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    await botManager.restartBot(id);
    return ok(res, { restarted: id });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** POST /api/saas/bots/:id/clear-session
 *  Stops the bot, removes the Chrome session directory so the user can re-scan the QR.
 *  The bot record in Firestore (config, KB, sessions) is kept intact.
 */
router.post("/bots/:id/clear-session", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }
    await botManager.clearSession(id);
    return ok(res, { cleared: id });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Stats ─────────────────────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/stats */
router.get("/bots/:id/stats", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const statsMgr = createStatsManager(id);
    await statsMgr.loadStats();
    return ok(res, statsMgr.getStats());
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Audio Settings ────────────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/audio-settings */
router.get("/bots/:id/audio-settings", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }

    const doc = await db.collection("bots").doc(id).get();
    const data = doc.data() ?? {};
    const rawKey = (data.openaiApiKey as string) || "";
    // Mask the key for the frontend: show first 7 chars + ****
    const maskedKey = rawKey
      ? rawKey.slice(0, 7) + "••••" + rawKey.slice(-4)
      : "";

    return ok(res, {
      audioAnalysisEnabled: data.audioAnalysisEnabled === true,
      openaiApiKey: maskedKey,
      hasKey: !!rawKey,
    });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** PUT /api/saas/bots/:id/audio-settings */
router.put("/bots/:id/audio-settings", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const { audioAnalysisEnabled, openaiApiKey } = req.body as {
    audioAnalysisEnabled?: boolean;
    openaiApiKey?: string;
  };

  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }

    const updates: Record<string, any> = {};
    if (audioAnalysisEnabled !== undefined) {
      updates.audioAnalysisEnabled = audioAnalysisEnabled;
    }
    if (openaiApiKey !== undefined) {
      updates.openaiApiKey = openaiApiKey;
    }

    await db.collection("bots").doc(id).set(updates, { merge: true });
    return ok(res, { updated: id });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Export / Import ───────────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/export
 *  Returns a JSON bundle with all config (respuestas_info + prompt) that can be
 *  re-imported into another bot.
 */
router.get("/bots/:id/export", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }

    const configSvc = createConfigService(id);
    await configSvc.loadConfig();
    const config = configSvc.getConfig();

    // Fetch KB entries from Firestore
    const kbSnap = await db.collection('bots').doc(id).collection('respuestas_info').get();
    const respuestasInfo: Record<string, any> = {};
    kbSnap.forEach(doc => { respuestasInfo[doc.id] = { id: doc.id, ...doc.data() }; });

    const bundle = {
      exportedAt: new Date().toISOString(),
      botName: orig.nombre,
      respuestasInfo,
      respuestasSistema: config.respuestas_sistema,
      promptIa: config.prompt_ia,
    };

    res.setHeader('Content-Disposition', `attachment; filename="${id}-export.json"`);
    res.setHeader('Content-Type', 'application/json');
    return res.json(bundle);
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** POST /api/saas/bots/:id/import
 *  Accepts a JSON export bundle and loads it into the target bot.
 *  Merges KB entries and updates the prompt; does not touch sessions or stats.
 */
router.post("/bots/:id/import", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }

    const bundle = req.body as {
      respuestasInfo?: Record<string, { texto: string; activo?: boolean }>;
      promptIa?: string;
    };

    if (!bundle || typeof bundle !== 'object') {
      return fail(res, 400, "Cuerpo JSON inválido");
    }

    // Import KB entries
    if (bundle.respuestasInfo && typeof bundle.respuestasInfo === 'object') {
      const batch = db.batch();
      for (const [key, entry] of Object.entries(bundle.respuestasInfo)) {
        const ref = db.collection('bots').doc(id).collection('respuestas_info').doc(key);
        batch.set(ref, { texto: entry.texto, activo: entry.activo ?? true });
      }
      await batch.commit();
    }

    // Import prompt_ia if included
    if (bundle.promptIa) {
      await db.collection('bots').doc(id).set({ prompt_ia: bundle.promptIa }, { merge: true });
    }

    return ok(res, { imported: id, kbEntries: Object.keys(bundle.respuestasInfo ?? {}).length });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Sessions ──────────────────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/sessions */
router.get("/bots/:id/sessions", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const sessionMgr = createSessionManager(id);
    const sessions = await sessionMgr.listSessions();
    return ok(res, sessions);
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** PATCH /api/saas/bots/:id/sessions/:sessionId */
router.patch("/bots/:id/sessions/:sessionId", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const sessionId = req.params.sessionId as string;
  const { estado, contactName } = req.body;
  
  try {
    const sessionMgr = createSessionManager(id);
    const session = await sessionMgr.getSession(sessionId);
    
    if (!session) {
      return fail(res, 404, "Sesión no encontrada");
    }

    if (estado !== undefined) {
      session.status = estado === 'bot' ? 'bot' : 'human';
      if (estado === 'human') {
         session.human_since = Math.floor(Date.now() / 1000);
      } else {
         session.human_since = undefined;
      }
    }
    
    if (contactName !== undefined) {
      session.contactName = contactName;
    }
    
    await sessionMgr.saveSession(sessionId, session);
    return ok(res, { id: sessionId, status: session.status, contactName: session.contactName });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** DELETE /api/saas/bots/:id/sessions/:sessionId
 *  Removes a contact's session from Firestore.
 *  When they write again the bot will create a fresh session.
 */
router.delete("/bots/:id/sessions/:sessionId", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const sessionId = req.params.sessionId as string;
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }
    await db
      .collection("bots")
      .doc(id)
      .collection("sessions")
      .doc(decodeURIComponent(sessionId))
      .delete();
    return ok(res, { deleted: sessionId });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Config ────────────────────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/config */
router.get("/bots/:id/config", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const configSvc = createConfigService(id);
    await configSvc.loadConfig();
    return ok(res, configSvc.getConfig());
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── No Entendidos ─────────────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/no-entendidos */
router.get("/bots/:id/no-entendidos", async (req, res) => {
  const id = req.params.id as string;
  try {
    const snap = await db
      .collection("bots")
      .doc(id)
      .collection("mensajes_no_entendidos")
      .orderBy("timestamp", "desc")
      .limit(200)
      .get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return ok(res, data);
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** PATCH /api/saas/bots/:id/no-entendidos/:mid/revisado */
router.patch("/bots/:id/no-entendidos/:mid/revisado", async (req, res) => {
  const { id, mid } = req.params;
  try {
    await db
      .collection("bots")
      .doc(id)
      .collection("mensajes_no_entendidos")
      .doc(mid)
      .update({ revisado: true });
    return ok(res, { id: mid, revisado: true });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** DELETE /api/saas/bots/:id/no-entendidos/:mid */
router.delete("/bots/:id/no-entendidos/:mid", async (req, res) => {
  const { id, mid } = req.params;
  try {
    await db
      .collection("bots")
      .doc(id)
      .collection("mensajes_no_entendidos")
      .doc(mid)
      .delete();
    return ok(res, { id: mid });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Respuestas Info (KB) ──────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/respuestas-info */
router.get("/bots/:id/respuestas-info", async (req, res) => {
  const id = req.params.id as string;
  try {
    const snap = await db
      .collection("bots")
      .doc(id)
      .collection("respuestas_info")
      .get();
    const data: Record<string, any> = {};
    snap.forEach((doc) => {
      data[doc.id] = { id: doc.id, ...doc.data() };
    });
    return ok(res, data);
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** POST /api/saas/bots/:id/respuestas-info */
router.post("/bots/:id/respuestas-info", async (req, res) => {
  const id = req.params.id as string;
  const { rid, texto, activo } = req.body as {
    rid: string;
    texto: string;
    activo: boolean;
  };
  if (!rid || !texto) return fail(res, 400, "Faltan campos: rid, texto");
  try {
    await db
      .collection("bots")
      .doc(id)
      .collection("respuestas_info")
      .doc(rid)
      .set({ texto, activo: activo ?? true });
    return ok(res, { id: rid });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** PUT /api/saas/bots/:id/respuestas-info/:rid */
router.put("/bots/:id/respuestas-info/:rid", async (req, res) => {
  const { id, rid } = req.params;
  const { texto, activo } = req.body;
  try {
    const updates: any = {};
    if (texto !== undefined) updates.texto = texto;
    if (activo !== undefined) updates.activo = activo;
    await db
      .collection("bots")
      .doc(id)
      .collection("respuestas_info")
      .doc(rid)
      .update(updates);
    return ok(res, { id: rid });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** DELETE /api/saas/bots/:id/respuestas-info/:rid */
router.delete("/bots/:id/respuestas-info/:rid", async (req, res) => {
  const { id, rid } = req.params;
  try {
    await db
      .collection("bots")
      .doc(id)
      .collection("respuestas_info")
      .doc(rid)
      .delete();
    return ok(res, { id: rid });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

// ── Logs ──────────────────────────────────────────────────────────────────────

/** GET /api/saas/bots/:id/logs
 *  Returns the last 500 lines of the bot's activity log file.
 */
router.get("/bots/:id/logs", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");
    if (!req.isAdmin && orig.ownerUid !== req.firebaseUid) {
      return fail(res, 403, "No autorizado");
    }

    const logger = createBotLogger(id);
    const lines = logger.readLogs(500);
    const size = logger.size();
    return ok(res, { lines, size });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

/** DELETE /api/saas/bots/:id/logs
 *  Clears the bot's log file. Admin only.
 */
router.delete("/bots/:id/logs", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  if (!req.isAdmin) {
    return fail(res, 403, "Solo los administradores pueden limpiar los logs");
  }
  try {
    const orig = await botManager.getBot(id);
    if (!orig) return fail(res, 404, "Bot not found");

    const logger = createBotLogger(id);
    logger.clearLogs();
    return ok(res, { cleared: id });
  } catch (e: any) {
    return fail(res, 500, e.message);
  }
});

export default router;

