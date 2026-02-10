"""Global mutable state management for the Arena application.

Uses an AppState singleton object instead of bare module-level variables
to avoid Python import reference-copy issues.
"""

from arena.session.base import SessionStore


class AppState:
    """Centralized mutable application state."""

    def __init__(self):
        self.session_store = SessionStore()  # Default in-memory; may be replaced at startup


_state = AppState()


def get_state() -> "AppState":
    """Access the global AppState singleton."""
    return _state
