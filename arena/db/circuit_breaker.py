"""Circuit breaker for Supabase REST API calls."""

import time


class CircuitBreaker:
    """Simple circuit breaker with three states: CLOSED, OPEN, HALF_OPEN."""

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    def __init__(self, failure_threshold: int = 5, recovery_timeout: float = 60.0):
        self.state: str = self.CLOSED
        self.failure_count: int = 0
        self.failure_threshold: int = failure_threshold
        self.recovery_timeout: float = recovery_timeout
        self.last_failure_time: float = 0.0

    def can_execute(self) -> bool:
        """Return True if the circuit allows a request to proceed."""
        if self.state == self.CLOSED:
            return True
        if self.state == self.OPEN:
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = self.HALF_OPEN
                return True
            return False
        return True  # HALF_OPEN — allow one probe request

    def record_success(self) -> None:
        """Record a successful call and reset the breaker to CLOSED."""
        self.failure_count = 0
        self.state = self.CLOSED

    def record_failure(self) -> None:
        """Record a failed call and potentially trip the breaker to OPEN."""
        self.failure_count += 1
        self.last_failure_time = time.time()
        if self.failure_count >= self.failure_threshold:
            self.state = self.OPEN

    def to_dict(self) -> dict:
        """Serialize state for monitoring / health endpoint."""
        return {
            "state": self.state,
            "failure_count": self.failure_count,
            "failure_threshold": self.failure_threshold,
            "recovery_timeout": self.recovery_timeout,
            "last_failure_time": self.last_failure_time,
        }


# Module-level singleton
supabase_breaker = CircuitBreaker()
