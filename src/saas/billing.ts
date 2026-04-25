/**
 * billing.ts — Sistema de facturación por usuario
 */

import { Router } from "express";
import type { Request, Response } from "express";
import { db } from "../config/firebase.js";
import {
  requireFirebaseAuth,
  requireAdminRole,
} from "../admin/routes.js";
import { subscriptionService } from "../services/subscriptionService.js";
import type { BankAccount } from "../models/BankAccount.js";

const router = Router();

const usersCol    = () => db.collection("users");
const userSubsCol = () => db.collection("user_subscription_requests");
const txCol       = () => db.collection("transactions");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * GET /api/saas/billing/me
 * Devuelve el plan actual del usuario y sus solicitudes pendientes.
 */
router.get("/me", requireFirebaseAuth, async (req: Request, res: Response) => {
  try {
    const uid = req.firebaseUid!;
    const userSub = await subscriptionService.getUserSubscription(uid);
    const planInfo = await subscriptionService.getPlanInfo(userSub.planId);

    // Buscar si hay una solicitud pendiente
    const reqSnap = await userSubsCol().doc(uid).get();
    const pendingRequest = reqSnap.exists ? reqSnap.data() : null;

    res.json({
      ok: true,
      subscription: userSub,
      plan: planInfo,
      pendingRequest
    });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * POST /api/saas/billing/request
 * El usuario solicita mejorar su plan.
 * Body: { planId: 'pro' | 'premium' }
 */
router.post(
  "/request",
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const uid = req.firebaseUid!;
      const { planId, referenceNumber, receiptUrl } = req.body as { planId?: string; referenceNumber?: string; receiptUrl?: string };

      if (!planId) {
        return res.status(400).json({ ok: false, error: "planId inválido" });
      }
      if (!referenceNumber || !receiptUrl) {
        return res.status(400).json({ ok: false, error: "Referencia y comprobante son requeridos" });
      }

      const plan = await subscriptionService.getPlanInfo(planId);
      if (!plan || plan.id === "basic") {
        return res.status(400).json({ ok: false, error: "Plan inválido para solicitar" });
      }

      // Verificar que no haya una solicitud pendiente
      const subSnap = await userSubsCol().doc(uid).get();
      if (subSnap.exists && subSnap.data()?.status === "pending_approval") {
        return res.status(409).json({ ok: false, error: "Ya tienes una solicitud pendiente de aprobación" });
      }

      const userSnap = await usersCol().doc(uid).get();
      const userInfo = userSnap.data() ?? {};

      const payload = {
        uid,
        userEmail: userInfo.email ?? "",
        userName: userInfo.displayName ?? "",
        planId,
        amount: plan.price,
        referenceNumber,
        receiptUrl,
        status: "pending_approval",
        requestedAt: Date.now(),
        notes: "",
      };

      await userSubsCol().doc(uid).set(payload, { merge: true });

      res.json({ ok: true, message: "Solicitud enviada. El administrador la revisará pronto." });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * POST /api/saas/billing/cancel-request
 * El usuario cancela una solicitud pendiente.
 */
router.post(
  "/cancel-request",
  requireFirebaseAuth,
  async (req: Request, res: Response) => {
    try {
      const uid = req.firebaseUid!;

      const subSnap = await userSubsCol().doc(uid).get();
      if (!subSnap.exists) {
        return res.status(403).json({ ok: false, error: "Solicitud no encontrada" });
      }

      await userSubsCol().doc(uid).delete();
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
 * Lista todas las solicitudes pendientes o resueltas.
 */
router.get(
  "/admin/subscriptions",
  requireFirebaseAuth,
  requireAdminRole,
  async (_req: Request, res: Response) => {
    try {
      const snap = await userSubsCol().orderBy("requestedAt", "desc").get();
      const data = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      res.json({ ok: true, subscriptions: data });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * POST /api/saas/billing/admin/users/:uid/approve
 * Admin aprueba la solicitud de plan de un usuario.
 */
router.post(
  "/admin/users/:uid/approve",
  requireFirebaseAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    try {
      const adminUid = req.firebaseUid!;
      const uid = req.params.uid as string;
      const { notes = "" } = req.body as { notes?: string };
      const now = Date.now();

      const subSnap = await userSubsCol().doc(uid).get();
      if (!subSnap.exists || subSnap.data()?.status !== "pending_approval") {
        return res.status(404).json({ ok: false, error: "Solicitud pendiente no encontrada" });
      }
      const sub = subSnap.data()!;

      const durationMs = 30 * 24 * 60 * 60 * 1000; // 30 días
      const expiresAt = Math.floor((now + durationMs) / 1000);

      const userSubRef = usersCol().doc(uid);

      // 1. Actualizar usuario
      await userSubRef.update({
        subscription: {
          planId: sub.planId,
          status: "active",
          expiresAt
        }
      });

      // 2. Marcar request como aprobado
      await userSubsCol().doc(uid).update({
        status: "active",
        approvedAt: now,
        approvedBy: adminUid,
        notes
      });

      // 3. Crear transacción
      const txRef = txCol().doc();
      await txRef.set({
        txId: txRef.id,
        uid,
        userEmail: sub.userEmail,
        userName: sub.userName,
        planId: sub.planId,
        amount: sub.amount,
        status: "approved",
        approvedBy: adminUid,
        approvedAt: now,
        expiresAt: expiresAt * 1000,
        notes,
        requestedAt: sub.requestedAt,
      });

      res.json({ ok: true, message: "Suscripción aprobada" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * POST /api/saas/billing/admin/users/:uid/reject
 */
router.post(
  "/admin/users/:uid/reject",
  requireFirebaseAuth,
  requireAdminRole,
  async (req: Request, res: Response) => {
    try {
      const uid = req.params.uid as string;
      const { notes = "" } = req.body as { notes?: string };

      await userSubsCol().doc(uid).update({
        status: "rejected",
        rejectedAt: Date.now(),
        notes
      });

      res.json({ ok: true, message: "Solicitud rechazada" });
    } catch (e: any) {
      res.status(500).json({ ok: false, error: e.message });
    }
  }
);

/**
 * GET /api/saas/billing/admin/transactions
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

// ═══════════════════════════════════════════════════════════════════════════════
// Bank Accounts CRUD
// ═══════════════════════════════════════════════════════════════════════════════

const banksCol = () => db.collection("bank_accounts");

/** GET /api/saas/billing/banks */
router.get("/banks", requireFirebaseAuth, async (_req: Request, res: Response) => {
  try {
    const snap = await banksCol().get();
    const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as BankAccount));
    // Si no es admin, solo devolver las activas
    const isAdmin = (_req as any).isAdmin;
    const finalData = isAdmin ? data : data.filter(b => b.isActive);
    res.json({ ok: true, banks: finalData });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** POST /api/saas/billing/admin/banks */
router.post("/admin/banks", requireFirebaseAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { country, bankName, accountHolder, accountNumber, accountType, isActive } = req.body;
    const ref = banksCol().doc();
    const payload = {
      country: country || "",
      bankName: bankName || "",
      accountHolder: accountHolder || "",
      accountNumber: accountNumber || "",
      accountType: accountType || "",
      isActive: isActive !== false, // default true
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    await ref.set(payload);
    res.json({ ok: true, bank: { id: ref.id, ...payload } });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** PUT /api/saas/billing/admin/banks/:id */
router.put("/admin/banks/:id", requireFirebaseAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    const { country, bankName, accountHolder, accountNumber, accountType, isActive } = req.body;
    const updates: any = { updatedAt: Date.now() };
    if (country !== undefined) updates.country = country;
    if (bankName !== undefined) updates.bankName = bankName;
    if (accountHolder !== undefined) updates.accountHolder = accountHolder;
    if (accountNumber !== undefined) updates.accountNumber = accountNumber;
    if (accountType !== undefined) updates.accountType = accountType;
    if (isActive !== undefined) updates.isActive = isActive;

    await banksCol().doc(req.params.id as string).update(updates);
    res.json({ ok: true, message: "Cuenta actualizada" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/** DELETE /api/saas/billing/admin/banks/:id */
router.delete("/admin/banks/:id", requireFirebaseAuth, requireAdminRole, async (req: Request, res: Response) => {
  try {
    await banksCol().doc(req.params.id as string).delete();
    res.json({ ok: true, message: "Cuenta eliminada" });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Utility para verificar si un bot puede arrancar.
 */
export async function canBotStart(botId: string, uid: string): Promise<{ allowed: boolean; reason?: string }> {
  try {
    const sub = await subscriptionService.getUserSubscription(uid);
    if (sub.status === "active" && sub.expiresAt * 1000 > Date.now()) {
      return { allowed: true };
    }
    return { allowed: false, reason: "trial_expired" };
  } catch {
    return { allowed: false, reason: "error" };
  }
}

export default router;
