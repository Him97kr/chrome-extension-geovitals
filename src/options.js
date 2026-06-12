// options.js — GeoVitals v1.1.5

// ── DOM refs ──────────────────────────────────────────────────────────────────
const showCovidToggle = document.getElementById("showCovid");
const showWHOToggle = document.getElementById("showWHO");
const showVisaToggle = document.getElementById("showVisa");
const showNewsToggle = document.getElementById("showNews");
const highlightLinksToggle = document.getElementById("highlightLinks");
const exclusionInput = document.getElementById("exclusionInput");
const addExclusionBtn = document.getElementById("addExclusion");
const exclusionList = document.getElementById("exclusionList");
const exclusionEmpty = document.getElementById("exclusionEmpty");
const savedIndicator = document.getElementById("savedIndicator");
const baseCountrySelect = document.getElementById("baseCountrySelect");
const detectCountryBtn = document.getElementById("detectCountryBtn");

// ── State ─────────────────────────────────────────────────────────────────────
let excludedCountries = [];

// ── Country list for base-country selector ────────────────────────────────────
const COUNTRY_LIST = [
  ["AF", "Afghanistan"], ["AL", "Albania"], ["DZ", "Algeria"], ["AO", "Angola"],
  ["AR", "Argentina"], ["AM", "Armenia"], ["AU", "Australia"], ["AT", "Austria"],
  ["AZ", "Azerbaijan"], ["BS", "Bahamas"], ["BH", "Bahrain"], ["BD", "Bangladesh"],
  ["BY", "Belarus"], ["BE", "Belgium"], ["BZ", "Belize"], ["BJ", "Benin"],
  ["BT", "Bhutan"], ["BO", "Bolivia"], ["BA", "Bosnia and Herzegovina"],
  ["BW", "Botswana"], ["BR", "Brazil"], ["BN", "Brunei"], ["BG", "Bulgaria"],
  ["BF", "Burkina Faso"], ["BI", "Burundi"], ["KH", "Cambodia"], ["CM", "Cameroon"],
  ["CA", "Canada"], ["TD", "Chad"], ["CL", "Chile"], ["CN", "China"], ["CO", "Colombia"],
  ["CG", "Congo"], ["CR", "Costa Rica"], ["HR", "Croatia"], ["CU", "Cuba"],
  ["CY", "Cyprus"], ["CZ", "Czech Republic"], ["DK", "Denmark"], ["DJ", "Djibouti"],
  ["DO", "Dominican Republic"], ["EC", "Ecuador"], ["EG", "Egypt"], ["SV", "El Salvador"],
  ["EE", "Estonia"], ["ET", "Ethiopia"], ["FJ", "Fiji"], ["FI", "Finland"], ["FR", "France"],
  ["GA", "Gabon"], ["GM", "Gambia"], ["GE", "Georgia"], ["DE", "Germany"], ["GH", "Ghana"],
  ["GR", "Greece"], ["GT", "Guatemala"], ["GN", "Guinea"], ["HT", "Haiti"],
  ["HN", "Honduras"], ["HU", "Hungary"], ["IS", "Iceland"], ["IN", "India"],
  ["ID", "Indonesia"], ["IR", "Iran"], ["IQ", "Iraq"], ["IE", "Ireland"], ["IL", "Israel"],
  ["IT", "Italy"], ["JM", "Jamaica"], ["JP", "Japan"], ["JO", "Jordan"], ["KZ", "Kazakhstan"],
  ["KE", "Kenya"], ["KW", "Kuwait"], ["KG", "Kyrgyzstan"], ["LA", "Laos"], ["LV", "Latvia"],
  ["LB", "Lebanon"], ["LR", "Liberia"], ["LY", "Libya"], ["LT", "Lithuania"],
  ["LU", "Luxembourg"], ["MG", "Madagascar"], ["MW", "Malawi"], ["MY", "Malaysia"],
  ["MV", "Maldives"], ["ML", "Mali"], ["MT", "Malta"], ["MR", "Mauritania"],
  ["MU", "Mauritius"], ["MX", "Mexico"], ["MD", "Moldova"], ["MN", "Mongolia"],
  ["ME", "Montenegro"], ["MA", "Morocco"], ["MZ", "Mozambique"], ["MM", "Myanmar"],
  ["NA", "Namibia"], ["NP", "Nepal"], ["NL", "Netherlands"], ["NZ", "New Zealand"],
  ["NI", "Nicaragua"], ["NE", "Niger"], ["NG", "Nigeria"], ["KP", "North Korea"],
  ["NO", "Norway"], ["OM", "Oman"], ["PK", "Pakistan"], ["PA", "Panama"], ["PY", "Paraguay"],
  ["PE", "Peru"], ["PH", "Philippines"], ["PL", "Poland"], ["PT", "Portugal"],
  ["QA", "Qatar"], ["RO", "Romania"], ["RU", "Russia"], ["RW", "Rwanda"],
  ["SA", "Saudi Arabia"], ["SN", "Senegal"], ["RS", "Serbia"], ["SL", "Sierra Leone"],
  ["SG", "Singapore"], ["SK", "Slovakia"], ["SI", "Slovenia"], ["SO", "Somalia"],
  ["ZA", "South Africa"], ["KR", "South Korea"], ["SS", "South Sudan"], ["ES", "Spain"],
  ["LK", "Sri Lanka"], ["SD", "Sudan"], ["SE", "Sweden"], ["CH", "Switzerland"],
  ["SY", "Syria"], ["TW", "Taiwan"], ["TJ", "Tajikistan"], ["TZ", "Tanzania"],
  ["TH", "Thailand"], ["TG", "Togo"], ["TT", "Trinidad and Tobago"], ["TN", "Tunisia"],
  ["TR", "Turkey"], ["TM", "Turkmenistan"], ["UG", "Uganda"], ["UA", "Ukraine"],
  ["AE", "United Arab Emirates"], ["GB", "United Kingdom"], ["US", "United States"],
  ["UY", "Uruguay"], ["UZ", "Uzbekistan"], ["VE", "Venezuela"], ["VN", "Vietnam"],
  ["YE", "Yemen"], ["ZM", "Zambia"], ["ZW", "Zimbabwe"],
];

// ── Populate base country dropdown ────────────────────────────────────────────
function populateCountrySelect(selectedISO2) {
  if (!baseCountrySelect) return;
  baseCountrySelect.innerHTML = '<option value="">— Select your passport country —</option>';
  COUNTRY_LIST.forEach(([iso2, name]) => {
    const opt = document.createElement("option");
    opt.value = iso2;
    opt.textContent = `${name} (${iso2})`;
    if (iso2 === selectedISO2) opt.selected = true;
    baseCountrySelect.appendChild(opt);
  });
}

// ── Load settings ─────────────────────────────────────────────────────────────
chrome.storage.sync.get(
  ["showCovid", "showWHO", "showVisa", "showNews", "highlightLinks", "excludedCountries", "baseCountry", "baseCountryName"],
  (result) => {
    showCovidToggle.checked = result.showCovid !== false;
    showWHOToggle.checked = result.showWHO !== false;
    showVisaToggle.checked = result.showVisa !== false;
    showNewsToggle.checked = result.showNews !== false;
    highlightLinksToggle.checked = result.highlightLinks !== false;
    excludedCountries = result.excludedCountries || [];
    renderExclusionList();
    populateCountrySelect(result.baseCountry || "");
  }
);

// ── Auto-detect passport country ──────────────────────────────────────────────
if (detectCountryBtn) {
  detectCountryBtn.addEventListener("click", () => {
    detectCountryBtn.textContent = "Detecting…";
    detectCountryBtn.disabled = true;
    chrome.runtime.sendMessage({ action: "detectBaseCountry" }, (response) => {
      detectCountryBtn.textContent = "Auto-detect";
      detectCountryBtn.disabled = false;
      if (response?.iso2) {
        populateCountrySelect(response.iso2);
        baseCountrySelect.value = response.iso2;
        saveSettings();
      }
    });
  });
}

// ── Exclusion list ────────────────────────────────────────────────────────────
function renderExclusionList() {
  Array.from(exclusionList.querySelectorAll(".exclusion-tag")).forEach((el) => el.remove());

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
      excludedCountries = excludedCountries.filter((c) => c !== e.currentTarget.dataset.country);
      renderExclusionList();
      saveSettings();
    });
    exclusionList.appendChild(tag);
  });
}

function addExclusion() {
  const val = exclusionInput.value.trim();
  if (!val) return;
  const formatted = val.charAt(0).toUpperCase() + val.slice(1);
  if (!excludedCountries.includes(formatted)) {
    excludedCountries.push(formatted);
    renderExclusionList();
    saveSettings();
  }
  exclusionInput.value = "";
  exclusionInput.focus();
}

addExclusionBtn.addEventListener("click", addExclusion);
exclusionInput.addEventListener("keydown", (e) => { if (e.key === "Enter") addExclusion(); });


// ── Auto-save ─────────────────────────────────────────────────────────────────
// Called after every change — no save button needed
let saveTimer = null;

function saveSettings() {
  const selectedISO2 = baseCountrySelect?.value || null;
  const selectedName = selectedISO2
    ? (COUNTRY_LIST.find(([iso2]) => iso2 === selectedISO2)?.[1] || null)
    : null;

  const settings = {
    showCovid: showCovidToggle.checked,
    showWHO: showWHOToggle.checked,
    showVisa: showVisaToggle.checked,
    showNews: showNewsToggle.checked,
    highlightLinks: highlightLinksToggle.checked,
    excludedCountries: excludedCountries,
    baseCountry: selectedISO2,
    baseCountryName: selectedName,
  };

  chrome.storage.sync.set(settings, () => {
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { action: "updateSettings", settings }).catch(() => { });
      });
    });
    if (savedIndicator) {
      savedIndicator.classList.add("show");
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => savedIndicator.classList.remove("show"), 1500);
    }
  });
}

// Wire auto-save to all toggle inputs and the country select
[showCovidToggle, showWHOToggle, showVisaToggle, showNewsToggle, highlightLinksToggle].forEach(
  (el) => el?.addEventListener("change", saveSettings)
);
baseCountrySelect?.addEventListener("change", saveSettings);
