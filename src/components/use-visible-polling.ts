"use client";

import { useEffect, useEffectEvent } from "react";
import { listenForUpdates, type LiveScope } from "./live-updates";

export function useVisiblePolling(
  poll: (signal: AbortSignal) => Promise<void>,
  scope: LiveScope,
  enabled = true,
) {
  const onPoll = useEffectEvent(poll);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let busy = false;
    let queued = false;

    async function check() {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      try {
        await onPoll(AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
      } catch {
        // Keep the current view during a transient failure and retry on the next check.
      } finally {
        busy = false;
        if (queued && !controller.signal.aborted) {
          queued = false;
          void check();
        }
      }
    }

    const stopListening = listenForUpdates(scope, () => {
      if (busy) queued = true;
      else void check();
    });
    const interval = window.setInterval(check, scope === "admin" ? 4_000 : 5_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    window.addEventListener("online", check);
    void check();

    return () => {
      controller.abort();
      window.clearInterval(interval);
      stopListening();
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
      window.removeEventListener("online", check);
    };
  }, [enabled, scope]);
}
