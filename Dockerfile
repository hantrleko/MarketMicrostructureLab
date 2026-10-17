# Multi-stage Docker build for Market Microstructure Lab (MML)

# Stage 1: Build Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /web
COPY apps/web/package*.json ./
RUN npm ci
COPY apps/web ./
RUN npm run build

# Stage 2: Production Python Backend & Static Serving
FROM python:3.13-slim
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy python project definition & install dependencies
COPY pyproject.toml ./
RUN pip install --no-cache-dir \
    duckdb \
    fastapi \
    "uvicorn[standard]" \
    httpx \
    numpy \
    polars \
    pyarrow \
    pydantic \
    requests \
    scipy \
    statsmodels \
    websockets

# Copy application code
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY config/ ./config/
COPY scripts/ ./scripts/
COPY data/metadata/ ./data/metadata/
COPY research/ ./research/
COPY docs/ ./docs/
COPY README.md ./

# Copy built frontend from Stage 1 into web dist
COPY --from=frontend-builder /web/dist /app/apps/web/dist

# Expose API and web server ports
EXPOSE 8000

# Start FastAPI application
CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
