# E2B Sandbox Template for Kanwas Execution Environment
# Built: 2025-11-26
# This sandbox connects to the Yjs server for workspace sync

FROM ubuntu:22.04

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies including Python and file processing tools
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    git \
    python3 \
    python3-pip \
    # File processing tools
    poppler-utils \
    antiword \
    ffmpeg \
    jq \
    libxml2-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages for file processing
RUN pip3 install --no-cache-dir \
    PyYAML \
    PyPDF2 \
    pdfplumber \
    python-docx \
    openpyxl \
    "xlrd<2.0" \
    python-pptx \
    pandas \
    lxml \
    beautifulsoup4 \
    Pillow \
    markdown \
    tabulate

# Install Node.js 24 LTS
RUN curl -fsSL https://deb.nodesource.com/setup_24.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Verify installations
RUN node --version && npm --version

# Install pnpm so the sandbox image uses the repo's locked workspace graph.
RUN npm install -g pnpm@10 && pnpm --version

# Install AssemblyAI CLI for audio/video transcription
# The || true ignores the non-critical zsh profile update error
# Copy binary to /usr/local/bin so it's available to non-interactive shells and non-root users (E2B runs as 'user')
RUN curl -fsSL https://raw.githubusercontent.com/AssemblyAI/assemblyai-cli/main/install.sh | bash || true \
    && cp "$HOME/.assemblyai-cli/assemblyai" /usr/local/bin/assemblyai \
    && chmod +x /usr/local/bin/assemblyai

# Pre-compiled from openai/codex (Apache 2.0) — same patch logic as the Codex CLI
COPY bin/apply_patch /usr/local/bin/apply_patch

# Create app directory
WORKDIR /app

# Copy workspace manifests so pnpm can apply the locked dependency graph,
# overrides, and BlockNote patch used by the monorepo.
COPY package.json ./package.json
COPY pnpm-lock.yaml ./pnpm-lock.yaml
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY patches/ ./patches/

# Copy package manifests and the prebuilt shared runtime consumed by execenv.
COPY shared/package.json ./shared/package.json
COPY shared/dist/ ./shared/dist/
COPY execenv/package.json ./execenv/package.json
COPY execenv/tsconfig.json ./execenv/tsconfig.json

# Install only the workspace root plus execenv and its dependencies.
RUN HUSKY=0 pnpm install --frozen-lockfile --filter . --filter @kanwas/execenv...

# Copy execenv sources and build the runtime inside the workspace layout.
COPY execenv/src/ ./execenv/src/
COPY execenv/entrypoint.sh ./execenv/entrypoint.sh
RUN pnpm --filter @kanwas/execenv build && chmod +x /app/execenv/entrypoint.sh

# Create workspace directory with world-write permissions
# E2B runs commands as 'user' (UID 1000), so we need to allow the user to write to /workspace
RUN mkdir -p /workspace && chmod 777 /workspace

# Set environment defaults
ENV WORKSPACE_PATH=/workspace
ENV NODE_ENV=production
# For e2b, we'll use wss:// to connect to the production Yjs server
ENV YJS_SERVER_PROTOCOL=wss

# The entrypoint starts the sync runner and then executes the command
ENTRYPOINT ["/app/execenv/entrypoint.sh"]
