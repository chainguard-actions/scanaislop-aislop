<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.20.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.20.1** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step 'uses: actions/setup-node@v7.1.0' points to a version tag, not a full 40-character commit SHA. Tags can be moved, so whoever controls the tag can change the code this action runs. Pin it to a commit SHA, e.g. actions/setup-node@<sha> # v7.1.0.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node to 949feb2413d6458794dcd2491c4babbbce0c15c1 (v7.1.0) in action.yml. Did not change anything else. The github.action_ref expression inside ${{ }} is replaced with upstream_ref after this step, because action.yml never mentions its own repository.

