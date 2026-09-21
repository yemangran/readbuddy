# Local-First Spaced Repetition (FSRS) Review Engine and Separate WebDAV Review Store

## Context

Upstream Read Frog provided flashcard reviews as a paid cloud feature tied to the remote Notebase workspace and user accounts. In our standalone local-first architecture (Read Toad), learning content is persisted in a local offline repository and synchronized via WebDAV.
Users need a private, offline study flow (flashcards based on the Ebbinghaus forgetting curve / modern FSRS spaced repetition) to review vocabulary saved in their local dictionary without relying on remote servers.

## Decision

1. **Algorithm**: Implement the Free Spaced Repetition Scheduler (FSRS) locally. The scheduler computes memory stability, difficulty, review intervals, and due dates dynamically based on four standard learner ratings: Again, Hard, Good, and Easy.
2. **Storage Separation**: Maintain review states in an independent Local Review Store (`readbuddy-reviews.json`), decoupled from vocabulary record contents (`readbuddy.json`).
3. **WebDAV Dual Sync**: The WebDAV synchronizer manages two files side-by-side: `readbuddy.json` (vocabulary cards) and `readbuddy-reviews.json` (review states). Review state conflicts are resolved via Last-Review-Wins (LWW) timestamp merging. _Amended by [ADR 0003](./0003-unified-webdav-sync-pipeline.md): the synchronizer is no longer dual-file — `readbuddy-config.json` (extension preferences) joins the same coordinated pass._
4. **Lifecycle Coupling**: Soft-deleted dictionary records are immediately excluded from review queues. When vocabulary records are permanently purged from the recycle bin, their corresponding review states in the Review Store are purged in tandem.
5. **UI Surfaces**:
   - **Popup Dual Tabs**: The browser action popup is partitioned into two persistent tabs: "Translation Config" and "Local Learning" (with a badge indicating due card count).
   - **Flip Interaction**: The prompt side displays term, audio pronunciation, part of speech, and four rating buttons. Rating flips the card to reveal complete definitions and contextual sentences, with the ability to adjust the rating before proceeding to the next card.
   - **Full View Access**: Provide direct navigation from the popup learning tab to a dedicated immersive study view in the options page.
