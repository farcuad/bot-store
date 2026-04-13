import express from "express";
import type { Request, Response } from "express";
import path from "path";
import { fileURLToPath } from "url";
import cors from "cors";
import adminRoutes from "./routes.js";
import saasRoutes from "../saas/saasRoutes.js";
import billingRouter from "../saas/billing.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_PORT = process.env.ADMIN_PORT
  ? parseInt(process.env.ADMIN_PORT)
  : 3001;

export function startAdminServer(): void {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // ── API ───────────────────────────────────────────────────────────────────────

  // Firebase Web SDK config endpoint (serves public keys safely from env)
  app.get("/api/firebase-config", (_req: Request, res: Response) => {
    const apiKey = process.env.FIREBASE_WEB_API_KEY;
    // If not configured, return empty object — frontend falls back to admin-token login
    if (!apiKey) {
      res.json({});
      return;
    }
    res.json({
      apiKey,
      authDomain: process.env.FIREBASE_WEB_AUTH_DOMAIN ?? "",
      projectId: process.env.FIREBASE_PROJECT_ID ?? "",
      storageBucket: process.env.FIREBASE_WEB_STORAGE_BUCKET ?? "",
      messagingSenderId: process.env.FIREBASE_WEB_MESSAGING_SENDER_ID ?? "",
      appId: process.env.FIREBASE_WEB_APP_ID ?? "",
    });
  });

  // SaaS bot management API
  app.use("/api/saas", saasRoutes);

  // Billing & subscriptions API
  app.use("/api/saas/billing", billingRouter);

  // Bot admin API (used by /bot panel) + auth
  app.use("/api", adminRoutes);

  /* // ── Static files & SPA fallback ─────────────────────────────────────────────
  
  const landingDist = path.join(__dirname, "../../dist");
  app.use(express.static(landingDist));

  // Catch-all for React Router SPA
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(landingDist, "index.html"));
  });

  app.listen(ADMIN_PORT, "0.0.0.0", () => {
    console.log(`🖥️  Servidor de la plataforma en http://localhost:${ADMIN_PORT}`);
    console.log(`✨  Frontend unificado sirviéndose desde dist/`);
  }); */

  // ── Static files & SPA fallback ─────────────────────────────────────────────

  // Usamos process.cwd() que en entornos como Easypanel apunta a la raíz del proyecto (/app)
  // Esto asegura que siempre encuentre la carpeta 'dist' sin importar en qué subcarpeta esté este script.
  const landingDist = path.join(process.cwd(), "dist");

  // 1. Servir explícitamente la carpeta assets con el tipo MIME forzado para evitar el error "x-tiled-tsx"
  app.use(
    "/assets",
    express.static(path.join(landingDist, "assets"), {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".js")) {
          res.setHeader("Content-Type", "application/javascript");
        } else if (filePath.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css");
        }
      },
    }),
  );

  // 2. Servir el resto de archivos estáticos (logo.png, favicon, etc) desde la raíz de dist
  app.use(express.static(landingDist));

  // 3. Catch-all para React Router SPA
  // Al usar app.use() sin declarar una ruta, Express atrapa TODA petición
  // que haya sobrevivido hasta aquí, esquivando el error de path-to-regexp.
  app.use((_req: Request, res: Response) => {
    res.sendFile(path.join(landingDist, "index.html"));
  });

  app.listen(ADMIN_PORT, "0.0.0.0", () => {
    console.log(
      `🖥️  Servidor de la plataforma en http://localhost:${ADMIN_PORT}`,
    );
    console.log(`✨  Frontend unificado sirviéndose desde: ${landingDist}`);
  });
}
