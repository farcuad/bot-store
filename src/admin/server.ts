import express from "express";
import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import adminRoutes from "./routes.js";
import saasRoutes from "../saas/saasRoutes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_PORT = process.env.ADMIN_PORT
  ? parseInt(process.env.ADMIN_PORT)
  : 3001;

export function startAdminServer(): void {
  const app = express();
  app.use(express.json());

  // ── API ───────────────────────────────────────────────────────────────────────

  // Firebase Web SDK config endpoint (serves public keys safely from env)
  app.get("/api/firebase-config", (_req: Request, res: Response) => {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    // If not configured, return empty object — frontend falls back to admin-token login
    if (!apiKey) { res.json({}); return; }
    res.json({
      apiKey,
      authDomain:        process.env.FIREBASE_WEB_AUTH_DOMAIN ?? "",
      projectId:         process.env.FIREBASE_PROJECT_ID ?? "",
      storageBucket:     process.env.FIREBASE_WEB_STORAGE_BUCKET ?? "",
      messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID ?? "",
      appId:             process.env.FIREBASE_WEB_APP_ID ?? "",
    });
  });

  // SaaS bot management API
  app.use("/api/saas", saasRoutes);

  // Bot admin API (used by /bot panel) + auth
  app.use("/api", adminRoutes);

  // ── Static files & SPA fallback ─────────────────────────────────────────────
  
  const landingDist = path.join(__dirname, "../../dist");
  app.use(express.static(landingDist));

  // Catch-all for React Router SPA
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(landingDist, "index.html"));
  });

  app.listen(ADMIN_PORT, "0.0.0.0", () => {
    console.log(`🖥️  Servidor de la plataforma en http://localhost:${ADMIN_PORT}`);
    console.log(`✨  Frontend unificado sirviéndose desde dist/`);
  });
}
