import dotenv from "dotenv";
dotenv.config();

import { startAdminServer } from "./admin/server.js";
import { botManager } from "./saas/BotManager.js";
import { imprimirResumenStats } from "./services/statsManager.js";

const BOT_PHONE_NUMBER = process.env.BOT_PHONE_NUMBER;

// ─── Boot ─────────────────────────────────────────────────────────────────────

console.log("🚀 Arrancando plataforma SaaS de bots…");

// 1. Start admin + SaaS HTTP panel
startAdminServer();

// 2. Register the legacy default bot so existing Firestore data keeps working
if (BOT_PHONE_NUMBER) {
  await botManager.registerDefaultBot(BOT_PHONE_NUMBER);
}

// 3. Load and auto-start all bots persisted in Firestore
await botManager.initFromFirestore();

imprimirResumenStats();
