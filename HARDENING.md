<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.16.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.16.0** was hardened automatically. 3 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

action.yml references `actions/setup-node@v7` using a mutable version tag instead of a pinned 40-character commit SHA. This allows the referenced action to be silently updated (or compromised) without the consuming workflow noticing, enabling supply-chain attacks.

Locations:

- `action.yml:30`

### script-injection (severity: high)

Sub-rule (a): The `${{ needs.test-matrix.result }}` expression is interpolated directly inside a `run:` shell command string. Any `${{ ... }}` expression in a run block is substituted by the YAML template engine before the shell ever sees the script, bypassing shell quoting. Although `needs.*.result` is GitHub-controlled, the check requires no expression to appear directly in a run block. Offending lines:
  `if [ "${{ needs.test-matrix.result }}" != "success" ]`
  `echo "Build & test matrix did not pass: ${{ needs.test-matrix.result }}"`
Fix: capture the value in an `env:` variable and reference `$ENV_VAR` in the shell script instead.

Locations:

- `.github/workflows/ci.yml:57`
- `.github/workflows/ci.yml:58`

### script-injection (severity: high)

Sub-rule (a): The expressions `${{ github.repository }}` and `${{ github.ref_name }}` are interpolated directly inside a `run:` shell command string (an `echo` writing to `$GITHUB_STEP_SUMMARY`). These values flow through YAML template substitution before the shell processes the script, so a repository name or ref name containing shell metacharacters could alter the command. Offending line:
  `echo "Pushed to \`bot/contributors-update\`. Open a PR from the GitHub UI to merge: https://github.com/${{ github.repository }}/compare/${{ github.ref_name }}...bot/contributors-update?expand=1"`
Fix: move `github.repository` and `github.ref_name` into `env:` variables and reference them as `$GITHUB_REPOSITORY` / `$GITHUB_REF_NAME` in the shell script.

Locations:

- `.github/workflows/contributors.yml:44`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection

**Notes:**

1. action.yml: Pinned `actions/setup-node@v7` to full SHA `820762786026740c76f36085b0efc47a31fe5020` with `# v7` comment. 2. .github/workflows/ci.yml: Moved `${{ needs.test-matrix.result }}` into an `env:` block as `MATRIX_RESULT` and replaced both inline expressions with `$MATRIX_RESULT`. 3. .github/workflows/contributors.yml: Moved `${{ github.repository }}` and `${{ github.ref_name }}` into an `env:` block as `GH_REPOSITORY` and `GH_REF_NAME` respectively, and replaced the inline expressions in the echo command with `$GH_REPOSITORY` and `$GH_REF_NAME`.

