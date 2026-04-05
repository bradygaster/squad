---
---

test: add init/upgrade/doctor parity test suite

7 tests verifying that init and upgrade produce equivalent scaffolding.
Guards against drift where new init features (like casting) are not
mirrored in upgrade.
