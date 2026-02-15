<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# docs/guides/ — Operational Guides

## Purpose
Step-by-step guides for deployment, testing, and troubleshooting the eChat Arena platform.

## Key Files
| File | Description |
|------|-------------|
| `DEPLOYMENT_GUIDE.md` | Primary deployment guide: Heroku backend + Vercel frontend + Supabase DB |
| `DEPLOYMENT_GUIDE_SESSIONSTORE.md` | SessionStore-specific deployment (Redis + Supabase fallback) |
| `DEPLOYMENT_GUIDE_UPDATED_SESSIONSTORE.md` | Updated SessionStore deployment with HybridStore |
| `TESTING.md` | Test strategy and execution instructions |
| `TROUBLESHOOTING.md` | Common issues and resolution steps |

## For AI Agents

### Working In This Directory
- Deployment guides contain environment variable references; verify against current `arena/config.py`.
- SessionStore guides evolved over time; the "UPDATED" version is current.
