import { db, BOT_PHONE_NUMBER } from '../config/firebase.js';

// ─── Tipos ─────────────────────────────────────────────────────────────────────

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface SessionEntry {
  last_interaction: number;
  status: 'bot' | 'human';
  human_since?: number | undefined;   // acepta undefined explícito (exactOptionalPropertyTypes)
  history: ConversationMessage[];
}

export type SessionsData = Record<string, SessionEntry>;

// ─── Constantes ────────────────────────────────────────────────────────────────

export const TWENTY_FOUR_HOURS = 86_400;
export const AUTO_REACTIVATE_SECONDS = 30 * 60;
export const MAX_HISTORY_MESSAGES = 10;

// ─── Caché en memoria ─────────────────────────────────────────────────────────
// La historia vive aquí para evitar lecturas de Firestore en cada mensaje.
// El status/last_interaction/human_since SIEMPRE se leen frescos desde Firestore.

const memoryCache: SessionsData = {};

// ─── Referencia de Firestore ──────────────────────────────────────────────────

function sessionRef(phone: string) {
  return db
    .collection('bots')
    .doc(BOT_PHONE_NUMBER)
    .collection('sessions')
    .doc(phone);
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Carga la sesión de un usuario desde Firestore.
 * El historial de conversación se mantiene en memoria.
 * Retorna null si el usuario no tiene sesión previa.
 */
export async function getSession(phone: string): Promise<SessionEntry | null> {
  const snap = await sessionRef(phone).get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  const status = (data.status as 'bot' | 'human') ?? 'bot';
  const last_interaction = (data.last_interaction as number) ?? 0;
  const human_since = data.human_since as number | undefined;

  // Fusionar con historial en memoria (history nunca viene de Firestore)
  const history = memoryCache[phone]?.history ?? [];

  const entry: SessionEntry = { last_interaction, status, human_since, history };
  memoryCache[phone] = entry;
  return entry;
}

/**
 * Guarda (crea o actualiza) una sesión en Firestore y en memoria.
 * Solo persiste los campos de control; el history queda en memoria.
 */
export async function saveSession(phone: string, entry: SessionEntry): Promise<void> {
  memoryCache[phone] = entry;

  const { human_since, ...rest } = entry;
  const payload: Record<string, unknown> = {
    ...rest,
    phone,            // útil para queries externas
    updated_at: Date.now(),
  };
  // Solo persiste human_since si está definido (evita undefined en Firestore)
  if (human_since !== undefined) {
    payload.human_since = human_since;
  }
  // No persistir el historial en Firestore (vive en memoria)
  delete payload.history;

  await sessionRef(phone).set(payload, { merge: true });
}

/**
 * Lee SOLO el status desde Firestore (para detectar cambios externos en tiempo real).
 */
export async function getStatusFromFirestore(
  phone: string,
): Promise<'bot' | 'human' | null> {
  const snap = await sessionRef(phone).get();
  if (!snap.exists) return null;
  return (snap.data()!.status as 'bot' | 'human') ?? 'bot';
}

/**
 * Retorna la sesión del caché en memoria (sin llamadas a Firestore).
 */
export function getSessionFromMemory(phone: string): SessionEntry | undefined {
  return memoryCache[phone];
}

/**
 * Agrega un mensaje al historial en memoria y lo limita al máximo definido.
 */
export function appendToHistory(
  session: SessionEntry,
  role: 'user' | 'assistant',
  content: string,
): void {
  if (!session.history) session.history = [];
  session.history.push({ role, content });
  if (session.history.length > MAX_HISTORY_MESSAGES) {
    session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
  }
}
