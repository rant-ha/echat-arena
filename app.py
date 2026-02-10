"""Thin shim -- keeps ``uvicorn app:app`` working unchanged.

All logic lives in the ``arena`` package.
"""

from arena import app  # noqa: F401

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
