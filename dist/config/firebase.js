import admin from "firebase-admin";
import dotenv from "dotenv";
dotenv.config();
// ─── Variables de entorno requeridas ─────────────────────────────────────────
const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
// BOT_PHONE_NUMBER ya no es requerido en modo SaaS.
// Cada bot SaaS tiene su propio número guardado en Firestore.
// Sólo se usa para retrocompatibilidad con singletons legacy.
const botNumber = process.env.BOT_PHONE_NUMBER ?? undefined;
if (!projectId || !clientEmail || !privateKey) {
    console.error("❌ Faltan variables de entorno de Firebase (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY).");
    process.exit(1);
}
// ─── Inicialización (solo una vez) ────────────────────────────────────────────
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
}
export const db = admin.firestore();
/**
 * Número de teléfono del bot legacy (puede ser undefined en modo SaaS puro).
 * Los bots SaaS usan su propio botId como scope en Firestore.
 */
export const BOT_PHONE_NUMBER = botNumber;
//# sourceMappingURL=firebase.js.map