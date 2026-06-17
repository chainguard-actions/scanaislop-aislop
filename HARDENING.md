<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.10.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `1`

Action **scanaislop--aislop/v0.10.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action uses `actions/setup-node@v4` which is pinned to a mutable tag (`@v4`) rather than a full 40-character commit SHA. This means the action could silently change if the tag is moved, enabling supply-chain attacks. It should be pinned to a specific commit SHA, e.g. `actions/setup-node@1d0ff469b12462b0c3c5f5b8b5b0b5b5b5b5b5b # v4`.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned `actions/setup-node@v4` to its full commit SHA `49933ea5288caeca8642d1e84afbd3f7d6820020` in action.yml (line 30). The mutable tag `v4` is retained as an inline comment for readability.

