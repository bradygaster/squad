---
'@bradygaster/squad-sdk': patch
'@bradygaster/squad-cli': patch
---

Mark the `cross-machine-coordination` skill template as a design proposal that is not implemented: no Squad release reads `.squad/cross-machine/` task files, the `cross_machine` config block, or `squad:machine-*` labels. The skill now points to `squad watch` work claims (`--claims git-ref`, ADR-002) for keeping several watchers off the same issue, and to `needs:*` capability routing for hardware-specific work.
