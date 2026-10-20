"use client";
import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then((registration) => {
      if (active) return registration.update();
      return undefined;
    }).catch(() => undefined);
    return () => { active = false; };
  }, []);
  return null;
}
