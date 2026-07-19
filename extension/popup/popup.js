const apiBase = document.getElementById("apiBase");
const apiKey = document.getElementById("apiKey");
const status = document.getElementById("status");

chrome.storage.sync.get(["apiBase", "apiKey"], (data) => {
  apiBase.value = data.apiBase || "http://localhost:3000";
  apiKey.value = data.apiKey || "";
});

document.getElementById("save").addEventListener("click", async () => {
  await chrome.storage.sync.set({
    apiBase: apiBase.value.trim() || "http://localhost:3000",
    apiKey: apiKey.value.trim(),
  });
  status.textContent = "Saved. Reload LinkedIn/Gmail tabs.";
});
