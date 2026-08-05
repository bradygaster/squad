# syntax=docker/dockerfile:1.7
#
# Squad container image — built from a standalone bundle, no npm at runtime.
#
# Honors the environment-variable and path contract documented in
# docs/src/content/docs/reference/container-image.md (WORKDIR /app, non-root
# uid 1001, SIGTERM drain, `squad watch --execute` as the default command).
#
# The difference from the reference Dockerfile in that page is where the CLI
# comes from: instead of `npm install -g @bradygaster/squad-cli` at image build
# time, this copies a self-contained bundle produced by
# scripts/build-standalone.mjs. npm is used only inside the builder stage, so
# the final image has no dependency on registry.npmjs.org — matching the goal
# of #1593 and the limitation deferred in #1587.
#
# Build:
#   docker build -t squad:local .
#
# Run:
#   docker run --rm -e GITHUB_TOKEN=... -v "$PWD/.squad:/app/.squad" squad:local

# ---------------------------------------------------------------- builder ---
FROM node:22-alpine AS builder
WORKDIR /build

# The root package.json declares a workspace with a `file:` dependency on
# packages/squad-sdk, so a manifest-only cache layer cannot resolve — copy the
# source first, then install.
COPY . .
RUN npm ci --no-audit --no-fund

# --skip-runtime: the runtime stage is already a Node image, so vendoring a
#   second Node would only add weight — and the official nodejs.org builds are
#   glibc, which would not run on this musl base anyway.
# --include-optional: the container genuinely needs the optional dependencies.
#   `squad watch --execute` spawns the Copilot CLI, and the container contract
#   documents OTLP export, which lives in the optional OpenTelemetry packages.
RUN npm run build \
 && node scripts/build-standalone.mjs \
      --platform linux --arch x64 \
      --skip-runtime --include-optional \
      --out-dir /out

# ---------------------------------------------------------------- runtime ---
FROM node:22-alpine AS runtime

# Non-root user (UID 1001 avoids common conflicts with bind mounts).
RUN addgroup --system squad && adduser --system --ingroup squad --uid 1001 squad

WORKDIR /app

# The bundle: launcher + app/node_modules (squad-cli, squad-sdk, templates,
# presets, and the Copilot CLI platform binary).
COPY --from=builder --chown=squad:squad /out/squad-linux-x64 /opt/squad

# `squad` on PATH, plus the bundled Copilot CLI that `squad watch` spawns.
ENV PATH="/opt/squad:/opt/squad/app/node_modules/.bin:${PATH}"

# Tells the CLI it is running from a bundle, so `squad init` writes a
# squad_state MCP spec that points at this launcher instead of npx — which
# would be unrunnable in an image with no npm registry access (#1593).
ENV SQUAD_STANDALONE_HOME=/opt/squad

USER squad

# Squad handles SIGTERM: drains in-flight work, then exits cleanly.
STOPSIGNAL SIGTERM

# GITHUB_TOKEN must be provided at runtime — never bake it into the image.
# Inject via Kubernetes Secret, ACA Key Vault reference, or CSI driver.
CMD ["squad", "watch", "--execute"]
