import { db, BOT_PHONE_NUMBER } from '../config/firebase.js';
// ─── Constantes ────────────────────────────────────────────────────────────────
export const TWENTY_FOUR_HOURS = 86_400;
export const AUTO_REACTIVATE_SECONDS = 30 * 60;
export const MAX_HISTORY_MESSAGES = 10;
// ─── Factory per-bot ──────────────────────────────────────────────────────────
export function createSessionManager(botId) {
    /** In-memory history cache scoped to this bot */
    const memoryCache = {};
    function sessionRef(phone) {
        return db
            .collection('bots')
            .doc(botId)
            .collection('sessions')
            .doc(phone);
    }
    async function getSession(phone) {
        const snap = await sessionRef(phone).get();
        if (!snap.exists)
            return null;
        const data = snap.data();
        const status = data.status ?? 'bot';
        const last_interaction = data.last_interaction ?? 0;
        const human_since = data.human_since;
        const history = memoryCache[phone]?.history ?? [];
        const entry = { last_interaction, status, human_since, history };
        memoryCache[phone] = entry;
        return entry;
    }
    async function saveSession(phone, entry) {
        memoryCache[phone] = entry;
        const { human_since, ...rest } = entry;
        const payload = {
            ...rest,
            phone,
            updated_at: Date.now(),
        };
        if (human_since !== undefined)
            payload.human_since = human_since;
        delete payload.history;
        await sessionRef(phone).set(payload, { merge: true });
    }
    async function getStatusFromFirestore(phone) {
        const snap = await sessionRef(phone).get();
        if (!snap.exists)
            return null;
        return snap.data().status ?? 'bot';
    }
    function getSessionFromMemory(phone) {
        return memoryCache[phone];
    }
    function appendToHistory(session, role, content) {
        if (!session.history)
            session.history = [];
        session.history.push({ role, content });
        if (session.history.length > MAX_HISTORY_MESSAGES) {
            session.history = session.history.slice(-MAX_HISTORY_MESSAGES);
        }
    }
    /** List all sessions for this bot (Firestore scan) */
    async function listSessions() {
        const snap = await db.collection('bots').doc(botId).collection('sessions').get();
        return snap.docs.map(doc => {
            const d = doc.data();
            return {
                last_interaction: d.last_interaction ?? 0,
                status: d.status ?? 'bot',
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
export const getSession = _legacy?.getSession ?? (async () => null);
export const saveSession = _legacy?.saveSession ?? (async () => { });
export const getStatusFromFirestore = _legacy?.getStatusFromFirestore ?? (async () => null);
export const getSessionFromMemory = _legacy?.getSessionFromMemory ?? (() => undefined);
export const appendToHistory = _legacy?.appendToHistory ?? (() => { });
//# sourceMappingURL=sessionManager.js.map