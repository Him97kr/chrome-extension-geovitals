// ─── background.js ────────────────────────────────────────────────────────────
// APIs Used:
//   - restcountries.com v4 : population, density        (no key, always current)
//   - disease.sh           : COVID-19 stats by country  (no key)
//   - WHO API              : disease outbreak news      (no key)
//   - passport-index API   : visa requirements          (no key)
//   - Google News RSS      : recent news headlines      (no key)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000;  // 30 minutes
const CACHE_TTL_NEWS_MS = 5 * 60 * 1000;  //  5 minutes for news

const cache = {
  restCountries: { data: null, timestamp: 0 },
  covid: { data: null, timestamp: 0 },
  outbreaks: { data: null, timestamp: 0 },
  visa: { data: null, timestamp: 0 },  // keyed by baseCountry ISO2
  news: {},                             // keyed by countryName
};

// ─── Install ──────────────────────────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ extensionEnabled: true });
  // Auto-detect base country from browser locale on first install
  detectCountry().then((detected) => {
    chrome.storage.sync.get("baseCountry", (r) => {
      if (!r.baseCountry && detected) {
        chrome.storage.sync.set({ baseCountry: detected });
      }
    });
  });
  console.log("[BG] Extension installed.");
});

async function detectCountry() {
  try {
    // e.g. "en-IN" → "IN", "zh-CN" → "CN", "en-US" → "US"
    const languages = await new Promise((resolve) => {
      chrome.i18n.getAcceptLanguages((list) => resolve(list || []));
    });
    if (languages.length === 0 && navigator.language) {
      languages.push(navigator.language);
    }
    for (const locale of languages) {
      if (locale.includes('-')) {
        const countryCode = locale.split('-')[1].toUpperCase();
        // Ensure it's a standard 2-letter country code (ignores variant scripts like 'en-US-variant')
        if (countryCode.length === 2) {
          return countryCode;
        }
      }
    }
    return "US"; // Fallback to US if no valid country code found
  } catch {
    console.error("Failed to auto-detect country:", error);
    return "US"; // Safe default
  }
}

// ─── Keyboard shortcut Alt+G ──────────────────────────────────────────────────
chrome.commands.onCommand.addListener((command) => {
  if (command === "toggle-extension") {
    chrome.storage.sync.get("extensionEnabled", (result) => {
      const newState = !(result.extensionEnabled !== false);
      chrome.storage.sync.set({ extensionEnabled: newState });
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
    handleCountryDataRequest(message.countryName, message.baseCountry)
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

  if (action === "detectBaseCountry") {
    detectCountry().then((detected) => {
      sendResponse({ iso2: detected });
    });
    return true;
  }
});

// ─── Main handler ─────────────────────────────────────────────────────────────
async function handleCountryDataRequest(countryName, baseCountry) {
  const [rcResult, covidResult, outbreakResult, visaResult, newsResult] =
    await Promise.allSettled([
      getRestCountriesData(countryName),
      getCovidData(countryName),
      getOutbreakData(countryName),
      baseCountry ? getVisaData(baseCountry, countryName) : Promise.resolve(null),
      getNewsData(countryName),
    ]);

  const demographics = rcResult.status === "fulfilled" ? rcResult.value : null;

  const countryData = {
    countryName,
    demographics,
    covid: covidResult.status === "fulfilled" ? covidResult.value : null,
    outbreaks: outbreakResult.status === "fulfilled" ? outbreakResult.value : [],
    visa: visaResult.status === "fulfilled" ? visaResult.value : null,
    news: newsResult.status === "fulfilled" ? newsResult.value : [],
    fetchedAt: new Date().toISOString(),
  };

  chrome.storage.sync.set({ lastCountry: countryData });
  return countryData;
}

// ─── restcountries.com v4 ─────────────────────────────────────────────────────
async function getRestCountriesData(countryName) {
  const now = Date.now();
  if (cache.restCountries.data && now - cache.restCountries.timestamp < CACHE_TTL_MS) {
    return findInRestCountries(cache.restCountries.data, countryName);
  }

  const url = "https://restcountries.com/v4/all?fields=name,population,density,area,capital,flag,cca3,cca2";
  const response = await fetch(url);
  if (!response.ok) throw new Error(`restcountries API error: ${response.status}`);
  const raw = await response.json();

  const map = {};
  raw.forEach((c) => {
    const entry = {
      country: c.name?.common,
      countryCode: c.cca3 || null,
      iso2: c.cca2 || null,
      population: c.population ?? null,
      area: c.area ?? null,
      density: c.density ?? null,
      capital: c.capital ? c.capital[0] : null,
      flag: c.flag
        ? `<img height="20" width="30" src="${c.flag?.svg}" alt="${c.flag?.alt}" />`
        : "🌍",
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
  if (map[q]) return map[q];
  const key = Object.keys(map).find((k) => k.includes(q) || q.includes(k));
  return key ? map[key] : null;
}

// ─── disease.sh — COVID-19 ────────────────────────────────────────────────────
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

async function getVisaData(baseCountry, destCountry) {
  const base = await resolveISO2(baseCountry);
  const dest = await resolveISO2(destCountry);
  if (!dest) return null;
  if (dest.toUpperCase() === base.toUpperCase()) {
    return { access: "home", dest, base };
  }
  const cacheKey = `${base}_${dest}`;
  const now = Date.now();
  if (
    cache.visa[cacheKey] &&
    now - cache.visa[cacheKey].timestamp < CACHE_TTL_MS
  ) {
    return cache.visa[cacheKey].data;
  }
  try {
    const PASSPORT_DATA_URL = 'https://cdn.jsdelivr.net/gh/imorte/passport-index-data/passport-index.json';
    const response = await fetch(PASSPORT_DATA_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const json = await response.json();
    // Drill down: Passport Country -> Destination Country
    if (json[base]) {
      if (json[base][dest]) {
        const access = json[base][dest]?.status || null;
        const result = {
          access: access,
          dest,
          base,
          // days allowed for visa-free / VoA, if the API returns it
          dur: json[base][dest]?.days ?? null,
        };
        cache.visa[cacheKey] = { data: result, timestamp: now };
        return result;
      }
      return "No data found for this destination.";
    }
    return "Invalid or unsupported passport country code.";
  } catch {
    return null;
  }
}


async function resolveISO2(countryName) {
  // Make sure restcountries cache is warm
  try {
    if (!cache.restCountries.data) {
      await getRestCountriesData(countryName);
    }
    const entry = findInRestCountries(cache.restCountries.data, countryName);
    return entry?.iso2 || null;
  } catch {
    return null;
  }
}

// ─── Google News RSS — News Context ──────────────────────────────────────────
// Fetches Google News RSS for the country, parses titles + links from XML
async function getNewsData(countryName) {
  const now = Date.now();
  const cacheKey = countryName.toLowerCase().trim();

  if (
    cache.news[cacheKey] &&
    now - cache.news[cacheKey].timestamp < CACHE_TTL_NEWS_MS
  ) {
    return cache.news[cacheKey].data;
  }

  try {
    const query = encodeURIComponent(`"${countryName}"`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google News RSS error: ${response.status}`);

    const text = await response.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "application/xml");
    const items = Array.from(doc.querySelectorAll("item")).slice(0, 5);

    const news = items.map((item) => {
      const title = item.querySelector("title")?.textContent || "";
      const link = item.querySelector("link")?.textContent || "";
      const pubDate = item.querySelector("pubDate")?.textContent || "";
      const source = item.querySelector("source")?.textContent || "";

      // Google News wraps real URL in the link; clean up title suffix "- Source"
      const cleanTitle = title.replace(/\s*-\s*[^-]+$/, "").trim();

      return { title: cleanTitle, link, pubDate, source };
    });

    cache.news[cacheKey] = { data: news, timestamp: now };
    return news;
  } catch {
    return [];
  }
}