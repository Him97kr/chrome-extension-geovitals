// popup.js — GeoVitals v1.1.6

// ── DOM refs ──────────────────────────────────────────────────────────────────
const toggleBtn = document.getElementById("toggleBtn");
const statusLabel = document.getElementById("statusLabel");
const statusSub = document.getElementById("statusSub");
const statusText = document.getElementById("statusText");
const logoDot = document.getElementById("logoDot");
const ringProgress = document.getElementById("ringProgress");
const statCard1 = document.getElementById("statCard1");
const statCard2 = document.getElementById("statCard2");
const sessionTime = document.getElementById("sessionTime");
const optionsLink = document.getElementById("optionsLink");
const currentTab = document.getElementById("currentTab");
const lastCountryCard = document.getElementById("lastCountryCard");
const lastCountryName = document.getElementById("lastCountryName");
const lastCountryMeta = document.getElementById("lastCountryMeta");
const geoqueryLink = document.getElementById("geoqueryLink");

// ── State ─────────────────────────────────────────────────────────────────────
let isEnabled = true;
let sessionStart = Date.now();
let sessionTimer = null;

// ── Load saved state ──────────────────────────────────────────────────────────
chrome.storage.sync.get(
  ["extensionEnabled", "sessionStart", "lastCountry"],
  (result) => {
    isEnabled = result.extensionEnabled !== undefined ? result.extensionEnabled : true;
    sessionStart = result.sessionStart || Date.now();
    updateUI(isEnabled);
    startSessionTimer();
    renderLastCountry(result.lastCountry || null);
  }
);

// ── Toggle ────────────────────────────────────────────────────────────────────
toggleBtn.addEventListener("click", () => {
  isEnabled = !isEnabled;
  chrome.storage.sync.set({
    extensionEnabled: isEnabled,
    sessionStart: isEnabled ? Date.now() : null,
  });
  if (isEnabled) {
    sessionStart = Date.now();
    startSessionTimer();
  } else {
    clearInterval(sessionTimer);
    sessionTime.textContent = "00:00";
  }
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]?.id) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: "toggleExtension",
        enabled: isEnabled,
      }).catch(() => { });
    }
  });
  updateUI(isEnabled);
});

// ── Update UI ─────────────────────────────────────────────────────────────────
function updateUI(enabled) {
  if (enabled) {
    toggleBtn.classList.add("on");
    toggleBtn.classList.remove("off");
    statusLabel.classList.remove("off");
    logoDot.classList.remove("off");
    ringProgress.classList.remove("off");
    statusLabel.textContent = "ACTIVE";
    statusSub.textContent = "Extension is running";
    statusText.textContent = "Enabled";
    statCard1.classList.add("active");
    statCard2.classList.add("active");
  } else {
    toggleBtn.classList.remove("on");
    toggleBtn.classList.add("off");
    statusLabel.classList.add("off");
    logoDot.classList.add("off");
    ringProgress.classList.add("off");
    statusLabel.textContent = "PAUSED";
    statusSub.textContent = "Extension is disabled";
    statusText.textContent = "Disabled";
    statCard1.classList.remove("active");
    statCard2.classList.remove("active");
  }
}

// ── Session timer ─────────────────────────────────────────────────────────────
function startSessionTimer() {
  clearInterval(sessionTimer);
  sessionTimer = setInterval(() => {
    if (!isEnabled) return;
    const elapsed = Math.floor((Date.now() - sessionStart) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, "0");
    const secs = String(elapsed % 60).padStart(2, "0");
    sessionTime.textContent = `${mins}:${secs}`;
  }, 1000);
}

// ── Last hovered country ──────────────────────────────────────────────────────
function renderLastCountry(country) {
  if (!country) {
    lastCountryName.innerHTML = '<span class="last-country-empty">Hover a country to see data</span>';
    lastCountryMeta.textContent = "";
    lastCountryCard.style.cursor = "default";
    return;
  }

  const fmt = (n) => n != null ? Number(n).toLocaleString() : "N/A";

  lastCountryName.innerHTML = `
    <span>${country.demographics?.flag}</span>
    <span>${country.countryName}</span>
  `;
  lastCountryMeta.innerHTML =
    `<div>Population : <span>${fmt(country.demographics?.population)}</span></div>
      <div>Area (km²) : <span>${fmt(country.demographics?.area)}</span></div>
      <div>Density (per km²) : <span>${country.demographics?.density ? country.demographics.density.toFixed(1) + "/km²" : "N/A"}</span></div>
      <div>Capital : <span>${country.demographics?.capital || "N/A"}</span></div>`;

  // Clicking opens GeoQuery dashboard filtered to this country
  lastCountryCard.style.cursor = "pointer";
  lastCountryCard.onclick = () => {
    chrome.tabs.create({
      // Use ?redirect= pattern so GitHub Pages 404.html redirects correctly
      // React Router picks this up via the index.html redirect script
      url: country.demographics?.countryCode
        ? `https://him97kr.github.io/geoquery-dashboard/?redirect=/country/${country.demographics.countryCode}`
        : `https://him97kr.github.io/geoquery-dashboard/`,
    });
  };
}

// Listen for last country updates from content script
chrome.storage.onChanged.addListener((changes) => {
  if (changes.lastCountry) {
    renderLastCountry(changes.lastCountry.newValue);
  }
});

// ── Options page ──────────────────────────────────────────────────────────────
optionsLink.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

// ── Current tab hostname ──────────────────────────────────────────────────────
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

// ── GeoQuery link ─────────────────────────────────────────────────────────────
geoqueryLink.addEventListener("click", (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: "https://him97kr.github.io/geoquery-dashboard" });
});
