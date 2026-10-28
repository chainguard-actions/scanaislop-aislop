<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.19.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.19.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step references an action by a mutable tag instead of a full 40-character commit SHA: `uses: actions/setup-node@v7.1.0`.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node@v7.1.0 to 949feb2413d6458794dcd2491c4babbbce0c15c1 # v7.1.0 in action.yml.

