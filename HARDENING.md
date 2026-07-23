<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.14.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.14.0** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

Multiple `uses:` references across action.yml and all workflow files use mutable version tags instead of pinned 40-character commit SHA digests, making the action vulnerable to supply-chain attacks if the referenced tags are moved.

Failing references include:
- action.yml: `actions/setup-node@v7`
- aislop.yml: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`
- ci.yml: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`
- codeql.yml: `actions/checkout@v7`, `github/codeql-action/init@v4`, `github/codeql-action/analyze@v4`
- contributors.yml: `actions/checkout@v7`, `actions/setup-node@v7`
- release.yml: `actions/checkout@v7`, `pnpm/action-setup@v6`, `actions/setup-node@v7`
- sync-develop.yml: `actions/checkout@v7`

Locations:

- `action.yml:34`
- `.github/workflows/aislop.yml:14`
- `.github/workflows/ci.yml:29`
- `.github/workflows/codeql.yml:55`
- `.github/workflows/contributors.yml:16`
- `.github/workflows/release.yml:18`
- `.github/workflows/sync-develop.yml:13`

### script-injection (severity: high)

Sub-rule (a): GitHub Actions expressions are interpolated directly inside `run:` shell command strings, bypassing shell quoting and allowing injection of arbitrary shell metacharacters.

In `.github/workflows/ci.yml`, the `needs.test-matrix.result` context value is interpolated directly into a shell `if` condition and an `echo` command:
```
if [ "${{ needs.test-matrix.result }}" != "success" ]; then
  echo "Build & test matrix did not pass: ${{ needs.test-matrix.result }}"
```
These should be routed through an `env:` variable and the env var should be referenced as `"$VAR"` in the shell.

In `.github/workflows/contributors.yml`, `github.repository` and `github.ref_name` are interpolated directly inside an `echo` command in a `run:` block:
```
echo "Pushed to ...https://github.com/${{ github.repository }}/compare/${{ github.ref_name }}..."
```
An attacker who can control the repository name or ref name could inject shell metacharacters.

Locations:

- `.github/workflows/ci.yml:57`
- `.github/workflows/ci.yml:58`
- `.github/workflows/contributors.yml:48`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection

**Notes:**

Pinned all mutable action tag references to full 40-character commit SHAs across action.yml and all 6 workflow files (aislop.yml, ci.yml, codeql.yml, contributors.yml, release.yml, sync-develop.yml). Fixed script injection in ci.yml by moving `needs.test-matrix.result` into an env var `MATRIX_RESULT`, and in contributors.yml by moving `github.repository` and `github.ref_name` into env vars `GH_REPOSITORY` and `GH_REF_NAME`, with shell scripts updated to reference the env vars instead.

