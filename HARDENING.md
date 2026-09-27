<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.16.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.16.1** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step `uses: actions/setup-node@v7` references a mutable tag (`@v7`) rather than a pinned 40-character commit SHA. This means the action could be silently updated or replaced with a malicious version without any change to the workflow, creating a supply-chain risk.

Locations:

- `action.yml:33`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned `actions/setup-node@v7` to its full commit SHA `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7` in hardened/action/action.yml line 33. The mutable tag was replaced with the immutable SHA to prevent supply-chain attacks via silent action updates.

