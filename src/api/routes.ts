import { Router } from "express";
import { validateApiKey } from "./authWhatsapp.js";
import {
  seendMessageController,
  getGroupsController,
  sendGroupMessageController,
  sendStatusController,
} from "./WhatsappController.js";

const router = Router();

// ── Contact messaging endpoints ──────────────────────────────────────────────
router.post("/send-message", validateApiKey, seendMessageController);
router.post("/send-message/:botId", validateApiKey, seendMessageController);

// ── Group messaging endpoints ────────────────────────────────────────────────
router.get("/groupsBots", validateApiKey, getGroupsController);
router.post("/groupsBots", validateApiKey, sendGroupMessageController);
router.get("/groupsBots/:botId", validateApiKey, getGroupsController);
router.post("/groupsBots/:botId", validateApiKey, sendGroupMessageController);

// ── Status endpoints ─────────────────────────────────────────────────────────
router.post("/send-status", validateApiKey, sendStatusController);
router.post("/send-status/:botId", validateApiKey, sendStatusController);

export default router;
