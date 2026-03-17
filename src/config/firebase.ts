import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();

// ─── Variables de entorno requeridas ─────────────────────────────────────────
const projectId     = process.env.FIREBASE_PROJECT_ID;
const clientEmail   = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey    = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
const botNumber     = process.env.BOT_PHONE_NUMBER;

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Faltan variables de entorno de Firebase (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).");
  process.exit(1);
}

if (!botNumber) {
  console.error("❌ BOT_PHONE_NUMBER no está definido en el .env");
  process.exit(1);
}

// ─── Inicialización (solo una vez) ────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

export const db = admin.firestore();

/** Número de teléfono del bot, usado como scope en Firestore. */
export const BOT_PHONE_NUMBER: string = botNumber;
