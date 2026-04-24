import admin from "firebase-admin";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
  });
}

const db = admin.firestore();

async function run() {
  console.log("Creando planes...");
  const plans = [
    {
      id: "basic",
      name: "Basic",
      price: 15,
      features: { audioTranscription: false, apiAccess: false, whatsappTemplates: false, maxBots: 1 }
    },
    {
      id: "pro",
      name: "Pro",
      price: 29,
      features: { audioTranscription: true, apiAccess: true, whatsappTemplates: true, maxBots: 1 }
    },
    {
      id: "premium",
      name: "Premium",
      price: 39,
      features: { audioTranscription: true, apiAccess: true, whatsappTemplates: true, maxBots: 2 }
    }
  ];

  for (const plan of plans) {
    const { id, ...data } = plan;
    await db.collection("plans").doc(id).set(data);
    console.log(`Plan ${id} creado/actualizado.`);
  }

  console.log("Backfilling suscripciones de usuarios...");
  const usersSnap = await db.collection("users").get();
  for (const doc of usersSnap.docs) {
    const data = doc.data();
    if (!data.subscription) {
      await db.collection("users").doc(doc.id).update({
        subscription: {
          planId: "basic",
          status: "active",
          expiresAt: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // +30 días
        }
      });
      console.log(`Usuario ${doc.id} actualizado con suscripción basic.`);
    } else {
      console.log(`Usuario ${doc.id} ya tiene suscripción.`);
    }
  }

  console.log("¡Listo!");
  process.exit(0);
}

run().catch(console.error);
