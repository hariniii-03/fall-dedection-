/**
 * Push token registration.
 *
 * The Expo mobile app calls this after `expo-notifications` returns a device
 * token (ExpoPushToken[...]). Tokens are associated with the authenticated
 * user so the backend can target the right supervisors.
 */
import { db } from "@/db";
import { pushTokens } from "@/db/schema";
import { fail, ok, parseJson, requireUser } from "@/lib/http";
import { pushTokenSchema } from "@/lib/validation";

export async function POST(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const parsed = await parseJson(request, pushTokenSchema);
  if (!parsed.ok) return parsed.response;

  const pushConfigured = Boolean(process.env.EXPO_ACCESS_TOKEN);

  const saved = await db
    .insert(pushTokens)
    .values({
      userId: auth.session.uid,
      token: parsed.data.token,
      platform: parsed.data.platform,
    })
    .onConflictDoUpdate({
      target: pushTokens.token,
      set: { userId: auth.session.uid, lastSeenAt: new Date(), enabled: true, platform: parsed.data.platform },
    })
    .returning();

  return ok(
    {
      registered: true,
      tokenId: saved[0]?.id ?? null,
      deliveryMode: pushConfigured ? "remote-push" : "local-fallback",
      detail: pushConfigured
        ? "Expo push credentials configured; backend will send remote notifications."
        : "EXPO_ACCESS_TOKEN not configured: in-app + local notifications only. See docs/PUSH_NOTIFICATIONS.md.",
    },
    201,
  );
}

export async function GET() {
  const auth = await requireUser(["admin"]);
  if (!auth.ok) return auth.response;
  const rows = await db.select().from(pushTokens);
  return ok({
    count: rows.length,
    pushConfigured: Boolean(process.env.EXPO_ACCESS_TOKEN),
    tokens: rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      platform: r.platform,
      enabled: r.enabled,
      lastSeenAt: r.lastSeenAt,
      tokenPreview: `${r.token.slice(0, 12)}...`,
    })),
  });
}
