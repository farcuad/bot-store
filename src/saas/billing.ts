/**
 * billing.ts — Sistema de facturación por bot
 *
 * Modelo:
 *  - users/{uid}.trialEndsAt  → 15 días desde creación de la cuenta
 *  - bot_subscriptions/{botId} → suscripción individual por bot
 *  - transactions/{txId}       → histórico de pagos aprobados
 *
 * Un bot puede arrancar si:
 *   a) La cuenta está en período de prueba  (now < user.trialEndsAt), O
 *   b) El bot tiene suscripción activa       (sub.status==='active' && sub.expiresAt > now)
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../config/firebase.js";
import {
  requireFirebaseAuth,
  requireAdminRole,
} from "../admin/routes.js";

const router = Router();

// ── Colecciones ───────────────────────────────────────────────────────────────
const usersCol    = () => db.collection("users");
const botSubsCol  = () => db.collection("bot_subscriptions");
const txCol       = () => db.collection("transactions");
const botsCol     = () => db.collection("platform").doc("bots").collection("registry");

// ── Precios ───────────────────────────────────────────────────────────────────
const PLANS = {
  monthly: { label: "Mensual",  amount: 30,  durationDays: 30  },
  annual:  { label: "Anual",    amount: 270, durationDays: 365 },
} as const;

type PlanKey = keyof typeof PLANS;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Retorna el estado de suscripción efectivo para un bot en un instante dado */
async function getBotBillingState(botId: string, uid: string, now: number) {
  // 1. Estado de la cuenta (trial)
  const userSnap = await usersCol().doc(uid).get();
  const userData = userSnap.data() ?? {};
  const trialEndsAt: number = userData.trialEndsAt ?? 0;
  const trialActive = now < trialEndsAt;
  const trialDaysLeft = trialActive
    ? Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24))
    : 0;

  // 2. Suscripción individual del bot
  const subSnap = await botSubsCol().doc(botId).get();
  const sub = subSnap.exists ? subSnap.data()! : null;
  const subActive =
    sub?.status === "active" && sub?.expiresAt > now;

  return { trialActive, trialDaysLeft, trialEndsAt, sub, subActive };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Rutas de USUARIO
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/saas/billing/me
 * Devuelve estado del trial de la cuenta + suscripciones de todos sus bots.
 */
router.get("/me", requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.firebaseUid!;
    const now = Date.now();

    // Datos de la cuenta
    const userSnap = await usersCol().doc(uid).get();
    if (!userSnap.exists) {
      res.status(404).json({ ok: false, error: "Usuario no encontrado" });
      return;
    }
    const userData = userSnap.data()!;
    const trialEndsAt: number = userData.trialEndsAt ?? 0;
    const trialActive = now < trialEndsAt;
    const trialDaysLeft = trialActive
      ? Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24))
      : 0;

    // Suscripciones de los bots del usuario
    const subsSnap = await botSubsCol().where("uid", "==", uid).get();
    const subscriptions = subsSnap.docs.map((d) => ({
      botId: d.id,
      ...d.data(),
      isActive: d.data().status === "active" && d.data().expiresAt > now,
    }));

    res.json({
      ok: true,
      trial: { active: trialActive, daysLeft: trialDaysLeft, endsAt: trialEndsAt },
      subscriptions,
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/saas/billing/bots/:botId/request
 * El usuario solicita un plan para un bot específico.
 * Body: { plan: 'monthly' | 'annual' }
 */
router.post(
  "/bots/:botId/request",
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const uid = req.firebaseUid!;
      const botId = req.params.botId as string;
      const { plan } = req.body as { plan?: PlanKey };

      if (!plan || !PLANS[plan]) {
        res.status(400).json({ ok: false, error: "Plan inválido. Use 'monthly' o 'annual'" });
        return;
      }

      // Verificar que el bot pertenece al usuario
      const botSnap = await botsCol().doc(botId).get();
      if (!botSnap.exists || botSnap.data()?.uid !== uid) {
        res.status(403).json({ ok: false, error: "Bot no encontrado o no autorizado" });
        return;
      }

      // Verificar que no haya una solicitud pendiente o activa ya
      const subSnap = await botSubsCol().doc(botId).get();
      if (subSnap.exists) {
        const sub = subSnap.data()!;
        if (sub.status === "pending_approval") {
          res.status(409).json({ ok: false, error: "Ya tienes una solicitud pendiente de aprobación" });
          return;
        }
        if (sub.status === "active" && sub.expiresAt > Date.now()) {
          res.status(409).json({ ok: false, error: "Este bot ya tiene una suscripción activa" });
          return;
        }
      }

      // Obtener datos del usuario para info legible en el panel admin
      const userSnap = await usersCol().doc(uid).get();
      const userInfo = userSnap.data() ?? {};

      const payload = {
        botId,
        uid,
        userEmail: userInfo.email ?? "",
        userName: userInfo.displayName ?? "",
        plan,
        amount: PLANS[plan].amount,
        status: "pending_approval",
        requestedAt: Date.now(),
        approvedAt: null,
        approvedBy: null,
        expiresAt: null,
        notes: "",
      };

      await botSubsCol().doc(botId).set(payload, { merge: true });

      res.json({ ok: true, message: "Solicitud enviada. El administrador la revisará pronto." });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * POST /api/saas/billing/bots/:botId/cancel-request
 * El usuario cancela una solicitud pendiente.
 */
router.post(
  "/bots/:botId/cancel-request",
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const uid = req.firebaseUid!;
      const botId = req.params.botId as string;

      const subSnap = await botSubsCol().doc(botId).get();
      if (!subSnap.exists || subSnap.data()?.uid !== uid) {
        res.status(403).json({ ok: false, error: "Solicitud no encontrada" });
        return;
      }
      if (subSnap.data()?.status !== "pending_approval") {
        res.status(400).json({ ok: false, error: "Solo se puede cancelar una solicitud pendiente" });
        return;
      }

      await botSubsCol().doc(botId).delete();
      res.json({ ok: true, message: "Solicitud cancelada" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

// ═══════════════════════════════════════════════════════════════════════════════
// Rutas de ADMINISTRADOR
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * GET /api/saas/billing/admin/subscriptions
 * Lista todas las suscripciones (activas, pendientes, expiradas).
 */
router.get(
  "/admin/subscriptions",
  requireFirebaseAuth,
  requireAdminRole,
  async (_req: Request, res: Response) => {
    try {
      const snap = await botSubsCol().orderBy("requestedAt", "desc").get();
      const now = Date.now();
      const data = snap.docs.map((d) => {
        const sub = d.data();
        return {
          id: d.id,
          ...sub,
          isActive: sub.status === "active" && sub.expiresAt > now,
        };
      });
      res.json({ ok: true, subscriptions: data });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * POST /api/saas/billing/admin/bots/:botId/approve
 * Admin aprueba una solicitud de suscripción. Crea la transacción.
 * Body: { notes?: string }
 */
router.post(
  "/admin/bots/:botId/approve",
  requireFirebaseAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    try {
      const adminUid = req.firebaseUid!;
      const botId = req.params.botId as string;
      const { notes = "" } = req.body as { notes?: string };
      const now = Date.now();

      const subSnap = await botSubsCol().doc(botId).get();
      if (!subSnap.exists) {
        res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
        return;
      }
      const sub = subSnap.data()!;
      if (sub.status !== "pending_approval") {
        res.status(400).json({ ok: false, error: "La solicitud no está pendiente" });
        return;
      }

      const plan = sub.plan as PlanKey;
      const durationMs = PLANS[plan].durationDays * 24 * 60 * 60 * 1000;

      // Si ya tenía suscripción activa, extender; si no, empezar desde ahora
      const baseTime = (sub.expiresAt && sub.expiresAt > now) ? sub.expiresAt : now;
      const expiresAt = baseTime + durationMs;

      // Actualizar suscripción del bot
      await botSubsCol().doc(botId).set({
        ...sub,
        status: "active",
        approvedAt: now,
        approvedBy: adminUid,
        expiresAt,
        notes,
      });

      // Crear transacción
      const txRef = txCol().doc();
      await txRef.set({
        txId: txRef.id,
        botId,
        uid: sub.uid,
        userEmail: sub.userEmail,
        userName: sub.userName,
        plan,
        amount: PLANS[plan].amount,
        status: "approved",
        approvedBy: adminUid,
        approvedAt: now,
        expiresAt,
        notes,
        requestedAt: sub.requestedAt,
      });

      res.json({
        ok: true,
        message: "Suscripción aprobada",
        expiresAt,
        txId: txRef.id,
      });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * POST /api/saas/billing/admin/bots/:botId/reject
 * Admin rechaza una solicitud.
 * Body: { notes?: string }
 */
router.post(
  "/admin/bots/:botId/reject",
  requireFirebaseAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    try {
      const botId = req.params.botId as string;
      const { notes = "" } = req.body as { notes?: string };

      const subSnap = await botSubsCol().doc(botId).get();
      if (!subSnap.exists) {
        res.status(404).json({ ok: false, error: "Solicitud no encontrada" });
        return;
      }
      if (subSnap.data()?.status !== "pending_approval") {
        res.status(400).json({ ok: false, error: "La solicitud no está pendiente" });
        return;
      }

      await botSubsCol().doc(botId).set(
        { status: "rejected", rejectedAt: Date.now(), notes },
        { merge: true }
      );

      res.json({ ok: true, message: "Solicitud rechazada" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * GET /api/saas/billing/admin/transactions
 * Lista todas las transacciones aprobadas.
 */
router.get(
  "/admin/transactions",
  requireFirebaseAuth,
  requireAdminRole,
  async (_req: Request, res: Response) => {
    try {
      const snap = await txCol().orderBy("approvedAt", "desc").get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, transactions: data });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * Utility exportada para verificar si un bot puede arrancar.
 * Usada en saasRoutes.ts antes de start().
 */
export async function canBotStart(botId: string, uid: string): Promise<{ allowed: boolean; reason?: string }> {
  const now = Date.now();
  const { trialActive, sub, subActive } = await getBotBillingState(botId, uid, now);

  if (trialActive) return { allowed: true };
  if (subActive)   return { allowed: true };

  if (sub?.status === "pending_approval") {
    return { allowed: false, reason: "pending_approval" };
  }
  return { allowed: false, reason: "trial_expired" };
}

export default router;
