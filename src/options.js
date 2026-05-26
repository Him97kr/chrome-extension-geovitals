// options.js — GeoVitals v1.1.0

// ── DOM refs ──────────────────────────────────────────────────────────────────
const showCovidToggle    = document.getElementById("showCovid");
const showWHOToggle      = document.getElementById("showWHO");
const highlightLinksToggle = document.getElementById("highlightLinks");
const exclusionInput     = document.getElementById("exclusionInput");
const addExclusionBtn    = document.getElementById("addExclusion");
const exclusionList      = document.getElementById("exclusionList");
const exclusionEmpty     = document.getElementById("exclusionEmpty");
const saveBtn            = document.getElementById("saveBtn");
const saveMsg            = document.getElementById("saveMsg");

// ── State ─────────────────────────────────────────────────────────────────────
let excludedCountries = [];

// ── Load settings ─────────────────────────────────────────────────────────────
chrome.storage.sync.get(
  ["showCovid", "showWHO", "highlightLinks", "excludedCountries"],
  (result) => {
    showCovidToggle.checked      = result.showCovid      !== false;
    showWHOToggle.checked        = result.showWHO        !== false;
    highlightLinksToggle.checked = result.highlightLinks !== false;
    excludedCountries = result.excludedCountries || [];
    renderExclusionList();
  }
);

// ── Exclusion list ────────────────────────────────────────────────────────────
function renderExclusionList() {
  // Clear existing tags (keep empty message)
  Array.from(exclusionList.querySelectorAll(".exclusion-tag")).forEach(
    (el) => el.remove()
  );

  if (excludedCountries.length === 0) {
    exclusionEmpty.style.display = "inline";
    return;
  }

  exclusionEmpty.style.display = "none";

  excludedCountries.forEach((country) => {
    const tag = document.createElement("div");
    tag.className = "exclusion-tag";
    tag.innerHTML = `
      <span>${country}</span>
      <button class="exclusion-remove" data-country="${country}" title="Remove">×</button>
    `;
    tag.querySelector(".exclusion-remove").addEventListener("click", (e) => {
      const name = e.currentTarget.dataset.country;
      excludedCountries = excludedCountries.filter((c) => c !== name);
      renderExclusionList();
    });
    exclusionList.appendChild(tag);
  });
}

function addExclusion() {
  const val = exclusionInput.value.trim();
  if (!val) return;
  // Capitalise first letter
  const formatted = val.charAt(0).toUpperCase() + val.slice(1);
  if (!excludedCountries.includes(formatted)) {
    excludedCountries.push(formatted);
    renderExclusionList();
  }
  exclusionInput.value = "";
  exclusionInput.focus();
}

addExclusionBtn.addEventListener("click", addExclusion);
exclusionInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addExclusion();
});

// ── Save ──────────────────────────────────────────────────────────────────────
saveBtn.addEventListener("click", () => {
  const settings = {
    showCovid:         showCovidToggle.checked,
    showWHO:           showWHOToggle.checked,
    highlightLinks:    highlightLinksToggle.checked,
    excludedCountries: excludedCountries,
  };

  chrome.storage.sync.set(settings, () => {
    // Notify all tabs to refresh with new settings
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, {
          action: "updateSettings",
          settings,
        }).catch(() => {});
      });
    });

    // Show saved message
    saveMsg.classList.add("show");
    setTimeout(() => saveMsg.classList.remove("show"), 2000);
  });
});
