---
'@bradygaster/squad-cli': patch
---

Implement the two documented `squad watch` stop signals, which were previously parsed but never read. `--sentinel-file <path>` now stops the run gracefully once that file is deleted, and creating `.squad/ralph-stop` stops the run gracefully as documented in the README. Both are checked at the top of each round and reuse the existing graceful shutdown path, so a watch run can now be stopped from outside the process without sending a signal. Closes #1711.
