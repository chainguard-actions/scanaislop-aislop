<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.10.2

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.10.2** was hardened automatically. 1 finding(s) were identified and resolved across 2 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The action uses `actions/setup-node@v4`, which is pinned to a mutable tag (`v4`) rather than an immutable 40-character commit SHA. This means the referenced action could be silently replaced with a different (potentially malicious) version without any change to this file, creating a supply-chain risk.

Locations:

- `action.yml:32`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned `actions/setup-node@v4` to its full commit SHA `actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4` in hardened/action/action.yml (line 32). The mutable tag `v4` is preserved as an inline comment for readability.

### Iteration 2

**Fixes applied:** unpinned-uses, script-injection

**Notes:**

Pinned all 15 unpinned action references across 6 workflow files to full 40-character SHA hashes with tag comments for readability. Fixed script injection in contributors.yml by moving ${{ github.repository }} and ${{ github.ref_name }} expressions into an env: block (as GH_REPOSITORY and GH_REF_NAME) and referencing them as plain shell variables in the run: script.

