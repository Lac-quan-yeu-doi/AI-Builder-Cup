FROM node:22.19.0-bookworm-slim

ARG TARGETARCH

RUN apt-get update \
 && apt-get install -y --no-install-recommends bash bubblewrap ca-certificates curl python3 python3-venv ripgrep socat xz-utils \
 && rm -rf /var/lib/apt/lists/*

COPY sandbox-runner/report-requirements.*.lock /tmp/report-requirements/
# Resolve no package indexes during the build: install the complete, verified
# dependency set from architecture-specific wheel URLs with required hashes.
RUN REPORT_ARCH="${TARGETARCH:-$(dpkg --print-architecture)}" \
 && case "$REPORT_ARCH" in amd64|arm64) ;; *) echo "Unsupported report architecture: $REPORT_ARCH" >&2; exit 1 ;; esac \
 && python3 -m venv /opt/report-python \
 && /opt/report-python/bin/pip install --no-index --no-deps --require-hashes \
      --only-binary=:all: --timeout=60 --retries=5 \
      --disable-pip-version-check --no-cache-dir \
      -r "/tmp/report-requirements/report-requirements.$REPORT_ARCH.lock" \
 && /opt/report-python/bin/pip check \
 && rm -rf /tmp/report-requirements

# BuildKit sets TARGETARCH automatically; the Cloud Build Docker builder may not.
RUN TARGETARCH="${TARGETARCH:-$(dpkg --print-architecture)}" \
 && export TARGETARCH \
 && mkdir -p /tmp/render-tools \
 && case "$TARGETARCH" in \
      amd64) TYPST_ASSET=typst-x86_64-unknown-linux-musl.tar.xz; TYPST_DIR=typst-x86_64-unknown-linux-musl; TYPST_SHA256=a6d077d0a95eed5a2eba715b2dae06be954f624ccbf85758a03f389ded33118c ;; \
      arm64) TYPST_ASSET=typst-aarch64-unknown-linux-musl.tar.xz; TYPST_DIR=typst-aarch64-unknown-linux-musl; TYPST_SHA256=5aa8d74a3d906e60ea12a66ac2f37f8eef1b14cbad7182a745e393a10c23dcee ;; \
      *) echo "Unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/typst/typst/releases/download/v0.15.1/$TYPST_ASSET" -o /tmp/render-tools/typst.tar.xz \
 && echo "$TYPST_SHA256  /tmp/render-tools/typst.tar.xz" | sha256sum -c - \
 && tar -xJf /tmp/render-tools/typst.tar.xz -C /tmp/render-tools \
 && install -D -m 0755 "/tmp/render-tools/$TYPST_DIR/typst" /usr/libexec/minder/typst \
 && case "$TARGETARCH" in \
      amd64) PANDOC_ASSET=pandoc-3.11-linux-amd64.tar.gz; PANDOC_SHA256=37edb3bbcf722f921a009941bf5874e2e0c09263226c9b4a2d980788cb062ab6 ;; \
      arm64) PANDOC_ASSET=pandoc-3.11-linux-arm64.tar.gz; PANDOC_SHA256=56ed5566ec41d22ec9ee0704e6ac0b98ba102e92384efd5306173a22d314c79a ;; \
      *) echo "Unsupported target architecture: $TARGETARCH" >&2; exit 1 ;; \
    esac \
 && curl -fsSL "https://github.com/jgm/pandoc/releases/download/3.11/$PANDOC_ASSET" -o /tmp/render-tools/pandoc.tar.gz \
 && echo "$PANDOC_SHA256  /tmp/render-tools/pandoc.tar.gz" | sha256sum -c - \
 && tar -xzf /tmp/render-tools/pandoc.tar.gz -C /tmp/render-tools \
 && install -m 0755 /tmp/render-tools/pandoc-3.11/bin/pandoc /usr/local/bin/pandoc \
 && rm -rf /tmp/render-tools

WORKDIR /app
RUN mkdir -p /run/minder-sandbox /tmp/minder-workspaces /sandbox-scratch \
 && chown -R 65532:65532 /run/minder-sandbox /tmp/minder-workspaces /sandbox-scratch
COPY sandbox-runner/package.json sandbox-runner/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY sandbox-runner/server.mjs ./server.mjs
COPY sandbox-runner/smoke-test.mjs ./smoke-test.mjs
COPY sandbox-runner/typst-wrapper.mjs /usr/local/bin/typst
COPY sandbox-runner/celesnity-report.typ /usr/share/minder/celesnity-report.typ
COPY .agents/skills/ /usr/share/minder/skills/
RUN if [ -n "$(find /usr/share/minder/skills -type l -print -quit)" ]; then \
      echo "Global skill folders must not contain symlinks" >&2; exit 1; \
    fi
RUN chmod 0755 /usr/local/bin/typst

ENV NODE_ENV=production \
    HOME=/tmp \
    TMPDIR=/tmp \
    MINDER_SANDBOX_SOCKET=/run/minder-sandbox/runner.sock \
    MINDER_WORKSPACE_CACHE=/tmp/minder-workspaces \
    MINDER_SANDBOX_SCRATCH=/sandbox-scratch

USER 65532:65532
CMD ["node", "server.mjs"]
