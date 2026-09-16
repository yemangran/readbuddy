# Privacy Policy for Read Buddy (伴读书童)

**Effective Date: September 16, 2026**

Read Buddy ("we", "our", or "the extension") is an open-source browser extension dedicated to helping users learn languages through bilingual web reading and spaced repetition review. We are strongly committed to respecting and protecting your privacy.

## 1. Local-First Design & Zero Tracking

- **No User Account Required**: Read Buddy operates entirely without user registration, login accounts, or central backend servers.
- **Local Data Storage**: All your vocabulary cards, review logs, memory states (FSRS algorithm), custom prompts, and extension settings are stored locally on your device using your browser's internal indexed storage.
- **No Analytics / Telemetry**: Read Buddy does not collect, record, or transmit any user browsing history, activity logs, personal identity data, or diagnostic metrics to any remote tracking server.

## 2. WebDAV Synchronization (Optional)

If you configure WebDAV data synchronization (e.g. Jianguoyun, Nextcloud, InfiniCLOUD, Synology NAS):

- Synchronization is strictly initiated between your browser and your designated WebDAV server.
- Your credentials (username and application password) and synced files (`readbuddy.json`, `readbuddy-reviews.json`) are stored securely within your local browser storage and communicated only with your configured endpoint.
- We do not operate or intermediate any sync servers.

## 3. Third-Party AI & Translation Services (BYOK)

When you use the AI translation or word explanation features:

- Requests containing selected webpage text or sentences are sent directly from your browser to the translation or LLM provider you configure (such as OpenAI, DeepSeek, Google Gemini, Ollama, etc.).
- Your API keys are stored solely in your browser's local encrypted storage and are never uploaded to any third party other than the API provider you explicitly specify.
- Please refer to the privacy policies of the respective translation providers for details on their data handling practices.

## 4. Permissions Disclosure

- **`storage`**: Persists your configurations, custom prompts, and local vocabulary cards offline.
- **`tabs` & `webNavigation`**: Detects current page language and context for bilingual translation.
- **`contextMenus`**: Allows triggering translation and word lookups from the right-click menu.
- **`scripting`**: Injects bilingual translation text overlays into webpage paragraphs on demand.
- **`offscreen`**: Synthesizes and plays pronunciation audio (TTS) and parses clipboard data.
- **`sidePanel`**: Displays reading assistance, definitions, and subtitle views in the browser side panel.
- **Host Permissions (`*://*/*`)**: Enables reading and translating content across webpages as requested by the user and communicating with user-configured API endpoints.

## 5. Contact Us & Open Source Repository

Read Buddy is open source under the GPL-3.0 License.
You can inspect the entire codebase, file issues, or ask questions at:
https://github.com/yemangran/readbuddy
