# Development Dockerfile for Python 3.14 backend with live reload
FROM python:3.14-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

# Set uv to use system Python (faster, no download required)
ENV UV_PYTHON_PREFERENCE=system

# Copy project files
COPY pyproject.toml uv.lock ./

# Install dependencies
RUN uv sync --frozen

# Copy Alembic files
COPY alembic.ini ./
COPY alembic ./alembic

# Copy source code
COPY src ./src

# Expose port
EXPOSE 8000

# Run migrations then start server with live reload
CMD uv run alembic upgrade head && uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload --reload-dir /app/src
