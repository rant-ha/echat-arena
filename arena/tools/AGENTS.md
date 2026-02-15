<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-02-15 -->

# arena/tools/ — External Tool Integrations

## Purpose
Integration modules for external APIs used as tools within the arena system. Currently contains web search capability for LLM-assisted information retrieval.

## Key Files
| File | Description |
|------|-------------|
| `__init__.py` | Package marker |
| `web_search.py` | Serper.dev Google Search API integration with LLM keyword extraction; replaces earlier DuckDuckGo approach |

## For AI Agents

### Working In This Directory
- `web_search.py` requires `SERPER_API_KEY` environment variable.
- Uses LLM to extract search keywords from user queries before calling Serper API.
- Results are formatted for consumption by the chat/battle pipeline.

## Dependencies

### Internal
- `arena/config.py` — API keys and configuration

### External
- **httpx** — Async HTTP client for Serper API
- **Serper.dev** — Google Search API provider
