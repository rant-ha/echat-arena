FROM python:3.9-slim
WORKDIR /app

# Install system build deps + Python dependencies from requirements.txt
# requirements.txt changes invalidate the COPY layer → forces pip reinstall
COPY requirements.txt .
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libxml2-dev libxslt-dev \
    && pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir -r requirements.txt \
    && pip install --no-cache-dir "gradio==4.44.1" \
    && apt-get purge -y build-essential \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

COPY . .

# Non-root user (chown must come after COPY)
RUN useradd -m -r appuser && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1
RUN chmod +x start.sh
CMD ["./start.sh"]
