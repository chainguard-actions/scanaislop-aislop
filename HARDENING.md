<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.12.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.12.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action uses `actions/setup-node@v4`, which is a mutable tag reference rather than a pinned full 40-character commit SHA. This means the action could silently pull in different (potentially malicious) code if the tag is moved. It should be pinned to a specific commit SHA, e.g. `actions/setup-node@1d0ff469b18977b4dc9a1d9f6b2e4b9e8b4e4e4e # v4`.

Locations:

- `action.yml:32`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned `actions/setup-node@v4` to its full commit SHA `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4` in hardened/action/action.yml line 32. The mutable tag reference was replaced with an immutable SHA to prevent supply chain attacks if the tag is moved.

