<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.16.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.16.1** was hardened automatically. 1 finding(s) were identified and resolved across 2 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

The composite action step uses `actions/setup-node@v7`, which is a mutable tag reference rather than a pinned 40-character commit SHA. This means the action could be silently updated to a different (potentially malicious) version without any change to this file. It should be pinned to a full SHA, e.g. `actions/setup-node@<40-char-sha> # v7`.

Locations:

- `action.yml:34`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses

**Notes:**

Replaced `actions/setup-node@v7` with the pinned SHA reference `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7` in hardened/action/action.yml line 34. The SHA was resolved via the GitHub API.

### Iteration 2

**Fixes applied:** script-injection, github-env-injection

**Notes:**

Fixed three security findings across three workflow files:
1. ci.yml: Moved `${{ needs.test-matrix.result }}` out of the `run:` shell string into an `env:` block as `TEST_MATRIX_RESULT`, referencing it as `$TEST_MATRIX_RESULT` in the shell script.
2. contributors.yml: Moved `${{ github.repository }}` and `${{ github.ref_name }}` out of the `run:` shell string into an `env:` block as `GH_REPOSITORY` and `GH_REF_NAME`, referencing them as `$GH_REPOSITORY` and `$GH_REF_NAME` in the shell script.
3. release.yml: Added `safe_tag="$(printf '%s' "$RELEASE_TAG" | tr -d '\n\r')"` before the `echo "tag=..." >> "$GITHUB_OUTPUT"` line, writing `$safe_tag` instead of the raw `$RELEASE_TAG` to prevent newline injection into the special environment file.

