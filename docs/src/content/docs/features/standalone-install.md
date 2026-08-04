# Standalone Install (no npm)

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad publishes self-contained bundles that vendor their own Node.js runtime.
Installing from these touches `github.com` only — nothing is fetched from
`registry.npmjs.org`, and neither Node.js nor npm needs to be installed first.

This exists for environments where the npm registry is unreachable: self-hosted
CI runners behind a corporate firewall, locked-down build agents, and air-gapped
mirrors. It is also simply a faster install for anyone who does not otherwise
have a Node toolchain.

`npm install -g @bradygaster/squad-cli` remains fully supported and is still the
recommended path for day-to-day development.

## Install

### macOS and Linux

```sh
curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/dev/scripts/install.sh | sh
```

The installer picks the right bundle for your platform, verifies it against the
release `SHA256SUMS.txt`, unpacks it into `$PREFIX/lib/squad`, and symlinks
`squad` into `$PREFIX/bin`.

| Variable | Default | Purpose |
|----------|---------|---------|
| `VERSION` | latest release | Install a specific version |
| `PREFIX` | `/usr/local` as root, else `$HOME/.local` | Install location |
| `REPO` | `bradygaster/squad` | Source repository or internal mirror |

```sh
# pin a version and install somewhere specific
curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/dev/scripts/install.sh \
  | VERSION="v0.11.0" PREFIX="$HOME/tools" sh
```

### Windows

Download `squad-win32-x64.zip` (or `squad-win32-arm64.zip`) from the
[releases page](https://github.com/bradygaster/squad/releases), unpack it, and
add the folder to your `PATH`. The bundle ships both `squad.cmd` and
`squad.ps1`.

### Direct download

Every release carries one archive per platform plus a `SHA256SUMS.txt`:

```
squad-linux-x64.tar.gz     squad-darwin-x64.tar.gz    squad-win32-x64.zip
squad-linux-arm64.tar.gz   squad-darwin-arm64.tar.gz  squad-win32-arm64.zip
SHA256SUMS.txt
```

## What is in a bundle

```
squad-<platform>-<arch>/
├── squad               launcher (squad.cmd + squad.ps1 on Windows)
├── runtime/            vendored Node.js runtime
├── app/                squad-cli, squad-sdk, templates, presets
└── BUNDLE-INFO.json    version, target, vendored Node version, build time
```

A bundle is roughly **110 MB** unpacked, comparable to GitHub Copilot CLI's own
platform archives.

Squad locates its templates, presets and version by walking up from the module
path at runtime, so the bundle deliberately preserves a real directory layout
rather than compiling to a single executable. That keeps behavior identical to
an npm install with no source changes.

## Prerequisite: Copilot CLI

Squad drives the GitHub Copilot CLI, which is **not** included in the bundle.
Copilot CLI already ships its own npm-free installers, so vendoring a second
copy would only add ~318 MB and a version-skew problem:

```sh
curl -fsSL https://gh.io/copilot-install | bash   # macOS/Linux
winget install GitHub.Copilot                     # Windows
brew install --cask copilot-cli                   # Homebrew
```

## Using it in CI

The bundles are what make an npm-free CI job possible — including the
[gh-aw](/features/gh-aw/) activation job, which previously required `npx` and so
could not run on a runner without npm registry access.

```yaml
- name: Install Squad
  env:
    SQUAD_VERSION: v0.11.0
  run: |
    curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/dev/scripts/install.sh \
      | VERSION="${SQUAD_VERSION}" PREFIX="${HOME}/.local" sh
    echo "${HOME}/.local/bin" >> "${GITHUB_PATH}"

- name: Initialize Squad
  run: squad init --preset default --state-backend local
```

Set `REPO` to an internal mirror if your runners cannot reach `github.com`
either.

## Building a bundle yourself

```sh
npm run build
node scripts/build-standalone.mjs                          # host platform
node scripts/build-standalone.mjs --platform linux --arch arm64
node scripts/build-standalone.mjs --skip-runtime           # use system node
node scripts/build-standalone.mjs --include-optional       # keep optional deps
```

Optional dependencies are omitted by default. That drops the Copilot CLI
platform binary pulled in transitively through `@github/copilot-sdk`
(~318 MB), plus `node-pty` prebuilds, the OpenTelemetry SDK and `sql.js` —
taking a bundle from roughly 546 MB to 114 MB. Pass `--include-optional` if you
need telemetry export or the `sql.js` state backend inside the bundle.

npm is still used at *build* time to resolve the dependency tree. It is the
**runtime** dependency on the registry that these bundles remove.

## Known limitations

- **Cross-built bundles are not executed in CI.** A vendored runtime only runs
  on a matching host, so the release workflow smoke-tests `linux-x64` by
  invoking the CLI and verifies the other five targets structurally.
- **No code signing or notarization yet.** macOS Gatekeeper will quarantine the
  downloaded bundle until it is signed and notarized.
- **Optional deps are excluded by default**, so the bundled CLI has no
  OpenTelemetry exporter and no `sql.js` state backend unless it was built with
  `--include-optional`.
- **The installer is POSIX-only.** Windows installs are download-and-unpack;
  winget and Homebrew packaging are not part of this yet.
