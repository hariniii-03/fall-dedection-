/**
 * Notification fan-out for alerts.
 *
 * 1. An in-app notification row is ALWAYS created (works offline, keeps history).
 * 2. If an Expo push credential is configured (EXPO_ACCESS_TOKEN) the service
 *    posts to https://exp.host/--/api/v2/push/send for every registered device
 *    token belonging to supervisors/admins (and the affected worker).
 * 3. Without credentials the delivery is recorded as `skipped` with the reason,
 *    and the web/mobile client falls back to a LOCAL notification.
 *
 * Remaining setup steps are documented in docs/PUSH_NOTIFICATIONS.md.
 */
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  alerts,
  notifications,
  pushTokens,
  users,
  workers,
  type Alert,
  type User,
} from "@/db/schema";
import { logEvent } from "@/lib/http";

export type DeliveryOutcome = {
  userId: number;
  channel: "push" | "in_app";
  status: "sent" | "failed" | "skipped" | "pending";
  detail?: string;
};

const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function priorityFor(alert: Pick<Alert, "severity" | "type">): "critical" | "warning" | "info" {
  if (alert.severity === "critical" || alert.type === "fall" || alert.type === "sos") {
    return "critical";
  }
  if (alert.severity === "warning") return "warning";
  return "info";
}

function titleFor(alert: Alert): string {
  const prefix =
    alert.severity === "critical" ? "🚨 CRITICAL" : alert.severity === "warning" ? "⚠️ WARNING" : "ℹ️ INFO";
  return `${prefix} · ${alert.title}`;
}

export function bodyFor(alert: Alert): string {
  return alert.message.length > 220 ? `${alert.message.slice(0, 217)}...` : alert.message;
}

async function sendExpoPush(
  messages: {
    to: string;
    title: string;
    body: string;
    channelId?: string;
    sound?: string;
    priority?: "default" | "high" | "normal";
    data?: Record<string, unknown>;
  }[],
): Promise<{ delivered: number; failed: number; detail: string }> {
  if (!process.env.EXPO_ACCESS_TOKEN) {
    return {
      delivered: 0,
      failed: 0,
      detail: "skipped: EXPO_ACCESS_TOKEN not configured - local notification fallback used",
    };
  }
  if (messages.length === 0) return { delivered: 0, failed: 0, detail: "no registered device tokens" };

  try {
    const res = await fetch(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.EXPO_ACCESS_TOKEN
          ? { authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` }
          : {}),
      },
      body: JSON.stringify(messages),
    });
    const json = (await res.json().catch(() => null)) as
      | { data?: { status?: string; message?: string }[]; errors?: { message?: string }[] }
      | null;
    if (!res.ok) {
      return { delivered: 0, failed: messages.length, detail: `expo http ${res.status}` };
    }
    const items = json?.data ?? [];
    const delivered = items.filter((i) => i?.status === "ok").length;
    const failed = messages.length - delivered;
    const firstError = items.find((i) => i?.status !== "ok")?.message;
    return {
      delivered,
      failed,
      detail: failed ? `expo delivered ${delivered}/${messages.length}: ${firstError ?? "unknown"}` : `expo delivered ${delivered}/${messages.length}`,
    };
  } catch (err) {
    return { delivered: 0, failed: messages.length, detail: `expo error: ${String(err)}` };
  }
}

/**
 * Persist in-app notifications and attempt remote push for a new alert.
 * Returns the delivery outcomes so the API can report delivery status.
 */
export async function dispatchAlertNotifications(
  alert: Alert,
  recipients?: User[],
): Promise<DeliveryOutcome[]> {
  const prefs = priorityFor(alert);
  const outcomes: DeliveryOutcome[] = [];

  let targets = recipients;
  if (!targets) {
    const staff = await db
      .select()
      .from(users)
      .where(and(inArray(users.role, ["supervisor", "admin"]), eq(users.active, true)));

    // Also notify the affected worker's own device (if a worker account exists).
    if (alert.workerId) {
      const workerRows = await db.select().from(workers).where(eq(workers.id, alert.workerId));
      const code = workerRows[0]?.code;
      if (code) {
        const workerAccounts = await db
          .select()
          .from(users)
          .where(and(eq(users.workerCode, code), eq(users.active, true)));
        targets = [...staff, ...workerAccounts];
      } else {
        targets = staff;
      }
    } else {
      targets = staff;
    }
  }

  if (!targets || targets.length === 0) {
    await logEvent("warn", "notifications", "No active supervisor/admin recipients for alert", {
      alertId: alert.id,
    });
    return [{ userId: 0, channel: "in_app", status: "skipped", detail: "no recipients" }];
  }

  const title = titleFor(alert);
  const body = bodyFor(alert);
  // Optional env switch so a deployment can choose to push only critical alerts.
  const criticalOnly = process.env.EXPO_PUSH_CRITICAL_ONLY === "true";

  const rows = targets.map((u) => ({
    userId: u.id,
    alertId: alert.id,
    title,
    body,
    priority: prefs,
    channel: "push" as const,
    deliveryStatus: "pending" as const,
  }));
  const inserted = await db.insert(notifications).values(rows).returning();

  const tokens = await db
    .select()
    .from(pushTokens)
    .where(
      and(
        inArray(
          pushTokens.userId,
          targets.map((t) => t.id),
        ),
        eq(pushTokens.enabled, true),
      ),
    );

  const shouldPush =
    (prefs === "critical" || !criticalOnly) && process.env.EXPO_PUSH_ENABLED !== "false";

  const messages = shouldPush
    ? tokens.map((t) => ({
        to: t.token,
        title,
        body,
        channelId: prefs === "critical" ? "minesafe-critical" : "minesafe-default",
        sound: prefs === "critical" ? "default" : undefined,
        priority: prefs === "critical" ? ("high" as const) : ("default" as const),
        data: {
          alertId: alert.id,
          type: alert.type,
          severity: alert.severity,
          helmetId: alert.helmetId,
          workerId: alert.workerId,
        },
      }))
    : [];

  const push = await sendExpoPush(messages);

  if (push.delivered > 0) {
    const sentTokens = tokens.slice(0, push.delivered).map((t) => t.userId);
    await db
      .update(notifications)
      .set({ deliveryStatus: "sent", deliveryDetail: push.detail })
      .where(
        and(
          inArray(
            notifications.id,
            inserted.map((n) => n.id),
          ),
          inArray(
            notifications.userId,
            sentTokens.length ? sentTokens : [-1],
          ),
        ),
      );
  } else {
    await db
      .update(notifications)
      .set({ deliveryStatus: "skipped", deliveryDetail: push.detail })
      .where(
        inArray(
          notifications.id,
          inserted.map((n) => n.id),
        ),
      );
  }

  for (const target of targets) {
    outcomes.push({ userId: target.id, channel: "in_app", status: "pending" });
  }
  outcomes.push({
    userId: 0,
    channel: "push",
    status: push.delivered > 0 ? "sent" : "skipped",
    detail: push.detail,
  });

  await logEvent("info", "notifications", `Alert #${alert.id} notification fan-out`, {
    alertId: alert.id,
    recipients: targets.length,
    tokens: tokens.length,
    pushDetail: push.detail,
  });

  return outcomes;
}

export async function markNotificationsRead(userId: number, ids?: number[]) {
  const rows = await db.select().from(notifications).where(eq(notifications.userId, userId));
  const target = rows
    .filter((r) => !r.readAt && (!ids || ids.includes(r.id)))
    .map((r) => r.id);
  for (const id of target) {
    await db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
  }
  return target.length;
}
