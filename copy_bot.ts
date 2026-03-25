import { db } from "./src/config/firebase.js";

async function copyCollection(srcCol: any, destCol: any) {
  const snapshot = await srcCol.get();
  for (const doc of snapshot.docs) {
    await destCol.doc(doc.id).set(doc.data());
  }
}

async function copyBot() {
  const srcBot = db.collection("bots").doc("584268691664");
  const destBot = db.collection("bots").doc("bot_default");

  const srcDoc = await srcBot.get();
  if (!srcDoc.exists) {
    console.log("No existe bot 584268691664 en Firestore.");
    return;
  }
  
  // Copy main doc
  await destBot.set(srcDoc.data());
  console.log("Copiado main doc");

  // Copy subcollections
  await copyCollection(srcBot.collection("respuestas_info"), destBot.collection("respuestas_info"));
  await copyCollection(srcBot.collection("mensajes_no_entendidos"), destBot.collection("mensajes_no_entendidos"));
  await copyCollection(srcBot.collection("sessions"), destBot.collection("sessions"));
  
  // Inicializar stats en 0 para el nuevo bot
  await destBot.collection("estadisticas").doc("resumen").set({
    mensajes_recibidos: 0,
    mensajes_enviados_bot: 0,
    conversaciones_activas: 0,
    usuarios_unicos: 0,
    ultima_actualizacion: new Date().toISOString()
  });

  console.log("Copiado completado.");
  process.exit(0);
}

copyBot().catch(console.error);
