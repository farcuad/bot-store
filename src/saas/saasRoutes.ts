import { Router } from "express";
import type { Request, Response } from "express";
import QRCode from "qrcode";
import { botManager } from "./BotManager.js";
import { requireFirebaseAuth } from "../admin/routes.js";
import { db } from "../config/firebase.js";
import { createConfigService } from "../services/configService.js";
import { createSessionManager } from "../services/sessionManager.js";
import { createStatsManager } from "../services/statsManager.js";
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

// ── QR — SSE streaming (unauthenticated: EventSource can't set headers) ─────

/**
 * GET /api/saas/bots/:id/qr
 * Server-Sent Events: sends QR as a PNG data URL as soon as it is available.
 * Intentionally unauthenticated because the browser's native EventSource API
 * does not support custom headers (x-admin-token). The QR is only valid ~30s.
 */
router.get("/bots/:id/qr", (req: Request, res: Response) => {
  const id = req.params.id as string;
  const maybeInstance = botManager.getInstance(id);
  if (!maybeInstance) {
    res.status(404).json({ ok: false, error: "Bot not found" });
    return;
  }

  const instance = maybeInstance;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (payload: object) => {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  // Send current QR immediately if already available
  const currentQr = instance.getQR();
  if (currentQr) {
    toDataUrl(currentQr)
      .then((dataUrl) => send({ qr: dataUrl }))
      .catch(() => {});
  }

  const onQr = (qr: string) => {
    toDataUrl(qr)
      .then((dataUrl) => send({ qr: dataUrl }))
      .catch(() => {});
  };
  const onReady = () => {
    send({ ready: true });
    cleanup();
  };
  const onDisconnect = () => cleanup();

  function cleanup() {
    instance.off("qr", onQr);
    instance.off("ready", onReady);
    instance.off("disconnected", onDisconnect);
    res.end();
  }

  instance.on("qr", onQr);
  instance.on("ready", onReady);
  instance.on("disconnected", onDisconnect);
  req.on("close", cleanup);
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

/** DELETE /api/saas/bots/:id — remove bot */
router.delete("/bots/:id", async (req: Request, res: Response) => {
  const id = req.params.id as string;
  try {
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

export default router;
