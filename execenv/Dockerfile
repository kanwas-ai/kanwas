# Build context should be the project root (.)
# This allows copying the shared package

FROM ubuntu:22.04

# Version: 3.0.0
# Built: 2025-11-25
# Execution environment for AI agent with file watching and Yjs server sync
# Now with TypeScript!

# Prevent interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    ca-certificates \
    # core dev/system utils
    build-essential \
    git \
    wget \
    zip \
    unzip \
    less \
    tree \
    nano \
    vim \
    # process / system info
    procps \
    psmisc \
    # networking tools
    iproute2 \
    net-tools \
    iputils-ping \
    dnsutils \
    # misc utils
    uuid-runtime \
    moreutils \
    bash-completion \
    # Python and file processing tools
    python3 \
    python3-pip \
    poppler-utils \
    antiword \
    ffmpeg \
    jq \
    libxml2-utils \
    && rm -rf /var/lib/apt/lists/*

# Install Python packages for file processing
RUN pip3 install --no-cache-dir \
    PyPDF2 \
    pdfplumber \
    python-docx \
    openpyxl \
    "xlrd<2.0" \
    python-pptx \
    pandas \
    lxml \
    PyYAML \
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

# Install pnpm so local Docker builds use the same workspace dependency graph as E2B
RUN npm install -g pnpm@10 && pnpm --version

# Create app directory
WORKDIR /app

# Copy workspace manifests so pnpm can apply the locked workspace dependency graph
COPY package.json ./package.json
COPY pnpm-lock.yaml ./pnpm-lock.yaml
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY patches/ ./patches/

# Copy package manifests and the prebuilt shared runtime consumed by execenv
COPY shared/package.json ./shared/package.json
COPY shared/dist/ ./shared/dist/
COPY execenv/package.json ./execenv/package.json
COPY execenv/tsconfig.json ./execenv/tsconfig.json

# Install only the workspace root plus execenv and its dependencies
RUN HUSKY=0 pnpm install --frozen-lockfile --filter . --filter @kanwas/execenv...

# Copy TypeScript source files and build execenv in the canonical runtime location
COPY execenv/src/ ./execenv/src/
COPY execenv/entrypoint.sh ./execenv/entrypoint.sh
RUN pnpm --filter @kanwas/execenv build && chmod +x /app/execenv/entrypoint.sh

# Create workspace directory
RUN mkdir -p /workspace

# Set environment defaults
ENV WORKSPACE_PATH=/workspace
ENV NODE_ENV=production

# Set entrypoint
ENTRYPOINT ["/app/execenv/entrypoint.sh"]

# Default command (can be overridden)
CMD ["bash"]
