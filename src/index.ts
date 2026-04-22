import dotenv from "dotenv";
dotenv.config();

import { startAdminServer } from "./admin/server.js";
import { botManager } from "./saas/BotManager.js";
import { imprimirResumenStats } from "./services/statsManager.js";
import { broadcastScheduler } from "./services/broadcastScheduler.js";

// Catch unhandled promise rejections so errors show clearly instead of crashing silently
process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled rejection:", reason);
});

// ─── Boot ─────────────────────────────────────────────────────────────────────

console.log("🚀 Arrancando plataforma SaaS de bots…");

// 1. Start admin + SaaS HTTP panel
startAdminServer();

// 2. Load and auto-start all bots persisted in Firestore
//    (each bot has its own phone number stored in its own session/config)
try {
  await botManager.initFromFirestore();
} catch (err) {
  console.error("❌ Error inicalizando bots desde Firestore:", err);
}

// 3. Start broadcast scheduler (sends scheduled WA messages)
broadcastScheduler.init().catch(err => {
  console.error("❌ Error inicializando broadcastScheduler:", err);
});

imprimirResumenStats();
