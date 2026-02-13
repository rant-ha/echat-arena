"""Persistence metrics for monitoring post-vote chat reliability."""


class PersistenceMetrics:
    """Simple counter-based metrics for persistence operations."""

    def __init__(self) -> None:
        self.insert_ok: int = 0
        self.insert_conflict: int = 0
        self.insert_retryable: int = 0
        self.insert_non_retryable: int = 0
        self.circuit_open_count: int = 0
        self.compensation_enqueued: int = 0
        self.compensation_recovered: int = 0
        self.fetch_ok: int = 0
        self.fetch_failed: int = 0

    def record(self, event: str) -> None:
        """Increment a counter by event name."""
        if hasattr(self, event):
            setattr(self, event, getattr(self, event) + 1)

    def to_dict(self) -> dict:
        """Serialize all counters for the health endpoint."""
        return {
            "insert_ok": self.insert_ok,
            "insert_conflict": self.insert_conflict,
            "insert_retryable": self.insert_retryable,
            "insert_non_retryable": self.insert_non_retryable,
            "circuit_open_count": self.circuit_open_count,
            "compensation_enqueued": self.compensation_enqueued,
            "compensation_recovered": self.compensation_recovered,
            "fetch_ok": self.fetch_ok,
            "fetch_failed": self.fetch_failed,
        }


persistence_metrics = PersistenceMetrics()
