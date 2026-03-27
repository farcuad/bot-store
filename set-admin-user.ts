/**
 * One-shot script: assign admin role + bot_default to target user
 */
import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

const projectId   = process.env.FIREBASE_PROJECT_ID!;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
const privateKey  = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');

if (!admin.apps.length) {
  admin.initializeApp({ credential: admin.credential.cert({ projectId, clientEmail, privateKey }) });
}
const db = admin.firestore();

const UID = 'qiccLWB0N5SUxuuYPD7OJbS4TBH2';

async function main() {
  // 1. Find any existing bot to assign as default
  const allBots = await db.collection('bots').get();
  console.log('Available bots:', allBots.docs.map(d => `${d.id}: ${JSON.stringify(d.data())}`));
  
  let defaultBotId: string | null = null;
  
  // Try to find bot_default by ID
  const fallback = await db.collection('bots').doc('bot_default').get();
  if (fallback.exists) {
    defaultBotId = 'bot_default';
  } else if (!allBots.empty) {
    defaultBotId = allBots.docs[0].id;
  }

  // 2. Update user
  const updates: Record<string, any> = {
    role: 'admin',
    status: 'approved',
    approvedAt: Date.now(),
  };
  if (defaultBotId) {
    updates.botId = defaultBotId;
    console.log('Assigning botId:', defaultBotId);
  }

  await db.collection('users').doc(UID).set(updates, { merge: true });
  console.log('✅ User updated:', updates);

  const snap = await db.collection('users').doc(UID).get();
  console.log('📄 Current user data:', snap.data());
}

main().catch(e => { console.error(e); process.exit(1); });
