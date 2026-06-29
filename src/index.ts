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

// ─── Graceful Shutdown ─────────────────────────────────────────────────────────
let shuttingDown = false;
async function gracefulShutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n🛑 Recibido ${signal}. Cerrando de forma segura…`);
  try {
    await botManager.stopAll();
    console.log("✅ Todos los bots se detuvieron.");
  } catch (err) {
    console.error("Error deteniendo los bots:", err);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
