<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.17.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.17.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action uses `actions/setup-node@v7`, which is pinned to a mutable version tag rather than an immutable 40-character commit SHA. This means the referenced action could be silently replaced with a different (potentially malicious) version without any change to this file, creating a supply-chain risk.

Locations:

- `action.yml:33`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Replaced `actions/setup-node@v7` with `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7` in hardened/action/action.yml. The mutable version tag was resolved to its full 40-character commit SHA using the GitHub API, eliminating the supply-chain risk from a mutable tag reference.

