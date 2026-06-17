<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.10.2

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `1`

Action **scanaislop--aislop/v0.10.2** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action uses `actions/setup-node@v4`, which is pinned to a mutable tag (`v4`) rather than a full 40-character commit SHA. This means the referenced action could be silently changed by the upstream repository, enabling a supply-chain attack. It should be pinned to a specific commit SHA (e.g., `actions/setup-node@1d0ff469b4a3d2f5b32d7d7b4b7e6e6e6e6e6e6e # v4`).

Locations:

- `action.yml:33`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Replaced `actions/setup-node@v4` with the pinned full commit SHA `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4` in actions/hardened/scanaislop--aislop/v0.10.2/action.yml at line 33. The original tag is preserved as a comment for readability.

