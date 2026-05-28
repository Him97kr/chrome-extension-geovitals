# 🌍 GeoVitals — Country Stats on Hover

> Hover over any country name on any webpage to instantly see Demographics information, COVID-19 statistics and WHO disease outbreak alerts.

[![Chrome Web Store](https://img.shields.io/chrome-web-store/v/igkoiddcpkagiijomnmcadchopdnmlje?label=Chrome%20Web%20Store&logo=googlechrome&logoColor=white&color=00e5a0)](https://chromewebstore.google.com/detail/igkoiddcpkagiijomnmcadchopdnmlje)

---

## 🎬 Demo

![GeoVitals Demo](public/demo.gif)

## 📸 Screenshots

| Popup | Country Tooltip | Options |
|---|---|---|
| ![Popup](public/popup.png) | ![Tooltip](public/tooltip.png) | ![Options](public/options.png) |

---

## ✨ Features

- **Automatic country detection** — scans every webpage and highlights country names with a subtle green underline
- **Instant tooltip on hover** — population, density, area, capital city, COVID-19 stats and WHO alerts
- **Hyperlink support** — works on country names inside anchor tags too
- **Toggle on/off** — enable or disable from the popup or press `Alt+G`
- **Last hovered country** — popup shows your last viewed country with a direct link to full analytics
- **Options page** — show/hide COVID data, WHO alerts, configure country exclusion list
- **Session timer** — tracks how long the extension has been active
- **30-minute cache** — fast repeated lookups without redundant API calls
- **Works on any website** — news articles, Wikipedia, research papers, anything

---

## 🚀 Installation

### From Chrome Web Store *(recommended)*

[Available in the Chrome Web Store](https://chromewebstore.google.com/detail/igkoiddcpkagiijomnmcadchopdnmlje)

### From Source (Developer Mode)

```bash
# Clone
git clone https://github.com/Him97kr/chrome-extension-geovitals.git
cd chrome-extension-geovitals

# Install dependencies
npm install

# Build
npm run build

# Load in Chrome
# → chrome://extensions
# → Enable Developer Mode
# → Load unpacked → select dist/ folder
```

---

## ⌨️ Keyboard Shortcut

| Shortcut | Action |
|---|---|
| `Alt + G` | Toggle GeoVitals on / off |

To customise: `chrome://extensions/shortcuts`

---

## ⚙️ Options Page

Access via the **⚙ Options** link in the popup.

| Setting | Default | Description |
|---|---|---|
| Show COVID-19 data | ✅ On | Show cases, deaths, active in tooltip |
| Show WHO outbreak alerts | ✅ On | Show WHO disease news in tooltip |
| Highlight hyperlinks | ✅ On | Detect country names inside anchor tags |
| Country exclusion list | Empty | Countries you never want highlighted |

---

## 🌐 Data Sources

All APIs are **free** and require **no API key**.

| API | Data |
|---|---|
| [REST Countries v4](https://restcountries.com) | Population, density, area, capital city, flag, ISO alpha3 code (cca3) |
| [disease.sh](https://disease.sh) | COVID-19 cases, deaths, active, critical |
| [WHO Outbreak News](https://www.who.int) | Disease outbreak alerts |

---

## 📁 Project Structure

```
chrome-extension-geovitals/
├── src/
│   ├── popup.js            # React popup entry
│   ├── popup.html          # Popup HTML template
│   ├── options.js          # React options page
│   ├── options.html        # Options HTML template
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

## 🏗️ How It Works

```
Page loads
  → Content script scans all text nodes via TreeWalker
  → Country names wrapped in highlight <span>

User hovers highlighted country
  → Loading tooltip shown immediately
  → Message sent to background service worker

Background worker
  → Fetches REST Countries + disease.sh + WHO in parallel
  → Flag image served directly from REST Countries API
  → Results cached for 30 minutes
  → Returns { demographics, covid, outbreaks }

Tooltip renders
  → Population, density, area, capital city
  → COVID-19 breakdown
  → WHO outbreak alerts
  → Link to GeoQuery Dashboard for full analytics
```

---

## 🔒 Permissions

| Permission | Reason |
|---|---|
| `storage` | Save toggle state, settings and last viewed country |
| `tabs` | Show current tab hostname in popup |
| `activeTab` | Send messages to the active page |
| `host_permissions` | Fetch data from REST Countries, disease.sh, WHO |

---

## 🧱 Tech Stack

| Technology | Usage |
|---|---|
| React 18 | Popup and options page UI |
| Vanilla JS | Content script and background service worker |
| Webpack 5 | Bundler — keeps background/content scripts separate |
| Babel | JSX and modern JS transpilation |
| Chrome Manifest V3 | Extension platform |

---

## 📦 Changelog

### v1.1.0
- ✅ Fixed hover detection on country names inside hyperlinks
- ✅ Added **capital city** and **area** to tooltip demographics
- ✅ Added **last hovered country** in popup with direct GeoQuery link
- ✅ Added **Alt+G keyboard shortcut** to toggle extension
- ✅ Added **options page** — show/hide COVID, WHO, country exclusion list
- ✅ GeoQuery Dashboard link in tooltip and popup footer
- ✅ Flag rendered from REST Countries API image URL

### v1.0.0
- ✅ Initial release — country name detection, tooltip with population, COVID, WHO data

---

## 🔗 Related Projects

| Project | Description |
|---|---|
| [GeoQuery Dashboard](https://github.com/Him97kr/geoquery-dashboard) | Full country analytics dashboard — React + Redux + D3.js |
| [GeoQuery API](https://github.com/Him97kr/geoquery) | GraphQL API in Go powering the dashboard |
| [World Population Dashboard](https://github.com/Him97kr/world-population-dashboard) | D3.js population visualisation |

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/my-feature`
3. Commit: `git commit -m "add my feature"`
4. Push: `git push origin feature/my-feature`
5. Open a Pull Request

---

## 🙏 Acknowledgements

- [REST Countries](https://restcountries.com) for country data
- [disease.sh](https://disease.sh) for COVID-19 statistics
- [World Health Organization](https://www.who.int) for outbreak news

---

## 🛡️ Privacy Policy

- Link: [Privacy Policy](https://him97kr.github.io/chrome-extension-geovitals/privacy/)

---

## 👨‍💻 Author

**Himanshu**
- GitHub: [@Him97kr](https://github.com/Him97kr)
- LinkedIn: [Himanshu Kumar](https://in.linkedin.com/in/himanshu-kumar-518b71192)

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
