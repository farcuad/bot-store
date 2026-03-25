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

  // ── Static files ─────────────────────────────────────────────────────────────

  // SaaS dashboard (served at root so /saas/ works nicely)
  app.use("/saas", express.static(path.join(__dirname, "../../public/saas")));

  // Legacy admin panel
  app.use(express.static(path.join(__dirname, "../../public/admin")));

  // ── API ───────────────────────────────────────────────────────────────────────

  // SaaS bot management API
  app.use("/api/saas", saasRoutes);

  // Legacy single-bot admin API
  app.use("/api", adminRoutes);

  app.listen(ADMIN_PORT, "0.0.0.0", () => {
    console.log(`🖥️  Panel admin en http://localhost:${ADMIN_PORT}`);
    console.log(`🤖  SaaS dashboard en http://localhost:${ADMIN_PORT}/saas`);
  });
}
