# Project memory

## Product intent & audience

- Opportunity-finding platform surfacing business/research/career opportunities for professionals who need to track, analyze, and act on them.
- PWA variant emphasizes offline access, mobile-first use, and local data persistence so users can work without connectivity.
- New Sources page lets users manage RSS feeds and web URLs as opportunity inputs.

## Brand personality & voice

- Professional, data-driven, utility-oriented; conveys competence and trust for production use.
- Clear, efficient labels over marketing language; dashboard/analytics tone.

## Visual design & UX direction

- Dashboard-centric layout with multiple feature areas: auth, main dashboard, document management, gap analysis, candidate profiles, intelligence dashboards, sources management.
- Tailwind CSS for styling; Lucide React icons throughout (including logos).
- `@/` path alias used for all project module imports.
- Production-quality, non-generic UI expected; avoid template-looking layouts.
- Mobile-optimized and responsive given PWA target; offline-friendly interaction patterns.

## Decisions, constraints & rationale

- Stack: Vite + React + JSX, Tailwind CSS, Lucide React; Supabase as backend.
- PWA capabilities: offline support, local data storage, installable/mobile-optimized.
- No additional UI theme or icon packages beyond Lucide React unless explicitly requested.
- Build verified clean with no errors as of current snapshot.

## Open questions & assumptions

- Opportunity domain specifics (grants, jobs, contracts, RFPs) not yet confirmed.
- RSS/web URL ingestion pipeline and refresh cadence undefined.
- Offline sync/conflict resolution strategy when reconnecting to Supabase unspecified.
- Auth model and role/permission boundaries not yet detailed.