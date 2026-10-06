(() => {
  const byId = (id) => document.getElementById(id);
  const webApp = window.Telegram?.WebApp;
  const readyStatus = byId("ready-status");
  const themeStatus = byId("theme-status");
  const viewportStatus = byId("viewport-status");
  const controlsStatus = byId("controls-status");
  const initDataStatus = byId("initdata-status");
  let mainButtonVisible = false;
  let backButtonVisible = false;

  function setStatus(element, message, state) {
    element.textContent = message;
    if (state) element.dataset.state = state;
  }

  function updateTheme() {
    if (!webApp) {
      setStatus(themeStatus, "Host unavailable", "unavailable");
      return;
    }
    const scheme = webApp.colorScheme === "dark" ? "Dark" : "Light";
    setStatus(themeStatus, `${scheme} theme from host`);
  }

  function updateViewport() {
    if (!webApp) {
      setStatus(viewportStatus, "Host unavailable", "unavailable");
      return;
    }
    const height = Number.isFinite(webApp.viewportHeight)
      ? Math.round(webApp.viewportHeight)
      : null;
    const stableHeight = Number.isFinite(webApp.viewportStableHeight)
      ? Math.round(webApp.viewportStableHeight)
      : null;
    const parts = [];
    if (height !== null) parts.push(`height ${height}px`);
    if (stableHeight !== null) parts.push(`stable ${stableHeight}px`);
    setStatus(
      viewportStatus,
      parts.length ? parts.join(" · ") : "Metrics unavailable",
    );
  }

  function updateInitDataPresence() {
    const present =
      typeof webApp?.initData === "string" && webApp.initData.length > 0;
    setStatus(
      initDataStatus,
      present ? "Present (value hidden)" : "Missing",
      present ? "present" : "missing",
    );
  }

  function setControlsMessage(message) {
    controlsStatus.textContent = message;
  }

  byId("main-toggle").addEventListener("click", () => {
    if (!webApp?.MainButton) {
      setControlsMessage(
        "Main button is unavailable outside a supporting Telegram host.",
      );
      return;
    }
    mainButtonVisible = !mainButtonVisible;
    byId("main-toggle").textContent = mainButtonVisible
      ? "Hide main button"
      : "Show main button";
    webApp.MainButton.setText("Tutorial action");
    if (mainButtonVisible) webApp.MainButton.show();
    else webApp.MainButton.hide();
    setControlsMessage(
      mainButtonVisible
        ? "Main button shown in the host."
        : "Main button hidden.",
    );
  });

  byId("back-toggle").addEventListener("click", () => {
    if (!webApp?.BackButton) {
      setControlsMessage(
        "Back button is unavailable outside a supporting Telegram host.",
      );
      return;
    }
    backButtonVisible = !backButtonVisible;
    byId("back-toggle").textContent = backButtonVisible
      ? "Hide back button"
      : "Show back button";
    if (backButtonVisible) webApp.BackButton.show();
    else webApp.BackButton.hide();
    setControlsMessage(
      backButtonVisible
        ? "Back button shown in the host."
        : "Back button hidden.",
    );
  });

  byId("popup-button").addEventListener("click", () => {
    if (!webApp?.showPopup) {
      setControlsMessage("Host popup is unavailable in this browser.");
      return;
    }
    webApp.showPopup(
      {
        title: "Tutorial popup",
        message: "This popup is provided by the Telegram host.",
        buttons: [{ id: "ok", type: "ok", text: "Got it" }],
      },
      (buttonId) =>
        setControlsMessage(buttonId ? "Popup dismissed." : "Popup closed."),
    );
  });

  byId("recheck-data").addEventListener("click", updateInitDataPresence);

  if (webApp) {
    webApp.onEvent?.("themeChanged", updateTheme);
    webApp.onEvent?.("viewportChanged", updateViewport);
    webApp.MainButton?.onClick(() =>
      setControlsMessage("Main button pressed in the host."),
    );
    webApp.BackButton?.onClick(() =>
      setControlsMessage("Back button pressed in the host."),
    );
    webApp.ready();
    setStatus(readyStatus, "Ready signalled", "ready");
  } else {
    setStatus(readyStatus, "Telegram host unavailable", "unavailable");
  }

  updateTheme();
  updateViewport();
  updateInitDataPresence();
})();
