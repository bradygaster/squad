# Decision: Fix compareSemver to Handle Pre-Release Suffixes

**Date:** 2026-02-20  
**Decider:** Fenster  
**Status:** Implemented  

## Context

The `compareSemver` function in `index.js` (around line 1220) was breaking for versions with pre-release suffixes like `0.5.3-insiders`. The original implementation used `.split('.').map(Number)`, which produced `NaN` for components like `'3-insiders'`, causing incorrect version comparisons.

This became critical for the insider release program (#94) where we need to correctly compare versions like:
- `0.5.2` vs `0.5.3-insiders` (0.5.2 should be less)
- `0.5.3-insiders` vs `0.5.3` (pre-release should be less than release)
- `0.5.3-insiders` vs `0.5.3-insiders` (should be equal)

## Decision

Fixed `compareSemver` to:
1. Strip pre-release suffix (everything after first `-`) before numeric comparison
2. Compare base version numbers normally
3. When base versions are equal, apply semver ordering: pre-release < release
4. When both have pre-releases, use lexicographic string comparison

## Implementation

```javascript
function compareSemver(a, b) {
  const stripPre = v => v.split('-')[0];
  const pa = stripPre(a).split('.').map(Number);
  const pb = stripPre(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  // Base versions equal — pre-release is less than release
  const aPre = a.includes('-');
  const bPre = b.includes('-');
  if (aPre && !bPre) return -1;
  if (!aPre && bPre) return 1;
  if (aPre && bPre) return a < b ? -1 : a > b ? 1 : 0;
  return 0;
}
```

## Consequences

- ✅ Correct version ordering for insider releases
- ✅ All existing semver comparisons unchanged
- ✅ All 86 tests pass
- ✅ Enables upgrade checks to correctly handle pre-release versions
- ✅ Version bumped from 0.5.2 → 0.5.3

## Alternative Considered

Using a full semver library like `semver` npm package was rejected because:
- Adds external dependency (Squad has zero runtime deps)
- Overkill for our simple version comparison needs
- The 17-line implementation covers all our use cases
