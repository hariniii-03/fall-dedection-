import { requireUser } from "@/lib/http";
import { getDashboardSnapshot } from "@/lib/queries";
import { evaluateHelmetConnections } from "@/lib/safety/engine";
import { tickSimulator } from "@/lib/simulator";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

/**
 * Server-Sent Events live stream (WebSocket-equivalent for one-way pushes).
 * Emits a full dashboard snapshot every ~2.5s, advancing the simulated feed and
 * running the offline-helmet watchdog while clients are connected.
 */
export async function GET(request: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  await ensureSeeded();

  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let stopped = false;

      const push = async (event: string, data: unknown) => {
        if (stopped) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const tick = async () => {
        try {
          await tickSimulator();
          await evaluateHelmetConnections();
          const snapshot = await getDashboardSnapshot();
          await push("snapshot", snapshot);
        } catch (err) {
          await push("error", { message: String(err) }).catch(() => undefined);
        }
      };

      const stop = () => {
        if (stopped) return;
        stopped = true;
        if (timer) clearInterval(timer);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      request.signal.addEventListener("abort", stop);
      controller.enqueue(encoder.encode(`retry: 3000\n\n`));
      await tick();
      timer = setInterval(tick, 2500);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
