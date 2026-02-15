<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# docs/analysis/ — Technical Analysis Documents

## Purpose
Deep-dive technical analyses produced during debugging sessions and architecture reviews. Covers database schema, session persistence, voting flows, and frontend data management.

## Key Files
| File | Description |
|------|-------------|
| `DATABASE_SCHEMA_ANALYSIS.md` | Comprehensive Supabase table structure and relationships |
| `DATABASE_SCHEMA_DIAGRAM.md` | Visual ER diagram of database tables |
| `DATABASE_SCHEMA_SUMMARY.md` | Condensed schema reference |
| `DB_WRITE_FAILURE_ANALYSIS.md` | Root-cause analysis of database write failures |
| `DRAFT_CONVERSATIONS_DB_ANALYSIS.md` | Draft conversation persistence architecture |
| `FRONTEND_PERSISTENCE_ANALYSIS.md` | Frontend state management and localStorage patterns |
| `PERSISTENCE_BUG_ANALYSIS.md` | Cross-cutting persistence bug investigation |
| `SESSIONSTORE_FALLBACK_ANALYSIS.md` | SessionStore fallback chain analysis (Redis → Supabase) |
| `SESSION_ARCHITECTURE_ANALYSIS.md` | Session lifecycle and store architecture |
| `VOTING_FLOW_ANALYSIS.md` | End-to-end voting flow from UI to database |

## For AI Agents

### Working In This Directory
- These are reference documents, not living specifications.
- Cross-reference with actual code; analyses may be from earlier versions.
- Useful for understanding design rationale behind current implementation.
