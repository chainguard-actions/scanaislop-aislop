<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.18.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.18.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step uses `actions/setup-node@v7`, which is pinned to a mutable version tag rather than an immutable 40-character commit SHA. This means the action could silently change if the tag is moved, enabling supply-chain attacks. It should be pinned to a full SHA, e.g. `actions/setup-node@1d0ff469b4a71a8d521eaf1c2b8e9e3c5e3e3e3e # v7`.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned `actions/setup-node@v7` to the full commit SHA `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7` in hardened/action/action.yml line 30. The mutable tag is preserved as a comment for readability while the immutable SHA prevents supply-chain attacks.

