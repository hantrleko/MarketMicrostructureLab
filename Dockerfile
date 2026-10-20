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

# Build arguments for commit and data version
ARG BUILD_COMMIT=unknown
ARG DATA_VERSION="V1.1.2 Institutional Rigor"
ENV BUILD_COMMIT=${BUILD_COMMIT}
ENV DATA_VERSION=${DATA_VERSION}

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy python project definition & install locked dependencies
COPY pyproject.toml requirements-lock.txt ./
RUN pip install --no-cache-dir -r requirements-lock.txt

# Copy application code
COPY packages/ ./packages/
COPY apps/ ./apps/
COPY scripts/ ./scripts/
COPY data/metadata/ ./data/metadata/
COPY data/fixtures/ ./data/fixtures/
COPY research/ ./research/
COPY docs/ ./docs/
COPY README.md ./

# Copy built frontend from Stage 1 into web dist
COPY --from=frontend-builder /web/dist /app/apps/web/dist

# Expose API and web server ports
EXPOSE 8000

# Health check using system info endpoint
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD curl -f http://localhost:8000/api/v1/health || exit 1

# Start FastAPI application
CMD ["uvicorn", "apps.api.main:app", "--host", "0.0.0.0", "--port", "8000"]
