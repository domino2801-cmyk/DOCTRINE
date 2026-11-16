# Project memory

## Product intent & audience

- Educational/training application for candidates with specialties (e.g. "OG" — Officier Guide/Guidage).
- Structured in modules (module 3, module 4, module OG) with courses, devoirs (assignments), and corrections (corrigés).
- Admins have full access to all content; candidates have gated access based on completion status.

## Brand personality & voice

- Application and user communication in French.

## Visual design & UX direction

- Module-based navigation with tabs (e.g. "Corrections des devoirs" tab in module OG).
- Specialty-specific UI elements: OG button visible only when candidate specialty is "OG".
- Correction access gated per-item, not globally by specialty.

## Decisions, constraints & rationale

- **Module 4 corrections access logic**: correction displays only if (1) corresponding dossier is marked "Fait" in module 3 AND (2) fiche has been transmitted via the submission screen. Admins bypass these checks.
- **OG specialty does NOT unlock module 4 corrections**: OG candidates go through the same gates as other candidates. No shortcut exists.
- **Module OG "Corrections des devoirs" tab is empty**: displays "Aucun devoir en attente pour le moment"; no code loads devoirs into it.
- **OG button visibility** depends on a DB-side function returning the candidate's specialty; exact match to string "OG" required.
- **DB state uncertainty**: `profiles` table and specialty function were not found in the currently connected database — may not be created yet or connected DB may not be production.

## Open questions & assumptions

- Should OG specialty automatically unlock all 16 module 4 corrections? (User hasn't confirmed yet — implementation pending.)
- Is the connected database the production database, or a different environment?
- Are the required DB objects (profiles table, specialty function) deployed in production?