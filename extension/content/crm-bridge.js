(() => {
  const SOURCE = "kinetic-extension";

  function hello() {
    const payload = {
      source: SOURCE,
      type: "KINETIC_HELLO",
      version: chrome.runtime.getManifest().version,
      extensionId: chrome.runtime.id,
      at: Date.now(),
    };
    window.postMessage(payload, window.location.origin);
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    if (event.origin !== window.location.origin) return;
    const data = event.data;
    if (!data || data.source === SOURCE) return;
    if (data.type === "KINETIC_PING_REQUEST") hello();
  });

  hello();
  // Re-announce after SPA navigations / late listeners
  setTimeout(hello, 400);
  setTimeout(hello, 1500);
})();
