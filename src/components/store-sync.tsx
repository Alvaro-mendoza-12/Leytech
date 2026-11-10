"use client";

import { useRouter } from "next/navigation";
import { useVisiblePolling } from "./use-visible-polling";

export function StoreSync({ revision }: { revision: string }) {
  const router = useRouter();
  useVisiblePolling(async (signal) => {
    const response = await fetch("/api/store/revision", { cache: "no-store", signal });
    if (!response.ok) return;
    const next = await response.json();
    if (!signal.aborted && typeof next.revision === "string" && next.revision !== revision) {
      router.refresh();
    }
  });
  return null;
}
