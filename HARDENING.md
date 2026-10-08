<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.14.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.14.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action.yml references `actions/setup-node@v7`, which is pinned to a mutable version tag rather than an immutable 40-character commit SHA. This means the action could be silently updated to a different (potentially malicious) version without any change to the workflow file, creating a supply-chain risk.

Locations:

- `action.yml:34`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned `actions/setup-node@v7` to its full commit SHA `949feb2413d6458794dcd2491c4babbbce0c15c1` in action.yml line 34. The original tag is preserved as a comment (`# v7`) for readability.

