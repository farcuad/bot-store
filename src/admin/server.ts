import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import adminRoutes from "./routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ADMIN_PORT = process.env.ADMIN_PORT ? parseInt(process.env.ADMIN_PORT) : 3001;

export function startAdminServer(): void {
  const app = express();
  app.use(express.json());

  // Servir el panel HTML estático
  app.use(express.static(path.join(__dirname, "../../public/admin")));

  // API REST
  app.use("/api", adminRoutes);

  app.listen(ADMIN_PORT, () => {
    console.log(`🖥️  Panel admin disponible en http://localhost:${ADMIN_PORT}`);
  });
}
