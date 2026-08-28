# Standalone Install (no npm)

> ⚠️ **Experimental** — Squad is alpha software. APIs, commands, and behavior may change between releases.

Squad publishes self-contained bundles that vendor their own Node.js runtime.
Installing from these touches `github.com` only — nothing is fetched from
`registry.npmjs.org`, and neither Node.js nor npm needs to be installed first.

This exists for environments where the npm registry is unreachable: self-hosted
CI runners behind a corporate firewall, locked-down build agents, and air-gapped
mirrors. It is also simply a faster install for anyone who does not otherwise
have a Node toolchain.

`npm install -g @bradygaster/squad-cli` remains fully supported. All install
methods provide the same Squad CLI; choose based on your platform and whether
your environment can reach the npm registry.

## Install

### macOS and Linux

```sh
curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/main/scripts/install.sh | sh
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
curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/main/scripts/install.sh \
  | VERSION="v0.13.1" PREFIX="$HOME/tools" sh
```

### Windows

Install with winget:

```powershell
winget install bradygaster.Squad
```

Or download `squad-win32-x64.zip` (or `squad-win32-arm64.zip`) from the
[releases page](https://github.com/bradygaster/squad/releases), unpack it, and
add the folder to your `PATH`.

### macOS

Install with Homebrew:

```sh
brew tap bradygaster/squad
brew install --cask squad
```

Or use the install script above, which works on macOS too.

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
├── squad               launcher (squad.exe + squad.cmd + squad.ps1 on Windows)
├── runtime/            vendored Node.js runtime (POSIX only — see below)
├── app/                squad-cli, squad-sdk, templates, presets
└── BUNDLE-INFO.json    version, target, vendored Node version, build time
```

A bundle is roughly **110 MB** unpacked, comparable to GitHub Copilot CLI's own
platform archives.

Squad locates its templates, presets and version by walking up from the module
path at runtime, so the bundle deliberately preserves a real directory layout
rather than compiling to a single executable. That keeps behavior identical to
an npm install with no source changes.

### Why Windows bundles ship a real `squad.exe`

winget's portable installer only creates command aliases for `.exe` targets —
`.cmd` and `.bat` are explicitly unsupported — so a package pointing at
`squad.cmd` would install something that cannot be invoked.

Windows bundles therefore ship `squad.exe`, built with Node's
[single executable application](https://nodejs.org/api/single-executable-applications.html)
support. It is the vendored Node runtime with a small launcher embedded, so it
*replaces* `runtime/node.exe` rather than adding to the bundle: a Windows bundle
is the same size as before. `squad.cmd` and `squad.ps1` remain for anyone who
unpacks the archive and runs it in place.

The launcher resolves the bundle from its own location, following a symlink if
it finds one, because winget installs portables by symlinking the executable
into a links directory.

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
[gh-aw](/features/gh-aw/) activation job, which previously required registry
access and could not run on an isolated runner.

The release workflow still uses npm at bundle-build time because there is no
practical npm-free way to assemble the dependency tree. That workflow uses the
GitHub-hosted runner's normal registry configuration. The Microsoft npm proxy is
for local development only and must not be configured in GitHub Actions.

The `squad-init` action wraps the install and init steps:

```yaml
- uses: bradygaster/squad/.github/actions/squad-init@<sha>
  with:
    version: v0.13.1        # default: latest release
    preset: default
    state-backend: local
```

Point `repository:` at an internal mirror if your runners cannot reach
`github.com` either. To do it by hand instead:

```yaml
- name: Install Squad
  env:
    SQUAD_VERSION: v0.13.1
  run: |
    curl -fsSL https://raw.githubusercontent.com/bradygaster/squad/main/scripts/install.sh \
      | VERSION="${SQUAD_VERSION}" PREFIX="${HOME}/.local" sh
    echo "${HOME}/.local/bin" >> "${GITHUB_PATH}"

- name: Initialize Squad
  run: squad init --preset default --state-backend local
```

## Containers

The repository `Dockerfile` builds an image from a bundle rather than
`npm install -g`, so the resulting image has no runtime dependency on the npm
registry. It follows the same contract as every other Squad image — see
[Container Image](/reference/container-image/) for the environment variables,
paths, and shutdown behavior.

```sh
docker build -t squad:local .
docker run --rm -e GITHUB_TOKEN=... -v "$PWD/.squad:/app/.squad" squad:local
```

The image sets `SQUAD_STANDALONE_HOME=/opt/squad`, which makes `squad init`
inside the container write a registry-independent MCP spec.

## The squad_state MCP server

`squad init` writes a `squad_state` MCP entry into `.mcp.json` so Copilot can
reach Squad's state tools. A bundle install writes the local executable directly:

```json
{ "command": "/opt/squad/squad", "args": ["state-mcp"] }
```

The launcher exports `SQUAD_STANDALONE_HOME`, and the resolver checks it
*before* probing the npm registry, so a firewalled machine makes no registry
call at all. The path is absolute because Copilot spawns the MCP server in its
own environment, where neither `PATH` nor that variable is guaranteed.

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

## Packaging manifests

Homebrew and winget both embed the release version and a SHA-256 per artifact,
so their manifests cannot be hand-maintained without going stale every release.
They are generated from the release's own `SHA256SUMS.txt`:

```sh
node scripts/generate-packaging.mjs --version v0.11.0
```

That writes `dist-packaging/homebrew/squad.rb` and the three winget manifests
(version, installer, locale). The release workflow runs this automatically,
updates the Homebrew tap, and opens a pull request against `winget-pkgs`.
The `packaging-manifests` artifact is retained for audit and manual recovery.
Homebrew updates are available as soon as the release workflow finishes;
WinGet updates become available after the community repository accepts the
generated pull request. Homebrew and WinGet publication runs only for stable
`vMAJOR.MINOR.PATCH` releases; prereleases still receive standalone archives.

## Known limitations

- **Cross-built bundles are not executed in CI.** A vendored runtime only runs
  on a matching host, so the release workflow smoke-tests `linux-x64` by
  invoking the CLI and verifies the other five targets structurally.
- **No code signing or notarization yet.** macOS Gatekeeper will quarantine the
  downloaded bundle until it is signed and notarized, and injecting the SEA blob
  invalidates the Node runtime's original Authenticode signature on Windows, so
  SmartScreen will warn. This is the main gap before the Homebrew and winget
  packages should be recommended widely.
- **Optional deps are excluded by default**, so the bundled CLI has no
  OpenTelemetry exporter and no `sql.js` state backend unless it was built with
  `--include-optional`. The container image builds with them included.
- **The install script is POSIX-only.** On Windows use winget or
  download-and-unpack.
- **`squad upgrade` does not manage bundles.** Re-run the install script, use
  your package manager, or pull a newer image to move between versions.

## Verifying a bundle locally

You can exercise the whole install path without a published release by serving
an asset yourself:

```sh
node scripts/build-standalone.mjs --platform linux --arch x64 --out-dir /tmp/out
cd /tmp/out && tar -czf squad-linux-x64.tar.gz squad-linux-x64
sha256sum squad-linux-x64.tar.gz > SHA256SUMS.txt
```

Serve that directory under `<repo>/releases/download/<tag>/` on a local HTTP
server, then point the installer at it with `REPO` and `VERSION`. The script
verifies the checksum before unpacking and aborts on a mismatch, so this also
exercises the tamper path.
