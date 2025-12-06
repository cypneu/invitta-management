# Development Dockerfile for frontend with hot module replacement
FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install

# Copy source (will be overridden by volume mount in dev)
COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Dev command with HMR
CMD ["bun", "run", "dev", "--host", "0.0.0.0"]
