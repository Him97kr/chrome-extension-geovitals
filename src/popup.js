// ─── DOM References ───────────────────────────────────────────────────────────
const toggleBtn    = document.getElementById("toggleBtn");
const statusLabel  = document.getElementById("statusLabel");
const statusSub    = document.getElementById("statusSub");
const statusText   = document.getElementById("statusText");
const logoDot      = document.getElementById("logoDot");
const ringProgress = document.getElementById("ringProgress");
const statCard1    = document.getElementById("statCard1");
const statCard2    = document.getElementById("statCard2");
const sessionTime  = document.getElementById("sessionTime");
const currentTab   = document.getElementById("currentTab");

// ─── State ────────────────────────────────────────────────────────────────────
let isEnabled = true;
let sessionStart = Date.now();
let sessionTimer = null;

// ─── Load saved state from chrome.storage ────────────────────────────────────
chrome.storage.sync.get(["extensionEnabled", "sessionStart"], (result) => {
  isEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
  sessionStart = result.sessionStart || Date.now();
  updateUI(isEnabled);
  startSessionTimer();
});

// ─── Toggle click handler ─────────────────────────────────────────────────────
toggleBtn.addEventListener("click", () => {
  isEnabled = !isEnabled;

  // Save state
  chrome.storage.sync.set({
    extensionEnabled: isEnabled,
    sessionStart: isEnabled ? Date.now() : null,
  });

  // Reset session timer
  if (isEnabled) {
    sessionStart = Date.now();
    startSessionTimer();
  } else {
    clearInterval(sessionTimer);
    sessionTime.textContent = "00:00";
  }

  // Notify content script on active tab
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "toggleExtension",
        enabled: isEnabled,
      }).catch(() => {
        // Content script may not be injected on this tab — safe to ignore
      });
    }
  });

  updateUI(isEnabled);
});

// ─── Update UI based on state ─────────────────────────────────────────────────
function updateUI(enabled) {
  if (enabled) {
    // ON state
    toggleBtn.classList.add("on");
    toggleBtn.classList.remove("off");
    statusLabel.classList.remove("off");
    logoDot.classList.remove("off");
    ringProgress.classList.remove("off");

    statusLabel.textContent  = "ACTIVE";
    statusSub.textContent    = "Extension is running";
    statusText.textContent   = "Enabled";

    statCard1.classList.add("active");
    statCard2.classList.add("active");
  } else {
    // OFF state
    toggleBtn.classList.remove("on");
    toggleBtn.classList.add("off");
    statusLabel.classList.add("off");
    logoDot.classList.add("off");
    ringProgress.classList.add("off");

    statusLabel.textContent  = "PAUSED";
    statusSub.textContent    = "Extension is disabled";
    statusText.textContent   = "Disabled";

    statCard1.classList.remove("active");
    statCard2.classList.remove("active");
  }
}

// ─── Session Timer ────────────────────────────────────────────────────────────
function startSessionTimer() {
  clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    if (!isEnabled) return;
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const mins    = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs    = String(elapsed % 60).padStart(2, "0");
    sessionTime.textContent = `${mins}:${secs}`;
  }, 1000);
}

// ─── Show current tab hostname ────────────────────────────────────────────────
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs[0]?.url) {
    try {
      const hostname = new URL(tabs[0].url).hostname.replace("www.", "");
      currentTab.textContent = hostname || "active tab";
    } catch {
      currentTab.textContent = "active tab";
    }
  }
});