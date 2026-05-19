# GoodEats backend — FastAPI + SQLite + curl (for the Reddit fetcher).
# Python 3.11 because the SQL fork's bytecode was compiled against 3.11
# and matches the dev/test surface most teammates have installed.
FROM python:3.11-slim

WORKDIR /app

# `curl` is required at runtime — sources/reddit.py shells out to it to
# bypass Reddit's TLS-fingerprint bot filter. `tini` cleans up zombie
# processes from the subprocess fetcher.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl tini \
    && rm -rf /var/lib/apt/lists/*

# Install Python deps first so they cache independently of source changes.
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy app code (.dockerignore excludes .venv, __pycache__, *.db, .env).
COPY . .

# DB lives on a mounted volume in compose; create the mount point.
RUN mkdir -p /app/data
ENV GOODEATS_DB_PATH=/app/data/goodeats.db

EXPOSE 8000

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

HEALTHCHECK --interval=10s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -fs http://localhost:8000/api/health || exit 1
