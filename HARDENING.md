<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.14.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.14.1** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step uses `actions/setup-node@v7`, which is a mutable tag reference rather than a pinned 40-character commit SHA. This means the action could be silently updated to a different (potentially malicious) version without any change to the workflow. It should be pinned to a full SHA, e.g. `actions/setup-node@1d0ff469b12462b0e4b4c3c8a8d4b4b4b4b4b4b4 # v7`.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node@v7 to its full commit SHA (820762786026740c76f36085b0efc47a31fe5020) in hardened/action/action.yml line 30. The tag is preserved as a comment (# v7) for readability.

