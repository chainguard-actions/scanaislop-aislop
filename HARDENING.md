<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.13.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.13.1** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

Multiple `uses:` references across action.yml and all workflow files are pinned to mutable tags (e.g. @v4, @v5, @v6, @v7) rather than immutable 40-character SHA commit hashes. This exposes the action to supply-chain attacks if any upstream action is compromised or its tag is moved.

Failing references include:
- action.yml: actions/setup-node@v6
- .github/workflows/aislop.yml: actions/checkout@v7, pnpm/action-setup@v5, actions/setup-node@v6
- .github/workflows/ci.yml: actions/checkout@v7, pnpm/action-setup@v5, actions/setup-node@v6
- .github/workflows/codeql.yml: actions/checkout@v7, github/codeql-action/init@v4, github/codeql-action/analyze@v4
- .github/workflows/contributors.yml: actions/checkout@v7, actions/setup-node@v6
- .github/workflows/release.yml: actions/checkout@v7, pnpm/action-setup@v4, actions/setup-node@v6
- .github/workflows/sync-develop.yml: actions/checkout@v7

Locations:

- `action.yml:33`
- `.github/workflows/aislop.yml:14`
- `.github/workflows/ci.yml:22`
- `.github/workflows/codeql.yml:55`
- `.github/workflows/contributors.yml:14`
- `.github/workflows/release.yml:14`
- `.github/workflows/sync-develop.yml:11`

### script-injection (severity: high)

In .github/workflows/contributors.yml, the 'Push refresh branch' run: block directly interpolates `${{ github.repository }}` and `${{ github.ref_name }}` inside a shell command string (an echo statement). This is a sub-rule (a) violation: any `${{ ... }}` expression interpolated directly inside a run: block is a script injection risk, as the value is substituted by the YAML template engine before the shell ever sees it. An attacker who can control the repository name or ref name could inject shell metacharacters.

Offending line:
  echo "Pushed to `bot/contributors-update`. Open a PR from the GitHub UI to merge: https://github.com/${{ github.repository }}/compare/${{ github.ref_name }}...bot/contributors-update?expand=1"

Locations:

- `.github/workflows/contributors.yml:40`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection

**Notes:**

Pinned all mutable tag references to full 40-character SHA hashes across action.yml and all 6 workflow files: actions/checkout@v7→SHA, actions/setup-node@v6→SHA, pnpm/action-setup@v5→SHA, pnpm/action-setup@v4→SHA, github/codeql-action/init@v4→SHA, github/codeql-action/analyze@v4→SHA. Fixed script injection in contributors.yml by moving ${{ github.repository }} and ${{ github.ref_name }} into the step's env: block as GH_REPOSITORY and GH_REF_NAME, then referencing them as plain shell variables in the run: block.

