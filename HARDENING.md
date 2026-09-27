<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.10.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.10.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action uses `actions/setup-node@v4`, which is pinned to a mutable tag (`@v4`) rather than a full 40-character commit SHA. This means the referenced action could be silently changed by the upstream maintainer (or a compromised account), enabling a supply-chain attack. It should be pinned to a specific commit SHA, e.g. `actions/setup-node@1d0ff469b12f8a5c9a8237b5d2e0f4a7b3c6e9d2 # v4`.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned `actions/setup-node@v4` to its full commit SHA `49933ea5288caeca8642d1e84afbd3f7d6820020` in hardened/action/action.yml (line 30), preserving `# v4` as a readability comment.

