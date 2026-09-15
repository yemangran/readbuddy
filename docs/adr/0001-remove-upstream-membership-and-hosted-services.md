# Complete Removal of Upstream Account, Membership and Hosted Services

## Context

Upstream Read Frog relies on centralized backend services for user authentication (better-auth), membership subscription checks (billing plans: Free/Pro/Ultra), official hosted AI proxying, video audio transcription (`videoTranscript`), and cloud notebase synchronization.
In this standalone open-source fork (Read Toad), these upstream backend dependencies cause frequent network errors, unexpected toasts, auth failure barriers, and broken user experience.

## Decision

1. Fully decouple from upstream accounts: remove the user account menu, login triggers, and background auth sessions.
2. Completely remove upstream hosted/built-in AI providers and plan badges: users provide their own API keys (BYOK) or local models (Ollama).
3. Completely replace upstream cloud Notebase with the offline Local-First Dictionary + WebDAV sync engine.
4. Remove server-dependent AI video transcription (`videoTranscript`), preserving native subtitle translation powered by local/BYOK providers.
