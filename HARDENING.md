<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.13.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `1`

Action **scanaislop--aislop/v0.13.1** was hardened automatically. 2 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

Multiple `uses:` references are pinned to mutable version tags instead of full 40-character SHA digests, making them vulnerable to supply-chain attacks if the tag is moved. Failing references include: `actions/setup-node@v6` in action.yml; `actions/checkout@v7`, `pnpm/action-setup@v5`, `actions/setup-node@v6` in aislop.yml; `actions/checkout@v7`, `pnpm/action-setup@v5`, `actions/setup-node@v6` in ci.yml; `actions/checkout@v7`, `github/codeql-action/init@v4`, `github/codeql-action/analyze@v4` in codeql.yml; `actions/checkout@v7`, `actions/setup-node@v6` in contributors.yml; `actions/checkout@v7`, `pnpm/action-setup@v4`, `actions/setup-node@v6` in release.yml; `actions/checkout@v7` in sync-develop.yml.

Locations:

- `action.yml:30`
- `.github/workflows/aislop.yml:14`
- `.github/workflows/ci.yml:22`
- `.github/workflows/codeql.yml:55`
- `.github/workflows/contributors.yml:14`
- `.github/workflows/release.yml:14`
- `.github/workflows/sync-develop.yml:10`

### script-injection (severity: high)

Rule (a) violation: In the 'Push refresh branch' run block, `${{ github.repository }}` and `${{ github.ref_name }}` are interpolated directly inside a shell command string (`echo "...https://github.com/${{ github.repository }}/compare/${{ github.ref_name }}..."`). Any `${{ ... }}` expression directly inside a `run:` block is a script-injection risk because the value is substituted by the Actions template engine before the shell ever sees it, allowing special characters to be interpreted by the shell.

Locations:

- `.github/workflows/contributors.yml:43`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection

**Notes:**

Pinned all mutable action tags to full SHA digests: actions/checkout@v7 → 9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0, actions/setup-node@v6 → 48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e, pnpm/action-setup@v5 → fc06bc1257f339d1d5d8b3a19a8cae5388b55320, pnpm/action-setup@v4 → b906affcce14559ad1aafd4ab0e942779e9f58b1, github/codeql-action/init@v4 → 54f647b7e1bb85c95cddabcd46b0c578ec92bc1a, github/codeql-action/analyze@v4 → 54f647b7e1bb85c95cddabcd46b0c578ec92bc1a. Fixed script injection in contributors.yml by moving ${{ github.repository }} and ${{ github.ref_name }} from the run block into the step's env block as GH_REPOSITORY and GH_REF_NAME, then referencing them as plain shell variables in the script.

