import admin from "firebase-admin";
export declare const db: admin.firestore.Firestore;
/**
 * Número de teléfono del bot legacy (puede ser undefined en modo SaaS puro).
 * Los bots SaaS usan su propio botId como scope en Firestore.
 */
export declare const BOT_PHONE_NUMBER: string | undefined;
//# sourceMappingURL=firebase.d.ts.map