export type LiveScope = "storefront" | "admin";

let tabId: string | undefined;
function currentTab() {
  return tabId ??= crypto.randomUUID();
}

export function announceUpdate(scope: LiveScope | "both") {
  if (typeof BroadcastChannel === "undefined") return;
  const channel = new BroadcastChannel("leytech-updates");
  channel.postMessage({ scope, from: currentTab() });
  channel.close();
}

export function listenForUpdates(scope: LiveScope, onUpdate: () => void) {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel("leytech-updates");
  channel.onmessage = ({ data }) => {
    if (data?.from !== currentTab() && (data?.scope === scope || data?.scope === "both")) onUpdate();
  };
  return () => channel.close();
}
