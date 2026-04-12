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
  contactName?: string | undefined;
  history: ConversationMessage[];
}

export type SessionsData = Record<string, SessionEntry>;

// ─── Constantes ────────────────────────────────────────────────────────────────

export const TWENTY_FOUR_HOURS = 86_400;
export const AUTO_REACTIVATE_SECONDS = 30 * 60;
export const MAX_HISTORY_MESSAGES = 10;

// ─── Factory per-bot ──────────────────────────────────────────────────────────

export function createSessionManager(botId: string) {
  /** In-memory history cache scoped to this bot */
  const memoryCache: SessionsData = {};

  function sessionRef(phone: string) {
    return db
      .collection('bots')
      .doc(botId)
      .collection('sessions')
      .doc(phone);
  }

  async function getSession(phone: string): Promise<SessionEntry | null> {
    const snap = await sessionRef(phone).get();
    if (!snap.exists) return null;

    const data = snap.data()!;
    const status = (data.status as 'bot' | 'human') ?? 'bot';
    const last_interaction = (data.last_interaction as number) ?? 0;
    const human_since = data.human_since as number | undefined;
    const contactName = data.contactName as string | undefined;

    const history = memoryCache[phone]?.history ?? [];
    const entry: SessionEntry = { last_interaction, status, human_since, contactName, history };
    memoryCache[phone] = entry;
    return entry;
  }

  async function saveSession(phone: string, entry: SessionEntry): Promise<void> {
    memoryCache[phone] = entry;

    const { human_since, contactName, ...rest } = entry;
    const payload: Record<string, unknown> = {
      ...rest,
      phone,
      updated_at: Date.now(),
    };
    if (human_since !== undefined) payload.human_since = human_since;
    if (contactName !== undefined) payload.contactName = contactName;
    delete payload.history;

    await sessionRef(phone).set(payload, { merge: true });
  }

  async function getStatusFromFirestore(phone: string): Promise<'bot' | 'human' | null> {
    const snap = await sessionRef(phone).get();
    if (!snap.exists) return null;
    return (snap.data()!.status as 'bot' | 'human') ?? 'bot';
  }

  function getSessionFromMemory(phone: string): SessionEntry | undefined {
    return memoryCache[phone];
  }

  function appendToHistory(session: SessionEntry, role: 'user' | 'assistant', content: string): void {
    if (!session.history) session.history = [];
    session.history.push({ role, content });
    if (session.history.length > MAX_HISTORY_MESSAGES) {
      session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
    }
  }

  /** List all sessions for this bot (Firestore scan) */
  async function listSessions(): Promise<any[]> {
    const snap = await db.collection('bots').doc(botId).collection('sessions').get();
    return snap.docs.map(doc => {
      const d = doc.data();
      return {
        id: doc.id,
        phone: doc.id.split('@')[0],
        contactName: d.contactName,
        last_interaction: d.last_interaction ? d.last_interaction * 1000 : 0,
        estado: d.status ?? 'bot',
        human_since: d.human_since,
        history: memoryCache[doc.id]?.history ?? [],
      };
    });
  }

  return {
    TWENTY_FOUR_HOURS,
    AUTO_REACTIVATE_SECONDS,
    MAX_HISTORY_MESSAGES,
    getSession,
    saveSession,
    getStatusFromFirestore,
    getSessionFromMemory,
    appendToHistory,
    listSessions,
  };
}

// ─── Backward-compatible singleton (uses legacy BOT_PHONE_NUMBER) ──────────────
// In SaaS mode (no BOT_PHONE_NUMBER) this is null; each BotInstance uses createSessionManager().

const _legacy = BOT_PHONE_NUMBER ? createSessionManager(BOT_PHONE_NUMBER) : null;

export const getSession             = _legacy?.getSession             ?? (async () => null);
export const saveSession            = _legacy?.saveSession            ?? (async () => {});
export const getStatusFromFirestore = _legacy?.getStatusFromFirestore ?? (async () => null);
export const getSessionFromMemory   = _legacy?.getSessionFromMemory   ?? (() => undefined);
export const appendToHistory        = _legacy?.appendToHistory        ?? (() => {});
