(function () {
  const OPEN_BTN_ID = "open-applications-btn";
  const CONSOLE_PAGE_PATH = "options/options.html";
  const CONSOLE_APPLICATIONS_HASH = "applications";

  function openApplicationsPage() {
    if (!globalThis.chrome || !chrome.runtime || typeof chrome.runtime.getURL !== "function") {
      return;
    }

    const baseUrl = chrome.runtime.getURL(CONSOLE_PAGE_PATH);
    const url = baseUrl + "#" + encodeURIComponent(CONSOLE_APPLICATIONS_HASH);
    if (chrome.tabs && typeof chrome.tabs.update === "function") {
      chrome.tabs.getCurrent(function onCurrent(tab) {
        if (tab && typeof tab.id === "number") {
          chrome.tabs.update(tab.id, { url: url });
          return;
        }
        if (chrome.tabs && typeof chrome.tabs.create === "function") {
          chrome.tabs.create({ url: url });
        }
      });
      return;
    }

    if (chrome.tabs && typeof chrome.tabs.create === "function") {
      chrome.tabs.create({ url: url });
      return;
    }

    if (typeof globalThis.open === "function") {
      globalThis.open(url, "_blank", "noopener");
    }
  }

  const button = document.getElementById(OPEN_BTN_ID);
  if (button) {
    button.addEventListener("click", function onOpen() {
      openApplicationsPage();
    });
  }

  // Keep legacy route backward-compatible but guide users to unified Applications.
  setTimeout(function redirectSoon() {
    openApplicationsPage();
  }, 350);
})();
