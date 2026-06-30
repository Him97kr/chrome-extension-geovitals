// ─── background.js ────────────────────────────────────────────────────────────
// APIs Used:
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
// ISO2 → country name for display (used on first install to set baseCountryName)
const ISO2_TO_NAME = {
  AF: "Afghanistan", AL: "Albania", DZ: "Algeria", AO: "Angola", AR: "Argentina",
  AM: "Armenia", AU: "Australia", AT: "Austria", AZ: "Azerbaijan", BS: "Bahamas",
  BH: "Bahrain", BD: "Bangladesh", BY: "Belarus", BE: "Belgium", BZ: "Belize",
  BJ: "Benin", BT: "Bhutan", BO: "Bolivia", BA: "Bosnia and Herzegovina", BW: "Botswana",
  BR: "Brazil", BN: "Brunei", BG: "Bulgaria", BF: "Burkina Faso", BI: "Burundi",
  KH: "Cambodia", CM: "Cameroon", CA: "Canada", TD: "Chad", CL: "Chile", CN: "China",
  CO: "Colombia", CG: "Congo", CR: "Costa Rica", HR: "Croatia", CU: "Cuba", CY: "Cyprus",
  CZ: "Czech Republic", DK: "Denmark", DJ: "Djibouti", DO: "Dominican Republic",
  EC: "Ecuador", EG: "Egypt", SV: "El Salvador", EE: "Estonia", ET: "Ethiopia", FJ: "Fiji",
  FI: "Finland", FR: "France", GA: "Gabon", GM: "Gambia", GE: "Georgia", DE: "Germany",
  GH: "Ghana", GR: "Greece", GT: "Guatemala", GN: "Guinea", HT: "Haiti", HN: "Honduras",
  HU: "Hungary", IS: "Iceland", IN: "India", ID: "Indonesia", IR: "Iran", IQ: "Iraq",
  IE: "Ireland", IL: "Israel", IT: "Italy", JM: "Jamaica", JP: "Japan", JO: "Jordan",
  KZ: "Kazakhstan", KE: "Kenya", KW: "Kuwait", KG: "Kyrgyzstan", LA: "Laos", LV: "Latvia",
  LB: "Lebanon", LR: "Liberia", LY: "Libya", LT: "Lithuania", LU: "Luxembourg",
  MG: "Madagascar", MW: "Malawi", MY: "Malaysia", MV: "Maldives", ML: "Mali", MT: "Malta",
  MR: "Mauritania", MU: "Mauritius", MX: "Mexico", MD: "Moldova", MN: "Mongolia",
  ME: "Montenegro", MA: "Morocco", MZ: "Mozambique", MM: "Myanmar", NA: "Namibia",
  NP: "Nepal", NL: "Netherlands", NZ: "New Zealand", NI: "Nicaragua", NE: "Niger",
  NG: "Nigeria", KP: "North Korea", NO: "Norway", OM: "Oman", PK: "Pakistan", PA: "Panama",
  PY: "Paraguay", PE: "Peru", PH: "Philippines", PL: "Poland", PT: "Portugal", QA: "Qatar",
  RO: "Romania", RU: "Russia", RW: "Rwanda", SA: "Saudi Arabia", SN: "Senegal", RS: "Serbia",
  SL: "Sierra Leone", SG: "Singapore", SK: "Slovakia", SI: "Slovenia", SO: "Somalia",
  ZA: "South Africa", KR: "South Korea", SS: "South Sudan", ES: "Spain", LK: "Sri Lanka",
  SD: "Sudan", SE: "Sweden", CH: "Switzerland", SY: "Syria", TW: "Taiwan", TJ: "Tajikistan",
  TZ: "Tanzania", TH: "Thailand", TG: "Togo", TT: "Trinidad and Tobago", TN: "Tunisia",
  TR: "Turkey", TM: "Turkmenistan", UG: "Uganda", UA: "Ukraine", AE: "United Arab Emirates",
  GB: "United Kingdom", US: "United States", UY: "Uruguay", UZ: "Uzbekistan",
  VE: "Venezuela", VN: "Vietnam", YE: "Yemen", ZM: "Zambia", ZW: "Zimbabwe",
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ extensionEnabled: true });
  // Auto-detect base country from browser locale on first install
  detectCountry().then((detected) => {
    chrome.storage.sync.get("baseCountry", (r) => {
      if (!r.baseCountry && detected) {
        chrome.storage.sync.set({
          baseCountry: detected,
          baseCountryName: ISO2_TO_NAME[detected] || detected,
        });
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
  const [rcResult, covidResult, outbreakResult, visaResult, newsResult, currencyResult] =
    await Promise.allSettled([
      getRestCountriesData(countryName),
      getCovidData(countryName),
      getOutbreakData(countryName),
      baseCountry ? getVisaData(baseCountry, countryName) : Promise.resolve(null),
      getNewsData(countryName, baseCountry),
      baseCountry ? getCurrencyData(baseCountry, countryName) : Promise.resolve(null),
    ]);

  const countryData = {
    countryName,
    demographics: rcResult.status === "fulfilled" ? rcResult.value : null,
    covid: covidResult.status === "fulfilled" ? covidResult.value : null,
    outbreaks: outbreakResult.status === "fulfilled" ? outbreakResult.value : [],
    visa: visaResult.status === "fulfilled" ? visaResult.value : null,
    news: newsResult.status === "fulfilled" ? newsResult.value : [],
    currency: currencyResult.status === "fulfilled" ? currencyResult.value : null,
    fetchedAt: new Date().toISOString(),
  };

  chrome.storage.sync.set({ lastCountry: countryData });
  return countryData;
}

async function getRestCountriesData(countryName) {
  const now = Date.now();
  if (cache.restCountries.data && now - cache.restCountries.timestamp < CACHE_TTL_MS) {
    return findInRestCountries(cache.restCountries.data, countryName);
  }

  const COUNTRY_DATA_PRIMARY =
    "https://cdn.jsdelivr.net/gh/Him97kr/rest-countries-data/allcountries.json";
  const COUNTRY_DATA_FALLBACK =
    "https://raw.githubusercontent.com/Him97kr/rest-countries-data/main/allcountries.json";

  let raw = null;
  for (const url of [COUNTRY_DATA_PRIMARY, COUNTRY_DATA_FALLBACK]) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      raw = await response.json();
      break;
    } catch (err) {
      console.warn(`[BG] Country data fetch failed for ${url}:`, err.message);
    }
  }
  if (!raw) throw new Error("Both primary and fallback country data sources failed");

  const map = {};
  const countryData = raw?.countryData;
  countryData.forEach((c) => {
    const density = c.population && c.area?.kilometers ? c.population / c.area.kilometers : null;
    const entry = {
      country: c.names?.common,
      countryCode: c.codes?.alpha_3 ?? null,
      iso2: c.codes?.alpha_2 ?? null,
      population: c.population ?? null,
      area: c.area?.kilometers ?? null,
      density: density,
      capital: c.capitals[0]?.name ?? null,
      flag: c.flag
        ? `<img height="20" width="30" src="${c.flag?.url_svg}" alt="${c.flag?.url_png}" />`
        : "🌍",
    };
    const common = c.names?.common?.toLowerCase();
    const official = c.names?.official?.toLowerCase();
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
  const PASSPORT_PRIMARY = "https://cdn.jsdelivr.net/gh/imorte/passport-index-data/passport-index.json";
  const PASSPORT_FALLBACK = "https://raw.githubusercontent.com/imorte/passport-index-data/master/passport-index.json";

  const base = await resolveISO2(baseCountry);
  const dest = await resolveISO2(destCountry);
  if (!dest) return null;
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
    if (!passportDataCache.data || now - passportDataCache.timestamp > CACHE_TTL_MS) {
      let json = null;
      for (const url of [PASSPORT_PRIMARY, PASSPORT_FALLBACK]) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const response = await fetch(url, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          json = await response.json();
          break; // success, stop trying further URLs
        } catch (err) {
          console.warn(`[BG] Passport fetch failed for ${url}:`, err.message);
        }
      }
      if (!json) throw new Error("Both primary and fallback passport sources failed");
      passportDataCache = { data: json, timestamp: now };
    }

    const json = passportDataCache.data;
    if (!json[base]) return null;
    const entry = json[base][dest];
    if (!entry) return null;

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

// ─── ISO2 → Google News locale params ────────────────────────────────────────
// Maps ISO2 country code to { gl, hl, ceid } for the Google News RSS URL.
// Falls back to en-US/US if not listed.
function getNewsLocale(iso2) {
  const map = {
    US: { gl: "US", hl: "en-US", ceid: "US:en" },
    GB: { gl: "GB", hl: "en-GB", ceid: "GB:en" },
    IN: { gl: "IN", hl: "en-IN", ceid: "IN:en" },
    AU: { gl: "AU", hl: "en-AU", ceid: "AU:en" },
    CA: { gl: "CA", hl: "en-CA", ceid: "CA:en" },
    DE: { gl: "DE", hl: "de", ceid: "DE:de" },
    FR: { gl: "FR", hl: "fr", ceid: "FR:fr" },
    IT: { gl: "IT", hl: "it", ceid: "IT:it" },
    ES: { gl: "ES", hl: "es", ceid: "ES:es" },
    BR: { gl: "BR", hl: "pt-BR", ceid: "BR:pt-419" },
    MX: { gl: "MX", hl: "es-419", ceid: "MX:es-419" },
    JP: { gl: "JP", hl: "ja", ceid: "JP:ja" },
    CN: { gl: "CN", hl: "zh-CN", ceid: "CN:zh-Hans" },
    RU: { gl: "RU", hl: "ru", ceid: "RU:ru" },
    KR: { gl: "KR", hl: "ko", ceid: "KR:ko" },
    NG: { gl: "NG", hl: "en-NG", ceid: "NG:en" },
    ZA: { gl: "ZA", hl: "en-ZA", ceid: "ZA:en" },
    EG: { gl: "EG", hl: "ar", ceid: "EG:ar" },
    SA: { gl: "SA", hl: "ar", ceid: "SA:ar" },
    AE: { gl: "AE", hl: "ar", ceid: "AE:ar" },
    TR: { gl: "TR", hl: "tr", ceid: "TR:tr" },
    PK: { gl: "PK", hl: "en-PK", ceid: "PK:en" },
    BD: { gl: "BD", hl: "bn", ceid: "BD:bn" },
    PH: { gl: "PH", hl: "en-PH", ceid: "PH:en" },
    ID: { gl: "ID", hl: "id", ceid: "ID:id" },
    TH: { gl: "TH", hl: "th", ceid: "TH:th" },
    VN: { gl: "VN", hl: "vi", ceid: "VN:vi" },
    PL: { gl: "PL", hl: "pl", ceid: "PL:pl" },
    NL: { gl: "NL", hl: "nl", ceid: "NL:nl" },
    SE: { gl: "SE", hl: "sv", ceid: "SE:sv" },
    NO: { gl: "NO", hl: "no", ceid: "NO:no" },
    PT: { gl: "PT", hl: "pt-PT", ceid: "PT:pt-150" },
    AR: { gl: "AR", hl: "es-419", ceid: "AR:es-419" },
    SG: { gl: "SG", hl: "en-SG", ceid: "SG:en" },
    MY: { gl: "MY", hl: "en-MY", ceid: "MY:en" },
    NZ: { gl: "NZ", hl: "en-NZ", ceid: "NZ:en" },
    UA: { gl: "UA", hl: "uk", ceid: "UA:uk" },
    IL: { gl: "IL", hl: "he", ceid: "IL:he" },
    GR: { gl: "GR", hl: "el", ceid: "GR:el" },
    HU: { gl: "HU", hl: "hu", ceid: "HU:hu" },
    CZ: { gl: "CZ", hl: "cs", ceid: "CZ:cs" },
    RO: { gl: "RO", hl: "ro", ceid: "RO:ro" },
  };
  return map[iso2?.toUpperCase()] || { gl: "US", hl: "en-US", ceid: "US:en" };
}

// ─── Google News RSS — News Context ──────────────────────────────────────────
// NOTE: DOMParser / querySelectorAll are NOT available in MV3 service workers.
// We parse the RSS XML with regex instead.
async function getNewsData(countryName, baseCountry) {
  const now = Date.now();
  // Include baseCountry in cache key — different passport = different locale = different results
  const cacheKey = `${countryName.toLowerCase().trim()}_${(baseCountry || "US").toUpperCase()}`;

  if (cache.news[cacheKey] && now - cache.news[cacheKey].timestamp < CACHE_TTL_NEWS_MS) {
    return cache.news[cacheKey].data;
  }

  const { gl, hl, ceid } = getNewsLocale(baseCountry);
  try {
    const query = encodeURIComponent(`"${countryName}"`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=${hl}&gl=${gl}&ceid=${ceid}`;
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

// ─── Currency Converter (jsdelivr fawazahmed0 API) ────────────────────────────
// Resolves base ISO2 → currency code, dest country → currency code,
// then fetches 1 base unit = X dest rate.
// Data URL: https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/{base}.json
// Cache TTL: 30 min (rates are daily snapshots so this is fine)

const CURRENCY_CACHE_TTL_MS = 30 * 60 * 1000;
const currencyCache = {};  // keyed by baseCurrencyCode

// ISO2 → currency code map
const ISO2_TO_CURRENCY = {
  US: "usd", GB: "gbp", IN: "inr", AU: "aud", CA: "cad", DE: "eur", FR: "eur",
  IT: "eur", ES: "eur", NL: "eur", BE: "eur", PT: "eur", AT: "eur", FI: "eur",
  IE: "eur", GR: "eur", LU: "eur", SI: "eur", SK: "eur", EE: "eur", LV: "eur",
  LT: "eur", CY: "eur", MT: "eur", BR: "brl", MX: "mxn", JP: "jpy", CN: "cny",
  RU: "rub", KR: "krw", IN: "inr", NG: "ngn", ZA: "zar", EG: "egp", SA: "sar",
  AE: "aed", TR: "try", PK: "pkr", BD: "bdt", PH: "php", ID: "idr", TH: "thb",
  VN: "vnd", PL: "pln", SE: "sek", NO: "nok", DK: "dkk", CH: "chf", SG: "sgd",
  MY: "myr", NZ: "nzd", HK: "hkd", IL: "ils", UA: "uah", AR: "ars", CL: "clp",
  CO: "cop", PE: "pen", KE: "kes", ET: "etb", GH: "ghs", TZ: "tzs", MA: "mad",
  DZ: "dzd", TN: "tnd", KW: "kwd", QA: "qar", BH: "bhd", OM: "omr", JO: "jod",
  LB: "lbp", IQ: "iqd", IR: "irr", PY: "pyg", UY: "uyu", BO: "bob", EC: "usd",
  GT: "gtq", CR: "crc", PA: "usd", DO: "dop", CU: "cup", JM: "jmd", TT: "ttd",
  HN: "hnl", SV: "usd", NI: "nio", HU: "huf", CZ: "czk", RO: "ron", BG: "bgn",
  HR: "eur", RS: "rsd", BA: "bam", ME: "eur", MK: "mkd", AL: "all", MD: "mdl",
  BY: "byr", GE: "gel", AM: "amd", AZ: "azn", KZ: "kzt", UZ: "uzs", TM: "tmt",
  KG: "kgs", TJ: "tjs", MN: "mnt", NP: "npr", LK: "lkr", MM: "mmk", KH: "khr",
  LA: "lak", BN: "bnd", TW: "twd", AF: "afn", LY: "lyd", SD: "sdg", SO: "sos",
  ZW: "zwl", ZM: "zmw", MZ: "mzn", AO: "aoa", CD: "cdf", CG: "xaf", CM: "xaf",
  GA: "xaf", TD: "xaf", CF: "xaf", GQ: "xaf", SN: "xof", CI: "xof", ML: "xof",
  BF: "xof", NE: "xof", BJ: "xof", TG: "xof", GN: "gnf", MG: "mga", RW: "rwf",
  BI: "bif", UG: "ugx", MW: "mwk", NA: "nad", BW: "bwp", SZ: "szl", LS: "lsl",
  FJ: "fjd", PG: "pgk", SB: "sbd", VU: "vuv", WS: "wst", TO: "top",
};

async function getCurrencyData(baseISO2, destCountryName) {
  if (!baseISO2) return null;

  const baseCur = ISO2_TO_CURRENCY[baseISO2.toUpperCase()];
  if (!baseCur) return null;

  const destISO2 = await resolveISO2(destCountryName);
  if (!destISO2) return null;
  const destCur = ISO2_TO_CURRENCY[destISO2.toUpperCase()];
  if (!destCur) return null;

  if (baseCur === destCur) {
    return { same: true, baseCur, destCur };
  }

  const now = Date.now();
  if (
    currencyCache[baseCur] &&
    now - currencyCache[baseCur].timestamp < CURRENCY_CACHE_TTL_MS
  ) {
    const rate = currencyCache[baseCur].data[destCur];
    return rate != null ? { rate, baseCur, destCur } : null;
  }

  const CURRENCY_PRIMARY =
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${baseCur}.json`;
  const CURRENCY_FALLBACK =
    `https://${'latest'}.currency-api.pages.dev/v1/currencies/${baseCur}.json`;

  let json = null;
  for (const url of [CURRENCY_PRIMARY, CURRENCY_FALLBACK]) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      json = await response.json();
      break;
    } catch (err) {
      console.warn(`[BG] Currency data fetch failed for ${url}:`, err.message);
    }
  }
  if (!json) {
    console.error("[BG] getCurrencyData: both primary and fallback sources failed");
    return null;
  }

  const rates = json[baseCur];
  if (!rates) return null;

  currencyCache[baseCur] = { data: rates, timestamp: now };

  const rate = rates[destCur];
  return rate != null ? { rate, baseCur, destCur } : null;
}