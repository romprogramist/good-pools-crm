"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .getRegistration("/")
      .then((reg) => {
        if (!reg) {
          return navigator.serviceWorker.register("/serwist/sw.js", { scope: "/" });
        }
      })
      .catch((err) => {
        console.warn("[PwaRegister] SW register failed", err);
      });
  }, []);
  return null;
}
