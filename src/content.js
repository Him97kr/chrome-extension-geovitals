// ─── content.js ───────────────────────────────────────────────────────────────
// Scans webpage text for country names, highlights them, and shows a rich
// tooltip with population stats, disease outbreak data, visa requirements,
// and latest news on hover.
// ─────────────────────────────────────────────────────────────────────────────

(() => {
  // ─── Country list ───────────────────────────────────────────────────────────
  const COUNTRIES = [
    "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia",
    "Australia", "Austria", "Azerbaijan", "Bahamas", "Bahrain", "Bangladesh", "Belarus",
    "Belgium", "Belize", "Benin", "Bhutan", "Bolivia", "Bosnia and Herzegovina",
    "Botswana", "Brazil", "Brunei", "Bulgaria", "Burkina Faso", "Burundi", "Cambodia",
    "Cameroon", "Canada", "Chad", "Chile", "China", "Colombia", "Congo", "Costa Rica",
    "Croatia", "Cuba", "Cyprus", "Czech Republic", "Denmark", "Djibouti", "Dominican Republic",
    "Ecuador", "Egypt", "El Salvador", "Estonia", "Ethiopia", "Fiji", "Finland", "France",
    "Gabon", "Gambia", "Georgia", "Germany", "Ghana", "Greece", "Guatemala", "Guinea",
    "Haiti", "Honduras", "Hungary", "Iceland", "India", "Indonesia", "Iran", "Iraq",
    "Ireland", "Israel", "Italy", "Jamaica", "Japan", "Jordan", "Kazakhstan", "Kenya",
    "Kuwait", "Kyrgyzstan", "Laos", "Latvia", "Lebanon", "Liberia", "Libya", "Lithuania",
    "Luxembourg", "Madagascar", "Malawi", "Malaysia", "Maldives", "Mali", "Malta",
    "Mauritania", "Mauritius", "Mexico", "Moldova", "Mongolia", "Montenegro", "Morocco",
    "Mozambique", "Myanmar", "Namibia", "Nepal", "Netherlands", "New Zealand", "Nicaragua",
    "Niger", "Nigeria", "North Korea", "Norway", "Oman", "Pakistan", "Panama", "Paraguay",
    "Peru", "Philippines", "Poland", "Portugal", "Qatar", "Romania", "Russia", "Rwanda",
    "Saudi Arabia", "Senegal", "Serbia", "Sierra Leone", "Singapore", "Slovakia",
    "Slovenia", "Somalia", "South Africa", "South Korea", "South Sudan", "Spain",
    "Sri Lanka", "Sudan", "Sweden", "Switzerland", "Syria", "Taiwan", "Tajikistan",
    "Tanzania", "Thailand", "Togo", "Trinidad and Tobago", "Tunisia", "Turkey",
    "Turkmenistan", "Uganda", "Ukraine", "United Arab Emirates", "United Kingdom",
    "United States", "Uruguay", "Uzbekistan", "Venezuela", "Vietnam", "Yemen",
    "Zambia", "Zimbabwe"
  ];

  // ─── State ──────────────────────────────────────────────────────────────────
  let isEnabled = true;
  let tooltip = null;
  let hideTimer = null;
  let currentHighlight = null;
  const settings = {
    showCovid: true,
    showWHO: true,
    showVisa: true,
    showNews: true,
    highlightLinks: true,
    excludedCountries: [],
    baseCountry: null, // ISO2 code
    baseCountryName: null,
  };

  // ─── Check extension state + settings on load ───────────────────────────────
  chrome.storage.sync.get(
    [
      "extensionEnabled", "showCovid", "showWHO", "showVisa", "showNews",
      "highlightLinks", "excludedCountries", "baseCountry", "baseCountryName",
    ],
    (result) => {
      if (result.extensionEnabled === false) return;
      isEnabled = true;
      settings.showCovid = result.showCovid !== false;
      settings.showWHO = result.showWHO !== false;
      settings.showVisa = result.showVisa !== false;
      settings.showNews = result.showNews !== false;
      settings.highlightLinks = result.highlightLinks !== false;
      settings.excludedCountries = result.excludedCountries || [];
      settings.baseCountry = result.baseCountry || null;
      settings.baseCountryName = result.baseCountryName || null;
      injectStyles();
      scanAndHighlight();
    }
  );

  // ─── Listen for messages from popup / options ────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggleExtension") {
      isEnabled = message.enabled;
      if (!isEnabled) { removeAllHighlights(); hideTooltip(); }
      else { injectStyles(); scanAndHighlight(); }
    }
    if (message.action === "updateSettings") {
      const s = message.settings;
      settings.showCovid = s.showCovid !== false;
      settings.showWHO = s.showWHO !== false;
      settings.showVisa = s.showVisa !== false;
      settings.showNews = s.showNews !== false;
      settings.highlightLinks = s.highlightLinks !== false;
      settings.excludedCountries = s.excludedCountries || [];
      settings.baseCountry = s.baseCountry || null;
      settings.baseCountryName = s.baseCountryName || null;
      removeAllHighlights();
      if (isEnabled) scanAndHighlight();
    }
  });

  // ─── Inject tooltip + highlight styles ──────────────────────────────────────
  function injectStyles() {
    if (document.getElementById("cei-styles")) return;

    const style = document.createElement("style");
    style.id = "cei-styles";
    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Syne:wght@700;800&display=swap');

      .cei-highlight {
        background: linear-gradient(120deg, rgba(0,229,160,0.18) 0%, rgba(0,229,160,0.08) 100%);
        border-bottom: 1.5px solid rgba(0,229,160,0.6);
        border-radius: 2px;
        cursor: pointer !important;
        transition: background 0.2s ease;
        padding: 0 1px;
        pointer-events: auto !important;
        position: relative;
        z-index: 9999;
        display: inline;
      }
      .cei-highlight:hover {
        background: linear-gradient(120deg, rgba(0,229,160,0.32) 0%, rgba(0,229,160,0.15) 100%);
      }
      a .cei-highlight,
      a:hover .cei-highlight {
        pointer-events: auto !important;
        cursor: pointer !important;
      }

      #cei-tooltip {
        position: fixed;
        z-index: 2147483647;
        width: 320px;
        background: #0c0c14;
        border: 1px solid #1a1a2e;
        border-radius: 12px;
        box-shadow: 0 24px 64px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,229,160,0.08);
        font-family: 'DM Mono', monospace;
        color: #e8e8f0;
        overflow: hidden;
        opacity: 0;
        transform: translateY(6px) scale(0.98);
        transition: opacity 0.2s ease, transform 0.2s ease;
        pointer-events: none;
      }
      #cei-tooltip.visible {
        opacity: 1;
        transform: translateY(0) scale(1);
        pointer-events: auto;
      }

      .cei-header {
        background: linear-gradient(135deg, #0f1923 0%, #0c1420 100%);
        padding: 14px 16px 12px;
        border-bottom: 1px solid #1a1a2e;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .cei-country-name {
        font-family: 'Syne', sans-serif;
        font-size: 22px;
        font-weight: 600;
        color: #fff;
        letter-spacing: 0.02em;
      }
      .cei-flag { font-size: 22px; font-weight: 600; }

      .cei-body { 
        height: 60vh;
        overflow-y: auto;
        scrollbar-width: none;
        padding: 14px 16px; 
      }

      .cei-section-title {
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #b4b4f9;
        margin-bottom: 10px;
      }

      .cei-stats-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 14px;
      }
      .cei-stat {
        background: #13131e;
        border: 1px solid #1a1a2e;
        border-radius: 8px;
        padding: 10px 8px;
        text-align: center;
      }
      .cei-stat-value {
        font-size: 11px;
        font-weight: 600;
        color: #00e5a0;
        line-height: 1.2;
        margin-bottom: 4px;
        text-transform: uppercase;
      }
      .cei-stat-label {
        font-size: 9px;
        color: #b4b4f9;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .cei-stat.negative .cei-stat-value { color: #ff4d6d; }
      .cei-stat.neutral  .cei-stat-value { color: #f5c842; }

      .cei-divider {
        height: 1px;
        background: #1a1a2e;
        margin: 0 0 14px;
      }

      /* COVID row */
      .cei-covid-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 14px;
      }
      .cei-covid-card {
        background: #13131e;
        border: 1px solid #1a1a2e;
        border-radius: 8px;
        padding: 8px 10px;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .cei-covid-icon   { font-size: 16px; flex-shrink: 0; }
      .cei-covid-value  { font-size: 11px; font-weight: 500; color: #e8e8f0; line-height: 1.2; }
      .cei-covid-label  { font-size: 9px; color: #b4b4f9; text-transform: uppercase; letter-spacing: 0.06em; }

      /* Outbreak alerts */
      .cei-outbreak-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 120px;
        overflow-y: auto;
      }
      .cei-outbreak-list::-webkit-scrollbar { width: 3px; }
      .cei-outbreak-list::-webkit-scrollbar-track { background: transparent; }
      .cei-outbreak-list::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 2px; }

      .cei-outbreak-item {
        background: #13131e;
        border: 1px solid #2a1a1e;
        border-left: 3px solid #ff4d6d;
        border-radius: 0 6px 6px 0;
        padding: 7px 10px;
        cursor: pointer;
        text-decoration: none;
        display: block;
        transition: border-color 0.2s;
      }
      .cei-outbreak-item:hover { border-left-color: #ff7a8a; }
      .cei-outbreak-title { font-size: 11px; color: #e8e8f0; line-height: 1.4; margin-bottom: 2px; }
      .cei-outbreak-date  { font-size: 9px; color: #b4b4f9; }

      .cei-no-outbreaks {
        font-size: 10px;
        color: #b4b4f9;
        text-align: center;
        padding: 8px 0;
      }

      /* ── Visa badge ─────────────────────────────────────── */
      .cei-visa-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 14px;
      }
      .cei-visa-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 600;
        letter-spacing: 0.04em;
      }
      .cei-visa-badge.free      { background: rgba(0,229,160,0.12); color: #00e5a0; border: 1px solid rgba(0,229,160,0.3); }
      .cei-visa-badge.arrival   { background: rgba(245,200,66,0.12); color: #f5c842; border: 1px solid rgba(245,200,66,0.3); }
      .cei-visa-badge.evisa     { background: rgba(120,180,255,0.12); color: #78b4ff; border: 1px solid rgba(120,180,255,0.3); }
      .cei-visa-badge.eta       { background: rgba(120, 120, 255, 0.13); color: #7886ff; border: 1px solid rgba(120, 149, 255, 0.3); }
      .cei-visa-badge.required  { background: rgba(255,77,109,0.12); color: #ff4d6d; border: 1px solid rgba(255,77,109,0.3); }
      .cei-visa-badge.home      { background: rgba(180,180,249,0.10); color: #b4b4f9; border: 1px solid rgba(180,180,249,0.2); }
      .cei-visa-badge.unknown   { background: rgba(180,180,249,0.10); color: #b4b4f9; border: 1px solid rgba(180,180,249,0.2); }
      .cei-visa-passport {
        font-size: 9px;
        color: #b4b4f9;
        text-align: right;
        line-height: 1.4;
      }
      .cei-visa-change {
        font-size: 9px;
        color: #00e5a0;
        cursor: pointer;
        text-decoration: underline;
        margin-top: 2px;
        display: block;
      }
      .cei-visa-change:hover { color: #00ffb3; }

      /* ── News items ─────────────────────────────────────── */
      .cei-news-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 150px;
        overflow-y: auto;
        margin-bottom: 14px;
      }
      .cei-news-list::-webkit-scrollbar { width: 3px; }
      .cei-news-list::-webkit-scrollbar-track { background: transparent; }
      .cei-news-list::-webkit-scrollbar-thumb { background: #2a2a3e; border-radius: 2px; }

      .cei-news-item {
        background: #13131e;
        border: 1px solid #1a1a2e;
        border-left: 3px solid #78b4ff;
        border-radius: 0 6px 6px 0;
        padding: 7px 10px;
        cursor: pointer;
        text-decoration: none;
        display: block;
        transition: border-color 0.2s;
      }
      .cei-news-item:hover { border-left-color: #aad4ff; }
      .cei-news-title  { font-size: 11px; color: #e8e8f0; line-height: 1.4; margin-bottom: 2px; }
      .cei-news-meta   { font-size: 9px; color: #b4b4f9; display: flex; justify-content: space-between; }
      .cei-no-news     { font-size: 10px; color: #b4b4f9; text-align: center; padding: 8px 0; }

      /* Loading */
      .cei-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 20px;
        font-size: 11px;
        color: #b4b4f9;
      }
      .cei-spinner {
        width: 14px; height: 14px;
        border: 2px solid #1a1a2e;
        border-top-color: #00e5a0;
        border-radius: 50%;
        animation: cei-spin 0.7s linear infinite;
      }
      @keyframes cei-spin { to { transform: rotate(360deg); } }

      .cei-footer {
        padding: 8px 16px 10px;
        border-top: 1px solid #1a1a2e;
        font-size: 9px;
        color: #2a2a3e;
        text-align: right;
        letter-spacing: 0.06em;
      }
      .cei-error {
        font-size: 10px;
        color: #ff4d6d;
        text-align: center;
        padding: 16px;
      }
    `;
    document.head.appendChild(style);
  }

  // ─── Scan DOM and wrap country names ────────────────────────────────────────
  function scanAndHighlight() {
    const activeCountries = COUNTRIES.filter(
      (c) => !settings.excludedCountries
        .map((e) => e.toLowerCase())
        .includes(c.toLowerCase())
    );

    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          const tag = parent.tagName?.toUpperCase();
          if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT"].includes(tag))
            return NodeFilter.FILTER_REJECT;
          if (parent.classList?.contains("cei-highlight"))
            return NodeFilter.FILTER_REJECT;
          if (tag === "A" && !settings.highlightLinks)
            return NodeFilter.FILTER_REJECT;
          if (tag === "A" && (!node.textContent || node.textContent.trim().length < 2))
            return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    const sorted = [...activeCountries].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`\\b(${sorted.map(escapeRegex).join("|")})\\b`, "g");

    textNodes.forEach((textNode) => {
      const text = textNode.textContent;
      if (!pattern.test(text)) return;
      pattern.lastIndex = 0;

      const fragment = document.createDocumentFragment();
      let lastIndex = 0;
      let match;

      while ((match = pattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        const span = document.createElement("span");
        span.className = "cei-highlight";
        span.dataset.country = match[1];
        span.textContent = match[1];
        span.style.pointerEvents = "auto";
        span.style.position = "relative";
        span.style.zIndex = "1";
        span.addEventListener("mouseenter", onHighlightEnter);
        span.addEventListener("mouseleave", onHighlightLeave);
        span.addEventListener("click", (e) => e.stopPropagation());
        fragment.appendChild(span);
        lastIndex = match.index + match[1].length;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }
      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // ─── Hover handlers ──────────────────────────────────────────────────────────
  function onHighlightEnter(e) {
    clearTimeout(hideTimer);
    currentHighlight = e.currentTarget;
    showTooltip(e.currentTarget, e.currentTarget.dataset.country);
  }
  function onHighlightLeave() {
    hideTimer = setTimeout(() => {
      if (!isTooltipHovered()) hideTooltip();
    }, 300);
  }
  function isTooltipHovered() {
    return tooltip?.matches(":hover");
  }

  // ─── Tooltip lifecycle ───────────────────────────────────────────────────────
  function showTooltip(anchor, countryName) {
    if (!tooltip) createTooltip();

    tooltip.innerHTML = `
      <div class="cei-header">
        <span class="cei-country-name">${countryName}</span>
      </div>
      <div class="cei-loading">
        <div class="cei-spinner"></div>
        Fetching data…
      </div>
    `;

    positionTooltip(anchor);
    tooltip.classList.add("visible");

    chrome.runtime.sendMessage(
      { action: "getCountryData", countryName, baseCountry: settings.baseCountry },
      (response) => {
        if (!tooltip?.classList.contains("visible")) return;
        if (!response?.success || !response.data) { renderError(countryName); return; }
        renderTooltip(response.data);
        positionTooltip(anchor);
      }
    );
  }

  function createTooltip() {
    tooltip = document.createElement("div");
    tooltip.id = "cei-tooltip";
    tooltip.addEventListener("mouseenter", () => clearTimeout(hideTimer));
    tooltip.addEventListener("mouseleave", () => {
      hideTimer = setTimeout(hideTooltip, 200);
    });
    document.body.appendChild(tooltip);
  }

  function hideTooltip() {
    if (!tooltip) return;
    tooltip.classList.remove("visible");
  }

  function positionTooltip(anchor) {
    if (!tooltip) return;
    const rect = anchor.getBoundingClientRect();
    const tw = 320;
    const margin = 10;
    let left = rect.left;
    let top = rect.bottom + 8;

    if (left + tw + margin > window.innerWidth)
      left = window.innerWidth - tw - margin;
    if (top + 300 > window.innerHeight)
      top = rect.top - 8 - Math.min(tooltip.offsetHeight || 300, 500);

    tooltip.style.left = `${Math.max(margin, left)}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  // ─── Render tooltip content ──────────────────────────────────────────────────
  function renderTooltip({ countryName, demographics, covid, outbreaks, visa, news }) {
    if (!tooltip) return;

    const demo = demographics;
    const flag = demographics?.flag;
    const fmt = (n) => n != null ? Number(n).toLocaleString() : "N/A";

    // ── Visa section ────────────────────────────────────────────────────────
    const visaHTML = (() => {
      if (!settings.showVisa) return "";

      const baseLabel = settings.baseCountryName || settings.baseCountry || "your passport";

      if (!visa) {
        return `
          <div class="cei-divider"></div>
          <div class="cei-section-title">Visa Requirement</div>
          <div class="cei-visa-row">
            <span class="cei-visa-badge unknown">⚠ Data unavailable</span>
            <div class="cei-visa-passport">
              Passport: <strong>${baseLabel}</strong>
              <a class="cei-visa-change" data-action="change-passport">Change passport →</a>
            </div>
          </div>`;
      }

      if (visa.access === "home") {
        return `
          <div class="cei-divider"></div>
          <div class="cei-section-title">Visa Requirement</div>
          <div class="cei-visa-row">
            <span class="cei-visa-badge home">🏠 Home country</span>
          </div>`;
      }

      const accessNorm = (visa.access || "").toLowerCase().trim();
      let badgeClass = "unknown";
      let icon = "❓";
      let label = visa.access || "Unknown";

      if (accessNorm.includes("visa free")) {
        badgeClass = "free"; icon = "✅"; label = "Visa Free";
        if (visa.dur && visa.dur !== "-1") label += ` · ${visa.dur} days`;
      } else if (accessNorm.includes("visa on arrival")) {
        badgeClass = "arrival"; icon = "🛬"; label = "Visa on Arrival";
      } else if (accessNorm.includes("e-visa")) {
        badgeClass = "evisa"; icon = "💻"; label = "eVisa";
      } else if (accessNorm.includes("eta")) {
        badgeClass = "eta"; icon = "💻"; label = "ETA";
      } else if (accessNorm.includes("visa required")) {
        badgeClass = "required"; icon = "🚫"; label = "Visa Required";
      }

      return `
        <div class="cei-divider"></div>
        <div class="cei-section-title">Visa Requirement</div>
        <div class="cei-visa-row">
          <span class="cei-visa-badge ${badgeClass}">${icon} ${label}</span>
          <div class="cei-visa-passport">
            Passport: <strong>${baseLabel}</strong>
            <a class="cei-visa-change" data-action="change-passport">Change passport →</a>
          </div>
        </div>`;
    })();

    // ── News section ─────────────────────────────────────────────────────────
    const newsHTML = (() => {
      if (!settings.showNews) return "";

      const newsItems = news?.length
        ? news.map((n) => `
            <a class="cei-news-item" href="${n.link || '#'}" target="_blank" rel="noopener">
              <div class="cei-news-title">${sanitize(n.title)}</div>
              <div class="cei-news-meta">
                <span>${sanitize(n.source)}</span>
                <span>${formatDate(n.pubDate)}</span>
              </div>
            </a>`).join("")
        : `<div class="cei-no-news">No recent news found</div>`;

      return `
        <div class="cei-divider"></div>
        <div class="cei-section-title">📰 News Context</div>
        <div class="cei-news-list">${newsItems}</div>`;
    })();

    // ── Outbreaks ────────────────────────────────────────────────────────────
    const whoOutbreaksUrl = "https://www.who.int/emergencies/disease-outbreak-news/item/";
    const outbreakHTML = outbreaks?.length
      ? outbreaks.map((o) => `
          <a class="cei-outbreak-item" href="${whoOutbreaksUrl + (o.url || "#")}" target="_blank" rel="noopener">
            <div class="cei-outbreak-title">${sanitize(o.title)}</div>
            <div class="cei-outbreak-date">${formatDate(o.date)}</div>
          </a>`).join("")
      : `<div class="cei-no-outbreaks">✓ No active WHO outbreak alerts</div>`;

    tooltip.innerHTML = `
      <div class="cei-header">
        <span class="cei-country-name">${countryName}</span>
        <span class="cei-flag">${flag}</span>
      </div>

      <div class="cei-body">

        <!-- Demographics -->
        <div class="cei-section-title">Demographics · REST Countries</div>
        <div class="cei-stats-grid">
          <div class="cei-stat">
            <div class="cei-stat-value">${demo ? fmt(demo.population) : "N/A"}</div>
            <div class="cei-stat-label">Population</div>
          </div>
          <div class="cei-stat">
            <div class="cei-stat-value">${demo ? fmt(demo.area) : "N/A"}</div>
            <div class="cei-stat-label">Area (km²)</div>
          </div>
          <div class="cei-stat">
            <div class="cei-stat-value">${demo?.density != null ? parseFloat(demo.density).toFixed(1) : "N/A"}</div>
            <div class="cei-stat-label">Density (per km²)</div>
          </div>
          <div class="cei-stat">
            <div class="cei-stat-value">${demo ? demo.capital : "N/A"}</div>
            <div class="cei-stat-label">Capital</div>
          </div>
        </div>

        <!-- Visa -->
        ${visaHTML}

        <!-- COVID-19 -->
        ${covid && settings.showCovid ? `
        <div class="cei-divider"></div>
        <div class="cei-section-title">COVID-19 · disease.sh</div>
        <div class="cei-covid-grid">
          <div class="cei-covid-card">
            <span class="cei-covid-icon">🦠</span>
            <div class="cei-covid-info">
              <div class="cei-covid-value">${fmt(covid.cases)}</div>
              <div class="cei-covid-label">Total Cases</div>
            </div>
          </div>
          <div class="cei-covid-card">
            <span class="cei-covid-icon">💀</span>
            <div class="cei-covid-info">
              <div class="cei-covid-value">${fmt(covid.deaths)}</div>
              <div class="cei-covid-label">Deaths</div>
            </div>
          </div>
          <div class="cei-covid-card">
            <span class="cei-covid-icon">⚡</span>
            <div class="cei-covid-info">
              <div class="cei-covid-value">${fmt(covid.active)}</div>
              <div class="cei-covid-label">Active</div>
            </div>
          </div>
          <div class="cei-covid-card">
            <span class="cei-covid-icon">🏥</span>
            <div class="cei-covid-info">
              <div class="cei-covid-value">${fmt(covid.critical)}</div>
              <div class="cei-covid-label">Critical</div>
            </div>
          </div>
        </div>` : ""}

        <!-- WHO Outbreaks -->
        ${outbreaks && settings.showWHO ? `
        <div class="cei-divider"></div>
        <div class="cei-section-title">WHO Outbreak Alerts</div>
        <div class="cei-outbreak-list">${outbreakHTML}</div>` : ""}

        <!-- News -->
        ${newsHTML}

      </div>

      <div class="cei-footer" style="display:flex;justify-content:space-between;align-items:center;">
        <a href="https://him97kr.github.io/geoquery-dashboard/?redirect=/country/${demo?.countryCode || ''}"
           target="_blank"
           style="color:#00e5a0;text-decoration:none;font-size:9px;opacity:0.8;"
           onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
          🌍 Full Analytics →
        </a>
        <a href="https://github.com/Him97kr" target="_blank"
          style="color:#b4b4f9;text-decoration:none;font-size:9px;opacity:0.8;"
          onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.8">
          by Himanshu
        </a>
      </div>
    `;

    // Wire up "Change passport" link inside tooltip
    tooltip.querySelector("[data-action='change-passport']")?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({ action: "openOptionsPage" });
    });
  }

  function renderError(countryName) {
    if (!tooltip) return;
    tooltip.innerHTML = `
      <div class="cei-header">
        <span class="cei-country-name">${countryName}</span>
      </div>
      <div class="cei-error">Failed to load data. Check your connection.</div>
    `;
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  function removeAllHighlights() {
    document.querySelectorAll(".cei-highlight").forEach((el) => {
      el.replaceWith(document.createTextNode(el.textContent));
    });
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch { return dateStr; }
  }

  function sanitize(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
})();