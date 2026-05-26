// ─── background.js ────────────────────────────────────────────────────────────
// APIs Used:
//   - restcountries.com v4 : population, density        (no key, always current)
//   - disease.sh           : COVID-19 stats by country  (no key)
//   - WHO API              : disease outbreak news      (no key)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const cache = {
  restCountries: { data: null, timestamp: 0 },
  covid: { data: null, timestamp: 0 },
  outbreaks: { data: null, timestamp: 0 },
};

// ─── Install ──────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ extensionEnabled: true });
  console.log("[BG] Extension installed.");
});

// ─── Keyboard shortcut Alt+G ──────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-extension") {
    chrome.storage.sync.get("extensionEnabled", (result) => {
      const newState = !(result.extensionEnabled !== false);
      chrome.storage.sync.set({ extensionEnabled: newState });
      // Notify active tab content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.id) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: "toggleExtension",
            enabled: newState,
          }).catch(() => { });
        }
      });
    });
  }
});

// ─── Message handler ──────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { action } = message;

  if (action === "getCountryData") {
    handleCountryDataRequest(message.countryName)
      .then((data) => sendResponse({ success: true, data }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  if (action === "toggleExtension") {
    chrome.storage.sync.set({ extensionEnabled: message.enabled });
    return true;
  }

  if (action === "getExtensionState") {
    chrome.storage.sync.get("extensionEnabled", (result) => {
      sendResponse({ enabled: result.extensionEnabled !== false });
    });
    return true;
  }
});

// ─── Main handler ─────────────────────────────────────────────────────────────
async function handleCountryDataRequest(countryName) {
  const [rcResult, covidResult, outbreakResult] = await Promise.allSettled([
    getRestCountriesData(countryName),
    getCovidData(countryName),
    getOutbreakData(countryName),
  ]);

  const demographics = rcResult.status === "fulfilled" ? rcResult.value : null;

  const countryData = {
    countryName,
    demographics,
    covid: covidResult.status === "fulfilled" ? covidResult.value : null,
    outbreaks: outbreakResult.status === "fulfilled" ? outbreakResult.value : [],
    fetchedAt: new Date().toISOString(),
  };

  chrome.storage.sync.set({ lastCountry: countryData });
  return countryData;
}

// ─── restcountries.com v4 — population + density ─────────────────────────────
// Returns: { country, population, density }
async function getRestCountriesData(countryName) {
  const now = Date.now();

  if (cache.restCountries.data && now - cache.restCountries.timestamp < CACHE_TTL_MS) {
    return findInRestCountries(cache.restCountries.data, countryName);
  }

  const url = "https://restcountries.com/v4/all?fields=name,population,density,area,capital,flag,cca3";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`restcountries API error: ${response.status}`);

  const raw = await response.json();

  // Build lookup map: lowercase name → entry (index both common + official names)
  const map = {};
  raw.forEach((c) => {
    const entry = {
      country: c.name?.common,
      countryCode: c.cca3 || null,
      population: c.population ?? null,
      area: c.area ?? null,
      density: c.density ?? null,
      capital: c.capital ? c.capital[0] : null,
      flag: c.flag?.emoji || "🌍",
    };
    const common = c.name?.common?.toLowerCase();
    const official = c.name?.official?.toLowerCase();
    if (common) map[common] = entry;
    if (official && official !== common) map[official] = entry;
  });

  cache.restCountries = { data: map, timestamp: now };
  return findInRestCountries(map, countryName);
}

function findInRestCountries(map, countryName) {
  if (!map) return null;
  const q = countryName.toLowerCase().trim();

  // 1. Exact match
  if (map[q]) return map[q];

  // 2. Partial match — query contains key or key contains query
  const key = Object.keys(map).find(
    (k) => k.includes(q) || q.includes(k)
  );
  return key ? map[key] : null;
}

// ─── disease.sh — COVID-19 stats ─────────────────────────────────────────────
async function getCovidData(countryName) {
  const now = Date.now();

  if (cache.covid.data && now - cache.covid.timestamp < CACHE_TTL_MS) {
    return findInCovid(cache.covid.data, countryName);
  }

  const url = "https://disease.sh/v3/covid-19/countries?allowNull=true";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`disease.sh error: ${response.status}`);

  const data = await response.json();
  cache.covid = { data, timestamp: now };
  return findInCovid(data, countryName);
}

function findInCovid(data, countryName) {
  if (!data) return null;
  const q = countryName.toLowerCase().trim();

  const match = data.find((c) => {
    const name = c.country?.toLowerCase();
    return name === q || name?.includes(q) || q.includes(name);
  });
  if (!match) return null;

  return {
    country: match.country,
    cases: match.cases,
    todayCases: match.todayCases,
    deaths: match.deaths,
    todayDeaths: match.todayDeaths,
    recovered: match.recovered,
    active: match.active,
    critical: match.critical,
    casesPerMillion: match.casesPerOneMillion,
    deathsPerMillion: match.deathsPerOneMillion,
    tests: match.tests,
    testsPerMillion: match.testsPerOneMillion,
    updated: match.updated,
  };
}

// ─── WHO — Disease Outbreak News ─────────────────────────────────────────────
async function getOutbreakData(countryName) {
  const now = Date.now();

  if (cache.outbreaks.data && now - cache.outbreaks.timestamp < CACHE_TTL_MS) {
    return filterOutbreaks(cache.outbreaks.data, countryName);
  }

  const url =
    "https://www.who.int/api/news/diseaseoutbreaknews" +
    "?sf_culture=en&$top=100&$orderby=PublicationDateAndTime%20desc";

  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`WHO API error: ${response.status}`);
    const json = await response.json();
    const items = json?.value || [];
    cache.outbreaks = { data: items, timestamp: now };
    return filterOutbreaks(items, countryName);
  } catch {
    return [];
  }
}

function filterOutbreaks(items, countryName) {
  if (!items?.length) return [];
  const q = countryName.toLowerCase().trim();

  return items
    .filter((item) => {
      const title = (item.Title || "").toLowerCase();
      const summary = (item.Summary || "").toLowerCase();
      return title.includes(q) || summary.includes(q);
    })
    .slice(0, 5)
    .map((item) => ({
      title: item.Title,
      date: item.PublicationDateAndTime,
      url: item.Url || item.UrlName,
      summary: item.Summary?.slice(0, 200),
    }));
}