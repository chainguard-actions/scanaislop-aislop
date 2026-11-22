<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.22.3

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.22.3** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

action.yml composite step references an action by a mutable version tag rather than a full 40-character commit SHA: `uses: actions/setup-node@v7.1.0`. Pin to the commit SHA (e.g. `actions/setup-node@<40-hex-sha> # v7.1.0`).

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node to its full commit SHA, 949feb2413d6458794dcd2491c4babbbce0c15c1 (tag v7.1.0, kept as a comment). I also made one more change: AISLOP_ACTION_REF is now set to 'v0.22.3' instead of github.action_ref. resolve-version.sh uses that ref to pick which aislop npm version to install, and on the mirror github.action_ref names the mirror's ref, not upstream's. Nothing was run to test either change.

