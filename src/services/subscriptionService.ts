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
    
    if (doc.exists) {
      const data = doc.data();
      if (data?.subscription) {
        return data.subscription as UserSubscription;
      }
      
      if (data?.trialEndsAt) {
        return {
          planId: "basic",
          status: "active",
          expiresAt: Math.floor(data.trialEndsAt / 1000)
        };
      }
    }

    // Default trial/basic subscription
    return {
      planId: "basic",
      status: "active",
      expiresAt: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // +7 days
    };
  }

  /**
   * Verifica si un bot pertenece a un usuario y retorna su suscripción y plan de una vez.
   */
  async getBotSubscriptionContext(botId: string) {
    const botDoc = await db.collection("bots").doc(botId).get();
    if (!botDoc.exists) {
      throw new Error(`Bot ${botId} no encontrado`);
    }
    const ownerId = botDoc.data()?.ownerId || botId; // Fallback to botId if ownerId is not set
    
    const userSub = await this.getUserSubscription(ownerId);
    const plan = await this.getPlanInfo(userSub.planId);
    
    return { userSub, plan, ownerId };
  }
}

export const subscriptionService = new SubscriptionService();
