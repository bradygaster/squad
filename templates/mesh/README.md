# Mesh Sync Templates

Scaffolding files for distributed squad coordination. Copy these to your project root and customize `mesh.json.example` with your squad configuration.

## Usage

**Initialize a mesh state repository:**
```bash
./sync-mesh.sh --init         # bash
.\sync-mesh.ps1 -Init         # PowerShell
```

Creates squad directories with placeholder `SUMMARY.md` files and a root README based on your `mesh.json`.

**Sync remote squad state locally:**
```bash
./sync-mesh.sh                # bash
.\sync-mesh.ps1               # PowerShell
```

Run before agents read remote state. No daemon. No service.

See `.squad/skills/distributed-mesh/SKILL.md` for full documentation on zones, write partitioning, and trust boundaries.
