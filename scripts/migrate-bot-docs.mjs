/**
 * scripts/migrate-bot-docs.mjs
 *
 * Migración: asegura que cada bot en platform/bots/registry tenga su documento
 * base en bots/{botId} con los campos: nombre, activo, isAutoResponseEnabled.
 *
 * Si el documento ya existe, NO sobreescribe los campos existentes (usa merge).
 * Si no existe, lo crea con los valores del registro.
 *
 * Uso:
 *   node scripts/migrate-bot-docs.mjs
 *
 * Variables de entorno requeridas (.env):
 *   FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
dotenv.config();

const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function migrate() {
  console.log("\n🔄 Iniciando migración de documentos bots/{botId}…\n");

  const registrySnap = await db
    .collection("platform")
    .doc("bots")
    .collection("registry")
    .get();

  if (registrySnap.empty) {
    console.log("⚠️  No se encontraron bots en el registro. Nada que migrar.");
    process.exit(0);
  }

  console.log(`📋 Bots encontrados en registry: ${registrySnap.size}\n`);

  let created = 0;
  let skipped = 0;
  let updated = 0;

  for (const regDoc of registrySnap.docs) {
    const botId = regDoc.id;
    const record = regDoc.data();

    const botDocRef = db.collection("bots").doc(botId);
    const botDocSnap = await botDocRef.get();

    if (!botDocSnap.exists) {
      // Crear desde cero con valores del registro
      await botDocRef.set({
        nombre: record.nombre ?? "Bot",
        activo: record.active ?? true,
        isAutoResponseEnabled: true,
      });
      console.log(`   ✅ [CREADO]    ${botId} → nombre: "${record.nombre}"`);
      created++;
    } else {
      const botData = botDocSnap.data() ?? {};
      const needsUpdate = {};

      // Solo sincronizar nombre si difiere del registro (el registro es fuente de verdad)
      if (botData.nombre !== record.nombre) {
        needsUpdate.nombre = record.nombre ?? "Bot";
      }

      // Asegurar campos mínimos si faltan
      if (botData.isAutoResponseEnabled === undefined) {
        needsUpdate.isAutoResponseEnabled = true;
      }
      if (botData.activo === undefined) {
        needsUpdate.activo = record.active ?? true;
      }

      if (Object.keys(needsUpdate).length > 0) {
        await botDocRef.set(needsUpdate, { merge: true });
        console.log(
          `   🔄 [ACTUALIZADO] ${botId} → ${JSON.stringify(needsUpdate)}`
        );
        updated++;
      } else {
        console.log(`   ⏭️  [OK]         ${botId} → ya tiene estructura correcta`);
        skipped++;
      }
    }
  }

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Migración completada

   Creados:     ${created}
   Actualizados: ${updated}
   Sin cambios: ${skipped}
   Total:       ${registrySnap.size}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  process.exit(0);
}

migrate().catch((e) => {
  console.error("❌ Error en la migración:", e.message);
  process.exit(1);
});
