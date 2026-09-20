"use client";

import { useEffect, useState } from "react";

export default function PwaInstallPrompt() {
  const [installEvent, setInstallEvent] = useState(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const alreadyDismissed =
      sessionStorage.getItem("steam-catalog-pwa-dismissed") === "1";

    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      setInstallEvent(event);

      if (!alreadyDismissed) {
        setVisible(true);
      }
    }

    function handleAppInstalled() {
      setInstallEvent(null);
      setVisible(false);
    }

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .catch(() => {});
    }

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  async function install() {
    if (!installEvent) return;

    installEvent.prompt();

    try {
      await installEvent.userChoice;
    } catch {}

    setInstallEvent(null);
    setVisible(false);
  }

  function dismiss() {
    sessionStorage.setItem("steam-catalog-pwa-dismissed", "1");
    setVisible(false);
  }

  if (!visible || !installEvent) {
    return null;
  }

  return (
    <div className="pwa-install-prompt">
      <div className="pwa-install-icon">S</div>

      <div className="pwa-install-copy">
        <strong>Game Catalog</strong>
        <span>Установить каталог как приложение</span>
      </div>

      <button
        type="button"
        className="primary-btn pwa-install-btn"
        onClick={install}
      >
        Установить
      </button>

      <button
        type="button"
        className="pwa-dismiss"
        onClick={dismiss}
        aria-label="Закрыть"
      >
        ×
      </button>
    </div>
  );
}
