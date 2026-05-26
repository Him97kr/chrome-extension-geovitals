// ─── content.js ───────────────────────────────────────────────────────────────
// Scans webpage text for country names, highlights them, and shows a rich
// tooltip with population stats and disease outbreak data on hover.
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
    highlightLinks: true,
    excludedCountries: [],
  };

  // ─── Check extension state + settings on load ───────────────────────────────
  chrome.storage.sync.get(
    ["extensionEnabled", "showCovid", "showWHO", "highlightLinks", "excludedCountries"],
    (result) => {
      if (result.extensionEnabled === false) return;
      isEnabled = true;
      settings.showCovid = result.showCovid !== false;
      settings.showWHO = result.showWHO !== false;
      settings.highlightLinks = result.highlightLinks !== false;
      settings.excludedCountries = result.excludedCountries || [];
      injectStyles();
      scanAndHighlight();
    }
  );

  // ─── Listen for messages from popup / options ────────────────────────────────
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "toggleExtension") {
      isEnabled = message.enabled;
      if (!isEnabled) {
        removeAllHighlights();
        hideTooltip();
      } else {
        injectStyles();
        scanAndHighlight();
      }
    }
    if (message.action === "updateSettings") {
      const s = message.settings;
      settings.showCovid = s.showCovid !== false;
      settings.showWHO = s.showWHO !== false;
      settings.highlightLinks = s.highlightLinks !== false;
      settings.excludedCountries = s.excludedCountries || [];
      // Re-scan with new exclusion list
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
      /* Ensure highlights inside anchors always receive mouse events */
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
      .cei-flag {
        font-size: 22px;
        font-weight: 600;
      }

      .cei-body {
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
      .cei-stat.neutral .cei-stat-value  { color: #f5c842; }

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
      .cei-covid-icon {
        font-size: 16px;
        flex-shrink: 0;
      }
      .cei-covid-info {}
      .cei-covid-value {
        font-size: 11px;
        font-weight: 500;
        color: #e8e8f0;
        line-height: 1.2;
      }
      .cei-covid-label {
        font-size: 9px;
        color: #b4b4f9;
        text-transform: uppercase;
        letter-spacing: 0.06em;
      }

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
      .cei-outbreak-title {
        font-size: 11px;
        color: #e8e8f0;
        line-height: 1.4;
        margin-bottom: 2px;
      }
      .cei-outbreak-date {
        font-size: 9px;
        color: #b4b4f9;
      }

      .cei-no-outbreaks {
        font-size: 10px;
        color: #b4b4f9;
        text-align: center;
        padding: 8px 0;
      }

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
        width: 14px;
        height: 14px;
        border: 2px solid #1a1a2e;
        border-top-color: #00e5a0;
        border-radius: 50%;
        animation: cei-spin 0.7s linear infinite;
      }
      @keyframes cei-spin {
        to { transform: rotate(360deg); }
      }

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
    // Filter out excluded countries from pattern
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
          // Skip script, style, inputs, already-highlighted
          if (["SCRIPT", "STYLE", "TEXTAREA", "INPUT", "NOSCRIPT"].includes(tag)) {
            return NodeFilter.FILTER_REJECT;
          }
          if (parent.classList?.contains("cei-highlight")) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip anchor tags if highlightLinks is disabled
          if (tag === "A" && !settings.highlightLinks) {
            return NodeFilter.FILTER_REJECT;
          }
          // Skip empty anchor text
          if (tag === "A" && (!node.textContent || node.textContent.trim().length < 2)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        },
      }
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    // Build a regex from active countries — longest first to avoid partial matches
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
        // Text before match
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        // Highlighted span
        const span = document.createElement("span");
        span.className = "cei-highlight";
        span.dataset.country = match[1];
        span.textContent = match[1];
        span.addEventListener("mouseenter", onHighlightEnter);
        span.addEventListener("mouseleave", onHighlightLeave);
        // If inside a hyperlink — prevent tooltip click from navigating
        // but still allow the link itself to work normally
        span.addEventListener("click", (e) => e.stopPropagation());
        // Ensure pointer events work even if parent anchor disables them
        span.style.pointerEvents = "auto";
        span.style.position = "relative";
        span.style.zIndex = "1";
        fragment.appendChild(span);
        lastIndex = match.index + match[1].length;
      }

      // Remaining text
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
    const countryName = e.currentTarget.dataset.country;
    currentHighlight = e.currentTarget;
    showTooltip(e.currentTarget, countryName);
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

    // Show loading state
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

    // Fetch data from background
    chrome.runtime.sendMessage(
      { action: "getCountryData", countryName },
      (response) => {
        if (!tooltip?.classList.contains("visible")) return;
        if (!response?.success || !response.data) {
          renderError(countryName);
          return;
        }
        renderTooltip(response.data);
        positionTooltip(anchor); // re-position after content change
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

    // Prevent overflow right
    if (left + tw + margin > window.innerWidth) {
      left = window.innerWidth - tw - margin;
    }
    // Prevent overflow bottom — flip above
    if (top + 300 > window.innerHeight) {
      top = rect.top - 8 - Math.min(tooltip.offsetHeight || 300, 400);
    }

    tooltip.style.left = `${Math.max(margin, left)}px`;
    tooltip.style.top = `${Math.max(margin, top)}px`;
  }

  // ─── Render tooltip content ──────────────────────────────────────────────────
  function renderTooltip({ countryName, demographics, covid, outbreaks }) {
    if (!tooltip) return;

    const demo = demographics;
    const flag = demographics?.flag || "🌍";

    // Format helpers
    const fmt = (n) => n != null ? Number(n).toLocaleString() : "N/A";
    // const fmtM = (n) => n != null ? `${(n / 1e6).toFixed(1)}M` : "N/A";

    // Outbreaks HTML
    const whoOutbreaksUrl = 'https://www.who.int/emergencies/disease-outbreak-news/item/'
    const outbreakHTML = outbreaks?.length
      ? outbreaks.map((o) => `
          <a class="cei-outbreak-item" href="${whoOutbreaksUrl + o.url || "#"}" target="_blank" rel="noopener">
            <div class="cei-outbreak-title">${o.title}</div>
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
            <div class="cei-stat-value">${demo ? fmt(demo?.area) : "N/A"}</div>
            <div class="cei-stat-label">Area (km²)</div>
          </div>
          <div class="cei-stat">
            <div class="cei-stat-value">${demo?.density != null ? parseFloat(demo.density).toFixed(1) : "N/A"}</div>
            <div class="cei-stat-label">Density (per km²)</div>
          </div>
          <div class="cei-stat">
            <div class="cei-stat-value">${demo ? demo?.capital : "N/A"}</div>
            <div class="cei-stat-label">Capital</div>
          </div>
        </div>

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

      </div>

      <div class="cei-footer" style="display:flex;justify-content:space-between;align-items:center;">
        <a href="https://him97kr.github.io/geoquery-dashboard" target="_blank"
           style="color:#00e5a0;text-decoration:none;font-size:9px;opacity:0.9;"
           onmouseover="this.style.opacity=1" onmouseout="this.style.opacity=0.9">
          🌍 GeoQuery Dashboard →
        </a>
      </div>
    `;
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

  // ─── Remove all highlights ───────────────────────────────────────────────────
  function removeAllHighlights() {
    document.querySelectorAll(".cei-highlight").forEach((el) => {
      el.replaceWith(document.createTextNode(el.textContent));
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  // function getFlagEmoji(countryName) {
  //   const flags = {
  //     "Afghanistan": "🇦🇫", "Albania": "🇦🇱", "Algeria": "🇩🇿", "Argentina": "🇦🇷",
  //     "Armenia": "🇦🇲", "Australia": "🇦🇺", "Austria": "🇦🇹", "Azerbaijan": "🇦🇿",
  //     "Bangladesh": "🇧🇩", "Belgium": "🇧🇪", "Bolivia": "🇧🇴", "Brazil": "🇧🇷",
  //     "Bulgaria": "🇧🇬", "Cambodia": "🇰🇭", "Canada": "🇨🇦", "Chile": "🇨🇱",
  //     "China": "🇨🇳", "Colombia": "🇨🇴", "Croatia": "🇭🇷", "Cuba": "🇨🇺",
  //     "Czech Republic": "🇨🇿", "Denmark": "🇩🇰", "Ecuador": "🇪🇨", "Egypt": "🇪🇬",
  //     "Ethiopia": "🇪🇹", "Finland": "🇫🇮", "France": "🇫🇷", "Germany": "🇩🇪",
  //     "Ghana": "🇬🇭", "Greece": "🇬🇷", "Guatemala": "🇬🇹", "Hungary": "🇭🇺",
  //     "India": "🇮🇳", "Indonesia": "🇮🇩", "Iran": "🇮🇷", "Iraq": "🇮🇶",
  //     "Ireland": "🇮🇪", "Israel": "🇮🇱", "Italy": "🇮🇹", "Japan": "🇯🇵",
  //     "Jordan": "🇯🇴", "Kazakhstan": "🇰🇿", "Kenya": "🇰🇪", "Kuwait": "🇰🇼",
  //     "Lebanon": "🇱🇧", "Libya": "🇱🇾", "Malaysia": "🇲🇾", "Mexico": "🇲🇽",
  //     "Morocco": "🇲🇦", "Myanmar": "🇲🇲", "Nepal": "🇳🇵", "Netherlands": "🇳🇱",
  //     "New Zealand": "🇳🇿", "Nigeria": "🇳🇬", "North Korea": "🇰🇵", "Norway": "🇳🇴",
  //     "Oman": "🇴🇲", "Pakistan": "🇵🇰", "Peru": "🇵🇪", "Philippines": "🇵🇭",
  //     "Poland": "🇵🇱", "Portugal": "🇵🇹", "Qatar": "🇶🇦", "Romania": "🇷🇴",
  //     "Russia": "🇷🇺", "Saudi Arabia": "🇸🇦", "Serbia": "🇷🇸", "Singapore": "🇸🇬",
  //     "Somalia": "🇸🇴", "South Africa": "🇿🇦", "South Korea": "🇰🇷", "Spain": "🇪🇸",
  //     "Sri Lanka": "🇱🇰", "Sudan": "🇸🇩", "Sweden": "🇸🇪", "Switzerland": "🇨🇭",
  //     "Syria": "🇸🇾", "Taiwan": "🇹🇼", "Tanzania": "🇹🇿", "Thailand": "🇹🇭",
  //     "Tunisia": "🇹🇳", "Turkey": "🇹🇷", "Uganda": "🇺🇬", "Ukraine": "🇺🇦",
  //     "United Arab Emirates": "🇦🇪", "United Kingdom": "🇬🇧", "United States": "🇺🇸",
  //     "Venezuela": "🇻🇪", "Vietnam": "🇻🇳", "Yemen": "🇾🇪", "Zambia": "🇿🇲",
  //     "Zimbabwe": "🇿🇼"
  //   };
  //   return flags[countryName] || "🌍";
  // }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("en-US", {
        year: "numeric", month: "short", day: "numeric",
      });
    } catch {
      return dateStr;
    }
  }
})();
