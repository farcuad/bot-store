/**
 * broadcastScheduler.ts
 * Singleton service that loads pending/recurring broadcasts from Firestore
 * and executes them at the scheduled time using the live bot clients.
 */

import { db } from "../config/firebase.js";
import { botManager } from "../saas/BotManager.js";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScheduleType = "now" | "once" | "weekly" | "monthly";

export interface BroadcastSchedule {
  type: ScheduleType;
  /** ISO datetime string — used for 'once' */
  datetime?: string;
  /** 0=Sun … 6=Sat — used for 'weekly' */
  daysOfWeek?: number[];
  /** 1-31 — used for 'monthly' */
  daysOfMonth?: number[];
  /** "HH:MM" local time — used for 'weekly' and 'monthly' */
  time?: string;
}

export interface BroadcastRecipients {
  contactIds: string[];  // e.g. "5491112345678@c.us"
  groupIds: string[];    // e.g. "120363000000000000@g.us"
  status?: boolean;      // send to "status@broadcast"
}

export interface BroadcastDoc {
  id: string;
  botId: string;
  templateId: string;
  templateSnapshot: { text: string; imageUrl?: string };
  recipients: BroadcastRecipients;
  schedule: BroadcastSchedule;
  status: "pending" | "sending" | "done" | "error" | "scheduled";
  createdAt: FirebaseFirestore.Timestamp;
  lastRun?: FirebaseFirestore.Timestamp;
  nextRun?: FirebaseFirestore.Timestamp;
  errorMessage?: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Given a schedule, return the next Date the broadcast should run.
 * Returns null if it will never run again (e.g. 'once' already passed).
 */
export function calcNextRun(schedule: BroadcastSchedule, from: Date = new Date()): Date | null {
  if (schedule.type === "now") return new Date(); // immediate

  if (schedule.type === "once") {
    if (!schedule.datetime) return null;
    const d = new Date(schedule.datetime);
    return d > from ? d : null;
  }

  if (schedule.type === "weekly") {
    if (!schedule.daysOfWeek?.length || !schedule.time) return null;
    const [hh = 0, mm = 0] = schedule.time.split(":").map(Number);
    // Find the next matching weekday
    for (let i = 0; i <= 7; i++) {
      const candidate = new Date(from);
      candidate.setDate(from.getDate() + i);
      candidate.setHours(hh, mm, 0, 0);
      if (schedule.daysOfWeek.includes(candidate.getDay()) && candidate > from) {
        return candidate;
      }
    }
    return null;
  }

  if (schedule.type === "monthly") {
    if (!schedule.daysOfMonth?.length || !schedule.time) return null;
    const [hh = 0, mm = 0] = schedule.time.split(":").map(Number);
    // Try current month then next month
    for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
      const base = new Date(from);
      base.setMonth(base.getMonth() + monthOffset, 1);
      for (const day of schedule.daysOfMonth.sort((a, b) => a - b)) {
        const candidate = new Date(base.getFullYear(), base.getMonth(), day, hh, mm, 0, 0);
        if (candidate > from) return candidate;
      }
    }
    return null;
  }

  return null;
}

// ── Scheduler ─────────────────────────────────────────────────────────────────

class BroadcastScheduler {
  private timers = new Map<string, NodeJS.Timeout>();
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;
    console.log("📅 BroadcastScheduler: iniciando…");
    await this.loadAndScheduleAll();
    // Re-check every 5 minutes to pick up newly created broadcasts
    setInterval(() => this.loadAndScheduleAll(), 5 * 60 * 1000);
  }

  private async loadAndScheduleAll() {
    try {
      const botsSnap = await db.collection("bots").get();
      for (const botDoc of botsSnap.docs) {
        const botId = botDoc.id;
        const broadcastsSnap = await db
          .collection("bots")
          .doc(botId)
          .collection("broadcasts")
          .where("status", "in", ["pending", "scheduled"])
          .get();

        for (const doc of broadcastsSnap.docs) {
          const broadcast = { id: doc.id, botId, ...doc.data() } as BroadcastDoc;
          this.schedule(broadcast);
        }
      }
    } catch (err) {
      console.error("📅 BroadcastScheduler: error cargando broadcasts:", err);
    }
  }

  schedule(broadcast: BroadcastDoc) {
    const key = `${broadcast.botId}:${broadcast.id}`;

    // Don't double-schedule
    if (this.timers.has(key)) return;

    const nextRun = calcNextRun(broadcast.schedule);
    if (!nextRun) {
      // No future run — mark done if it's a one-off
      if (broadcast.schedule.type === "once") {
        db.collection("bots").doc(broadcast.botId).collection("broadcasts").doc(broadcast.id)
          .update({ status: "done" }).catch(() => {});
      }
      return;
    }

    const delay = Math.max(0, nextRun.getTime() - Date.now());
    console.log(`📅 Broadcast ${broadcast.id} programado para ${nextRun.toISOString()} (en ${Math.round(delay / 1000)}s)`);

    const timer = setTimeout(async () => {
      this.timers.delete(key);
      await this.executeBroadcast(broadcast);
      // After executing, reschedule recurring broadcasts
      if (broadcast.schedule.type === "weekly" || broadcast.schedule.type === "monthly") {
        const refreshed = await db
          .collection("bots").doc(broadcast.botId)
          .collection("broadcasts").doc(broadcast.id).get();
        if (refreshed.exists) {
          const refreshedDoc = { id: refreshed.id, botId: broadcast.botId, ...refreshed.data() } as BroadcastDoc;
          this.schedule(refreshedDoc);
        }
      }
    }, delay);

    this.timers.set(key, timer);

    // Update nextRun in Firestore
    db.collection("bots").doc(broadcast.botId).collection("broadcasts").doc(broadcast.id)
      .update({
        status: "scheduled",
        nextRun: new Date(nextRun),
      }).catch(() => {});
  }

  async executeBroadcast(broadcast: BroadcastDoc): Promise<{ sent: number; errors: number }> {
    const ref = db
      .collection("bots").doc(broadcast.botId)
      .collection("broadcasts").doc(broadcast.id);

    await ref.update({ status: "sending" });

    const instance = botManager.getInstance(broadcast.botId);
    if (!instance || instance.getState().status !== "ready") {
      await ref.update({
        status: "error",
        errorMessage: "El bot no está activo al momento del envío.",
        lastRun: new Date(),
      });
      return { sent: 0, errors: 1 };
    }

    const { text, imageUrl } = broadcast.templateSnapshot;
    const allRecipients = [
      ...broadcast.recipients.contactIds,
      ...broadcast.recipients.groupIds,
    ];
    if (broadcast.recipients.status) {
      allRecipients.push("status@broadcast");
    }

    let sent = 0;
    let errors = 0;

    for (const chatId of allRecipients) {
      try {
        if (imageUrl) {
          await instance.sendMediaToChat(chatId, imageUrl, text || undefined);
        } else {
          await instance.sendMessageToChat(chatId, text);
        }
        sent++;
        // Small delay between messages to avoid WA rate limiting
        await new Promise(r => setTimeout(r, 800));
      } catch (err: any) {
        console.error(`📅 Error enviando a ${chatId}:`, err.message);
        errors++;
      }
    }

    const isRecurring = broadcast.schedule.type === "weekly" || broadcast.schedule.type === "monthly";
    const nextRun = isRecurring ? calcNextRun(broadcast.schedule, new Date()) : null;

    await ref.update({
      status: isRecurring ? "scheduled" : "done",
      lastRun: new Date(),
      ...(nextRun ? { nextRun } : {}),
      errorMessage: errors > 0 ? `${errors} error(es) en ${allRecipients.length} destinatario(s)` : null,
    });

    console.log(`📅 Broadcast ${broadcast.id}: ✅ ${sent} enviados, ❌ ${errors} errores`);
    return { sent, errors };
  }

  cancelBroadcast(botId: string, broadcastId: string) {
    const key = `${botId}:${broadcastId}`;
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }
}

export const broadcastScheduler = new BroadcastScheduler();
