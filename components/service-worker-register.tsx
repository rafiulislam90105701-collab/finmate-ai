"use client";
import { useEffect, useState } from "react";

export function ServiceWorkerRegister() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    let active = true;
    let lastChecked = 0;
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      // A reload can destroy an in-progress OTP or form; let the user decide.
      if (active && hadController) setUpdateAvailable(true);
    };
    const checkForUpdates = () => {
      if (!active || document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - lastChecked < 60_000) return;
      lastChecked = now;
      void navigator.serviceWorker.getRegistration("/").then((registration) => registration?.update()).catch(() => undefined);
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    document.addEventListener("visibilitychange", checkForUpdates);
    window.addEventListener("online", checkForUpdates);
    void navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(() => checkForUpdates()).catch(() => undefined);
    return () => {
      active = false;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", checkForUpdates);
      window.removeEventListener("online", checkForUpdates);
    };
  }, []);
  if (!updateAvailable) return null;
  return <div role="status" aria-live="polite" style={{position:"fixed",bottom:80,left:12,right:12,zIndex:9999,background:"#123b38",color:"#fff",padding:"12px 14px",borderRadius:12,boxShadow:"0 4px 16px #0004",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
    <span style={{fontSize:14}}>FinMate AI has an update. Reload when ready; unsent form inputs may need re-entry.</span>
    <button type="button" onClick={() => location.reload()} style={{padding:"9px 12px",background:"#fff",color:"#123b38",border:0,borderRadius:8,fontWeight:700,cursor:"pointer"}}>Update</button>
  </div>;
}
