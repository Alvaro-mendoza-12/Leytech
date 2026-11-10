"use client";

import { useEffect, useEffectEvent } from "react";

export function useVisiblePolling(
  poll: (signal: AbortSignal) => Promise<void>,
  enabled = true,
) {
  const onPoll = useEffectEvent(poll);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let busy = false;

    async function check() {
      if (document.visibilityState !== "visible" || busy) return;
      busy = true;
      try {
        await onPoll(AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]));
      } catch {
        // Keep the current view during a transient failure and retry on the next check.
      } finally {
        busy = false;
      }
    }

    const interval = window.setInterval(check, 10_000);
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    void check();

    return () => {
      controller.abort();
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, [enabled]);
}
