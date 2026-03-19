/**
 * scripts/seed-firestore.mjs
 * Puebla Firestore con la configuración inicial del bot Dulces Porciones.
 *
 * Uso:
 *   node scripts/seed-firestore.mjs
 */

import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { createRequire } from "module";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
dotenv.config();
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

// Leer el service account desde las descargas
const serviceAccount = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const BOT = "584127575904"; //aqui debe ir el numero inicial del bot
const botDoc = db.collection("bots").doc(BOT);
// de aqui en adelante sera el modelo inicial
// ─── 1. respuestas_info ───────────────────────────────────────────────────────
const respuestasInfo = {
  precio: {
    texto:
      "📦 *Listas de precios*:\n" +
      "1. *Yogurt 16 Oz* - 12$\n\n" +
      "2. *Tortas Frias 12 Oz* - (8 sabores)\n" +
      "    $1.5 BCV\n    1$ en divisas\n    $1.25 A partir de 5 unidades\n\n" +
      "3. *Bizcochos Marmoleados* - $15\n\n" +
      "4. *Tortas de Piña* -\n    $1.25 BCV\n    1$ en divisas\n    1.25$ precio por docena\n\n" +
      "5. *Ponquesitos paquete de 8 unidades* -\n    $1.25 BCV\n    1$ en divisas\n\n" +
      "6. *Quesillo* - \n    $1.35 BCV\n    1$ en divisas\n    $16 la docena\n\n" +
      "7. *Palmeritas* - $14\n\n" +
      "8. *Ponqué 300 gramos* -\n    $1.25 BCV\n    1$ en divisas\n    $1.25 precio por docena\n\n" +
      "9. *Torta ponqué 1.5 kg*\n    $5 BCV",
    descripcion_ia:
      "El usuario pregunta por precios, lista de productos, catálogo, qué venden, cuánto cuesta algo",
    activo: true,
    requiere_horario: false,
  },
  ubicacion: {
    texto:
      "📍 *Ubicación*:\nAv. Principal de los pozones, una cuadra antes del ambulatorio, Barinas Barinas.",
    descripcion_ia:
      "El usuario pregunta por la dirección, dónde están, cómo llegar, ubicación",
    activo: true,
    requiere_horario: false,
  },
  redes: {
    texto:
      "📱 *Síguenos en TikTok*:\n- https://www.tiktok.com/@dulcesporciones",
    descripcion_ia:
      "El usuario pregunta por Instagram, TikTok, Facebook, redes sociales o quiere seguirnos",
    activo: true,
    requiere_horario: false,
  },
  horario: {
    texto:
      "⏰ *Nuestro Horario de Atención*\n\n" +
      "📅 *Martes a Sábados*\n\n" +
      "📥 *Recepción de pedidos:* Después de las 12:00 PM\n" +
      "🚚 *Despacho de entregas:* Desde las 2:00 PM hasta finalizar ruta.\n\n" +
      "¡Estamos para servirte! ✨",
    descripcion_ia:
      "El usuario pregunta por el horario, a qué hora abren, cuándo cierran, días de atención",
    activo: true,
    requiere_horario: false,
  },
};

// ─── 2. respuestas_sistema ────────────────────────────────────────────────────
const respuestasSistema = {
  saludoInicial: {
    texto:
      "¡Hola {name}! 👋 Bienvenido a *Dulces Porciones*.\n\n" +
      "Puedes consultarme por:\n" +
      "- 📦 *Listas de precios*\n" +
      "- 📍 *Ubicación*\n" +
      "- 📱 *Redes Sociales*\n" +
      "- ⏰ *Horarios de Atención*\n\n" +
      " ¿En qué podemos ayudarte? ",
  },
  saludoRecontacto: {
    texto:
      "¡Hola de nuevo {name}! 👋 Qué gusto verte otra vez por *Dulces Porciones*.\n\n" +
      "¿En qué te puedo ayudar hoy?\n" +
      "- 📦 *Listas de precios*\n" +
      "- 📍 *Ubicación*\n" +
      "- 📱 *Redes Sociales*\n" +
      "- ⏰ *Horarios de Atención*\n\n" +
      " ¿En qué podemos ayudarte? ",
  },
  noentendi: {
    texto:
      "¡Ups! 🤖 No estoy seguro de haber entendido bien.\n\n" +
      "Para ayudarte mejor, puedes:\n" +
      "* 📝 Describir brevemente tu duda.\n" +
      "* 👩 Escribir *'Hablar con Raquel'* para que una persona te atienda.\n" +
      "* 👋 Despedirte si ya tienes todo lo que necesitabas.\n\n" +
      "¿En qué más puedo apoyarte hoy?",
  },
  despedida: {
    texto:
      "¡Fue un gusto saludarte! 😊\n" +
      "Recuerda que si necesitas algo más, solo tienes que escribir. " +
      "¡Que tengas un excelente día! ✨",
  },
  mediaRecibida: {
    texto:
      "📎 ¡Recibí tu mensaje! Sin embargo, solo puedo leer *texto* por ahora.\n\n" +
      "¿Podrías escribirme tu consulta con palabras? 😊\n\n" +
      "Por ejemplo:\n" +
      '- _"¿Cuánto cuesta el quesillo?"_\n' +
      '- _"¿Dónde están ubicados?"_',
  },
  agenteAviso: {
    texto:
      "👩 ¡Perfecto! Ya avisé a *Raquel* y pronto te atenderá personalmente. 🙌\n\n" +
      "En un momento te contactará. ¡Gracias por tu paciencia! 💛",
  },
  botReactivado: {
    texto:
      "👋 ¡Hola de nuevo! Estoy de vuelta para ayudarte.\n\n" +
      "Si necesitas hablar con una persona, escribe *'Raquel'* y te comunicamos de inmediato. 😊",
  },
  fueraHorarioFin: {
    texto:
      "⏰ ¡Hola! Por el momento estamos fuera de horario.\n\n" +
      "📅 Atendemos de *Martes a Sábado* desde las *12:00 PM*.\n\n" +
      "Puedo ayudarte con información de precios, ubicación y horarios. " +
      "¡Escríbenos dentro del horario para coordinar tu pedido! 🎂",
  },
  fueraHorarioDia: {
    texto:
      "⏰ ¡Hola! Aún no hemos abierto hoy.\n\n" +
      "📅 Recibimos pedidos a partir de las *12:00 PM* (Martes a Sábado).\n\n" +
      "Puedo ayudarte con preguntas sobre precios, ubicación y horarios. " +
      "¡Vuelve en horario de atención! 🎂",
  },
};

// ─── 3. horarios ──────────────────────────────────────────────────────────────
const horarioAtencion = {
  dias_habiles: [2, 3, 4, 5, 6], // Mar=2, Mié=3, Jue=4, Vie=5, Sáb=6
  hora_apertura: 12,
  hora_cierre: 20,
  timezone: "America/Caracas",
};

// ─── Escritura ────────────────────────────────────────────────────────────────
async function seed() {
  console.log(`\n🌱 Iniciando seed para bot: ${BOT}\n`);

  await botDoc.set(
    { nombre: "Dulces Porciones", activo: true },
    { merge: true },
  );

  console.log("📝 respuestas_info...");
  for (const [id, data] of Object.entries(respuestasInfo)) {
    await botDoc.collection("respuestas_info").doc(id).set(data);
    console.log(`   ✅ ${id}`);
  }

  console.log("\n📝 respuestas_sistema...");
  for (const [id, data] of Object.entries(respuestasSistema)) {
    await botDoc.collection("respuestas_sistema").doc(id).set(data);
    console.log(`   ✅ ${id}`);
  }

  console.log("\n📝 horarios/atencion...");
  await botDoc.collection("horarios").doc("atencion").set(horarioAtencion);
  console.log("   ✅ atencion");

  console.log(`
✅ Seed completado!

bots/${BOT}/
  respuestas_info/    (${Object.keys(respuestasInfo).length} docs)
  respuestas_sistema/ (${Object.keys(respuestasSistema).length} docs)
  horarios/           (1 doc)
`);
  process.exit(0);
}

seed().catch((e) => {
  console.error("❌ Error:", e.message);
  process.exit(1);
});
