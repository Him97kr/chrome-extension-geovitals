// ─── background.js ────────────────────────────────────────────────────────────
// APIs Used:
//   - restcountries.com v4 : population, density        (no key, always current)
//   - disease.sh           : COVID-19 stats by country  (no key)
//   - WHO API              : disease outbreak news      (no key)
//   - passport-index CDN   : visa requirements          (no key)
//   - Google News RSS      : recent news headlines      (no key)
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 30 * 60 * 1000;  // 30 minutes
const CACHE_TTL_NEWS_MS = 5 * 60 * 1000;  //  5 minutes for news

const cache = {
  restCountries: { data: null, timestamp: 0 },
  covid: { data: null, timestamp: 0 },
  outbreaks: { data: null, timestamp: 0 },
  visa: {},   // FIX: keyed by "BASE_DEST" string, not a single object
  news: {},   // keyed by countryName
};

// Separate top-level cache for the full passport index JSON (fetched once)
let passportDataCache = { data: null, timestamp: 0 };

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

// ─── Locale → ISO2 via chrome.i18n (MV3-compliant) ───────────────────────────
async function detectCountry() {
  try {
    const languages = await new Promise((resolve) => {
      chrome.i18n.getAcceptLanguages((list) => resolve(list || []));
    });
    // Fallback: navigator.language if chrome.i18n returns nothing
    if (languages.length === 0 && navigator.language) {
      languages.push(navigator.language);
    }
    for (const locale of languages) {
      if (locale.includes("-")) {
        const countryCode = locale.split("-")[1].toUpperCase();
        // Only accept 2-letter region codes (ignore script tags like zh-Hant-TW)
        if (countryCode.length === 2) return countryCode;
      }
    }
    return "US"; // Safe fallback
  } catch (error) {  // FIX: was `catch {` — `error` was undefined in the body
    console.error("Failed to auto-detect country:", error);
    return "US";
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

  // FIX: added — needed for "Change passport →" link in the tooltip
  if (action === "openOptionsPage") {
    chrome.runtime.openOptionsPage();
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

// ─── Passport Index (jsdelivr CDN) — Visa Requirements ───────────────────────
// Data shape: { "IN": { "JP": { status: "visa free", days: 90 }, ... }, ... }
const PASSPORT_DATA_URL =
  "https://cdn.jsdelivr.net/gh/imorte/passport-index-data/passport-index.json";

async function getVisaData(baseCountry, destCountry) {
  const base = await resolveISO2(baseCountry);
  const dest = await resolveISO2(destCountry);
  if (!dest) return null;   // FIX: was returning error strings, now always null
  if (!base) return null;
  if (dest.toUpperCase() === base.toUpperCase()) {
    return { access: "home", dest, base };
  }

  const cacheKey = `${base}_${dest}`;
  const now = Date.now();

  if (cache.visa[cacheKey] && now - cache.visa[cacheKey].timestamp < CACHE_TTL_MS) {
    return cache.visa[cacheKey].data;
  }

  try {
    // FIX: fetch full passport index once into passportDataCache (30 min TTL)
    // instead of re-fetching on every hover
    if (!passportDataCache.data || now - passportDataCache.timestamp > CACHE_TTL_MS) {
      const response = await fetch(PASSPORT_DATA_URL);
      if (!response.ok) throw new Error(`Passport index HTTP ${response.status}`);
      passportDataCache = { data: await response.json(), timestamp: now };
    }

    const json = passportDataCache.data;

    if (!json[base]) return null;  // FIX: was returning string
    const entry = json[base][dest];
    if (!entry) return null;  // FIX: was returning string

    const result = {
      access: entry.status ?? null,
      dest,
      base,
      dur: entry.days ?? null,
    };

    cache.visa[cacheKey] = { data: result, timestamp: now };
    return result;
  } catch (err) {
    console.error("[BG] getVisaData error:", err);
    return null;
  }
}

async function resolveISO2(countryName) {
  if (!countryName) return null;
  // Already a 2-letter ISO2 code — pass straight through
  if (typeof countryName === "string" && countryName.length === 2) {
    return countryName.toUpperCase();
  }
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
// NOTE: DOMParser / querySelectorAll are NOT available in MV3 service workers.
// We parse the RSS XML with regex instead.
async function getNewsData(countryName) {
  const now = Date.now();
  const cacheKey = countryName.toLowerCase().trim();

  if (cache.news[cacheKey] && now - cache.news[cacheKey].timestamp < CACHE_TTL_NEWS_MS) {
    return cache.news[cacheKey].data;
  }

  try {
    const query = encodeURIComponent(`"${countryName}"`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Google News RSS error: ${response.status}`);

    const text = await response.text();

    // Extract all <item>…</item> blocks
    const itemBlocks = [];
    const itemRe = /<item>([\s\S]*?)<\/item>/g;
    let m;
    while ((m = itemRe.exec(text)) !== null && itemBlocks.length < 5) {
      itemBlocks.push(m[1]);
    }

    // Helper: pull first tag value, stripping CDATA wrappers
    function extractTag(block, tag) {
      const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\/${tag}>`, "i");
      const hit = re.exec(block);
      if (!hit) return "";
      return hit[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
    }

    const news = itemBlocks.map((block) => {
      const rawTitle = extractTag(block, "title");
      const link = extractTag(block, "link");
      const pubDate = extractTag(block, "pubDate");
      const source = extractTag(block, "source");
      // Strip trailing " - Source Name" appended by Google News
      const title = rawTitle.replace(/\s*-\s*[^-]+$/, "").trim();
      return { title, link, pubDate, source };
    });

    cache.news[cacheKey] = { data: news, timestamp: now };
    return news;
  } catch (err) {
    console.error("[BG] getNewsData error:", err);
    return [];
  }
}
