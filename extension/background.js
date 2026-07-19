chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.get(["apiBase"], (data) => {
    if (!data.apiBase) {
      chrome.storage.sync.set({ apiBase: "http://localhost:3000" });
    }
  });
});
