# 🌍 GeoVitals — Country Intelligence Chrome Extension

> Hover over any country name on any webpage to instantly see its population, population density, COVID-19 statistics, and WHO disease outbreak alerts.

![Extension Demo](/public/demo.gif)

---

## ✨ Features

- **Automatic country detection** — scans every webpage and highlights country names
- **Instant tooltip on hover** — no clicks needed, data appears immediately
- **Population & density** — latest data from REST Countries API
- **COVID-19 statistics** — total cases, deaths, active cases, and critical count
- **WHO outbreak alerts** — live disease outbreak news filtered by country
- **Toggle on/off** — enable or disable the extension from the popup
- **Session timer** — tracks how long the extension has been active
- **30-minute cache** — fast repeated lookups without hammering APIs
- **Works on any website** — news, Wikipedia, articles, research papers

---

## 📸 Screenshots

| Popup | Country Tooltip |
|---|---|
| ![Popup](/public/popup.png) | ![Tooltip](/public/tooltip.png) |

---

## 🚀 Installation

### From Source (Developer Mode)

1. Clone this repository
   ```bash
   git clone https://github.com/Him97kr/chrome-extension-geovitals.git
   cd chrome-extension-geovitals
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Build the extension
   ```bash
   npm run build
   ```

4. Load in Chrome
   - Open Chrome and go to `chrome://extensions`
   - Enable **Developer Mode** (top right toggle)
   - Click **Load unpacked**
   - Select the `dist/` folder

5. The extension icon appears in your toolbar — click it to toggle on/off

---

## 🛠️ Development

```bash
# Start development with auto-rebuild on file changes
npm run dev

# Production build
npm run build
```

After any code change in dev mode, go to `chrome://extensions` and click the **refresh icon** on the extension card.

---

## 📁 Project Structure

```
chrome-extension-geovitals/
├── src/
│   ├── popup.js            # React popup entry
│   ├── popup.html          # Popup HTML template
│   ├── background.js       # Service worker — API fetching & caching
│   ├── content.js          # Content script — highlights & tooltip
│   ├── manifest.json       # Chrome extension manifest
│   ├── 16.png              # Extension icons
│   ├── 32.png
│   ├── 48.png
│   └── 128.png
├── webpack.config.js
└── package.json
```

---

## 🌐 APIs Used

All APIs are **free** and require **no API key**.

| API | Data | Endpoint |
|---|---|---|
| [REST Countries v4](https://restcountries.com) | Population, Density | `restcountries.com/v4/all` |
| [disease.sh](https://disease.sh) | COVID-19 stats | `disease.sh/v3/covid-19/countries` |
| [WHO Outbreak News](https://www.who.int) | Disease alerts | `who.int/api/news/diseaseoutbreaknews` |

---

## ⚙️ How It Works

1. **Content script** scans all text nodes on the page using a `TreeWalker`
2. Country names are matched using a regex of 200+ countries — longest names matched first to avoid partial matches (e.g. "United States" before "United")
3. Matched names are wrapped in a highlight `<span>`
4. On hover, the content script sends a message to the **background service worker**
5. The background worker fetches all 3 APIs in parallel using `Promise.allSettled`
6. Results are **cached for 30 minutes** to avoid redundant network calls
7. Data is sent back to the content script and rendered in the tooltip

```
User hovers "India"
       ↓
Content script → chrome.runtime.sendMessage({ action: "getCountryData" })
       ↓
Background worker → fetch REST Countries + disease.sh + WHO (parallel)
       ↓
Return { demographics, covid, outbreaks }
       ↓
Content script renders tooltip
```

---

## 🔒 Permissions

| Permission | Reason |
|---|---|
| `storage` | Save extension on/off state |
| `tabs` | Read current tab URL for popup display |
| `activeTab` | Send messages to the active page |
| `host_permissions` | Fetch data from REST Countries, disease.sh, WHO |

---

## 🧱 Tech Stack

- **React** — popup and options page UI
- **Vanilla JS** — content script and background worker (no framework overhead)
- **Webpack 5** — bundles React and keeps background/content scripts separate
- **Babel** — JSX and modern JS transpilation
- **Chrome Extensions Manifest V3**

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit your changes: `git commit -m "add my feature"`
4. Push to the branch: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 🙏 Acknowledgements

- [REST Countries](https://restcountries.com) for country data
- [disease.sh](https://disease.sh) for COVID-19 statistics
- [World Health Organization](https://www.who.int) for outbreak news
