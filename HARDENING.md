<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.12.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.12.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step uses `actions/setup-node@v4`, which is a mutable tag reference rather than a pinned full-length SHA commit hash. A tag can be moved to point to a different (potentially malicious) commit at any time, enabling supply-chain attacks. It should be replaced with a full 40-character hex SHA, e.g. `actions/setup-node@1d0ff469b12294b4f0f8b8b58e4f9b9b8b8b8b8b # v4`.

Locations:

- `action.yml:33`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Replaced `actions/setup-node@v4` with the pinned full SHA reference `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4` in hardened/action/action.yml line 33. The original tag is preserved as a comment for readability.

