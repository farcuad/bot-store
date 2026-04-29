export interface PlanFeatures {
  audioTranscription: boolean;
  apiAccess: boolean;
  whatsappTemplates: boolean;
  maxBots: number;
}

export interface PricingPlan {
  id: string; // 'basic', 'pro', 'premium'
  name: string;
  price?: number;
  features: PlanFeatures;
}

export interface UserSubscription {
  planId: string;
  status: 'active' | 'past_due' | 'canceled';
  expiresAt: number;
  isTrial?: boolean;
}
