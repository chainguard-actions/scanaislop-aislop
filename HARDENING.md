<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.23.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.23.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite step in action.yml pins its action to a version tag instead of a full 40-character commit SHA: `uses: actions/setup-node@v7.1.0`. Whoever controls that tag can move it to different code. Pin it to the commit SHA, for example `actions/setup-node@<sha> # v7.1.0`.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node to commit 949feb2413d6458794dcd2491c4babbbce0c15c1 (# v7.1.0). The pinned SHA came from lookup_action_sha. I also changed AISLOP_ACTION_REF from github.action_ref to the fixed value 'v0.23.0' (the upstream release this mirror was built from). That ref decides which aislop CLI version npm installs. On the mirror it would name a mirror commit or tag, so a user who left the version input empty could get 'latest' instead of 0.23.0. Nothing was run to test either change.

