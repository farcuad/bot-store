import { db } from "../config/firebase.js";
import type { PricingPlan, UserSubscription } from "../models/Plan.js";

class SubscriptionService {
  /**
   * Obtiene la información de un plan específico desde Firestore.
   */
  async getPlanInfo(planId: string): Promise<PricingPlan> {
    const doc = await db.collection("plans").doc(planId).get();
    if (doc.exists) {
      return { id: doc.id, ...doc.data() } as PricingPlan;
    }
    // Fallback if not found in DB
    console.warn(`Plan ${planId} no encontrado en la base de datos. Cayendo a fallback básico.`);
    return {
      id: "basic",
      name: "Basic",
      features: {
        audioTranscription: false,
        apiAccess: false,
        whatsappTemplates: false,
        maxBots: 1
      }
    };
  }

  /**
   * Obtiene la suscripción de un usuario (compañía).
   * Si no existe, asume un plan Básico por defecto (Trial).
   */
  async getUserSubscription(userId: string): Promise<UserSubscription> {
    const doc = await db.collection("users").doc(userId).get();
    const data = doc.exists ? doc.data() : null;

    // 1. Prioridad Máxima: Suscripción explícita en el documento del usuario
    if (data?.subscription) {
      return data.subscription as UserSubscription;
    }

    // 2. Segunda Prioridad: Solicitud de suscripción aprobada/activa
    // (Útil si el admin aprobó pero el documento de usuario no se actualizó)
    const reqDoc = await db.collection("user_subscription_requests").doc(userId).get();
    if (reqDoc.exists) {
      const reqData = reqDoc.data();
      if (reqData?.status === "active" && reqData?.planId) {
        console.log(`[SubscriptionService] Suscripción encontrada en SOLICITUD ACTIVA para ${userId}`);
        const durationMs = 30 * 24 * 60 * 60 * 1000; // 30 días default
        const approvedAt = reqData.approvedAt || reqData.requestedAt || Date.now();
        return {
          planId: reqData.planId as string,
          status: "active",
          expiresAt: Math.floor((approvedAt + durationMs) / 1000),
        };
      }
    }

    // 3. Tercera Prioridad: Periodo de prueba (Trial)
    if (data?.trialEndsAt) {
      console.log(`[SubscriptionService] Usando periodo de prueba para ${userId}`);
      return {
        planId: "basic",
        status: "active",
        expiresAt: Math.floor(data.trialEndsAt / 1000),
        isTrial: true
      };
    }

    // 4. Default: Basic Trial de 7 días
    console.log(`[SubscriptionService] Sin suscripción encontrada para ${userId}, usando default.`);
    return {
      planId: "basic",
      status: "active",
      expiresAt: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // +7 days
      isTrial: true
    };
  }

  /**
   * Verifica si un bot pertenece a un usuario y retorna su suscripción y plan de una vez.
   */
  async getBotSubscriptionContext(botId: string) {
    const botDoc = await db.collection("bots").doc(botId).get();
    if (!botDoc.exists) {
      console.error(`[SubscriptionService] Bot ${botId} no encontrado`);
      throw new Error(`Bot ${botId} no encontrado`);
    }
    
    const botData = botDoc.data();
    const ownerId = botData?.ownerUid || botData?.ownerId || botId;
    
    console.log(`[SubscriptionService] Bot: ${botId} | Owner: ${ownerId}`);
    
    const userSub = await this.getUserSubscription(ownerId);
    console.log(`[SubscriptionService] UserSub for ${ownerId}:`, JSON.stringify(userSub));
    
    const plan = await this.getPlanInfo(userSub.planId);
    console.log(`[SubscriptionService] Resolved Plan for ${ownerId}: ${plan.name} (${plan.id})`);
    
    return { userSub, plan, ownerId };
  }
}

export const subscriptionService = new SubscriptionService();
