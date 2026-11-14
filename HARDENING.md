<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.22.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.22.0** was hardened automatically. 1 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step references a mutable tag instead of a full 40-character commit SHA: `uses: actions/setup-node@v7.1.0`. Fix: pin it to the commit SHA for that release and keep the tag as a comment.

Locations:

- `action.yml:30`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Pinned actions/setup-node@v7.1.0 to 949feb2413d6458794dcd2491c4babbbce0c15c1 (the SHA lookup_action_sha returned) and kept '# v7.1.0' as a comment. I left github.action_ref in the env expression as it was. action.yml never names its own repository, so the post-processing step replaces that ref with upstream_ref, and the CLI version still resolves to upstream's.

