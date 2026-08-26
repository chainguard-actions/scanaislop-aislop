<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.15.0

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.15.0** was hardened automatically. 4 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

action.yml uses `actions/setup-node@v7` — a mutable tag reference, not a pinned 40-character commit SHA. This is vulnerable to supply-chain attacks if the tag is moved to a malicious commit.

Locations:

- `action.yml:38`

### script-injection (severity: high)

Sub-rule (a): `${{ needs.test-matrix.result }}` is interpolated directly inside a `run:` shell command string. The `needs.*.outputs.*` context is workflow-controllable and flows through YAML template substitution before the shell sees it, enabling script injection. Offending lines: `if [ "${{ needs.test-matrix.result }}" != "success" ]` and `echo "Build & test matrix did not pass: ${{ needs.test-matrix.result }}"`

Locations:

- `.github/workflows/ci.yml:58`

### script-injection (severity: high)

Sub-rule (a): `${{ github.repository }}` and `${{ github.ref_name }}` are interpolated directly inside a `run:` shell command string. These github.* context values flow through YAML template substitution before the shell sees them, enabling script injection. Offending line: `echo "Pushed to \`bot/contributors-update\`. Open a PR from the GitHub UI to merge: https://github.com/${{ github.repository }}/compare/${{ github.ref_name }}...bot/contributors-update?expand=1"`

Locations:

- `.github/workflows/contributors.yml:47`

### github-env-injection (severity: high)

The `resolve-release` step writes `RELEASE_TAG` (sourced from `inputs.tag` or `github.event.release.tag_name`, both untrusted) to `$GITHUB_OUTPUT` without the required sanitization step (`printf '%s' ... | tr -d '\n\r'`). The bash regex guard (`=~ ^v[0-9]+...`) uses `$` which matches end-of-line in bash, not strictly end-of-string, so a crafted value containing a newline could bypass the check and inject additional key=value pairs into GITHUB_OUTPUT. The write is: `echo "tag=$RELEASE_TAG" >> "$GITHUB_OUTPUT"`.

Locations:

- `.github/workflows/release.yml:75`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection, github-env-injection

**Notes:**

Fixed all four findings: (1) Pinned actions/setup-node@v7 to SHA 820762786026740c76f36085b0efc47a31fe5020 in action.yml. (2) Moved needs.test-matrix.result out of run: shell string into env: block (MATRIX_RESULT) in ci.yml. (3) Moved github.repository and github.ref_name out of run: shell string into env: block (GH_REPOSITORY, GH_REF_NAME) in contributors.yml. (4) Added safe_tag sanitization via printf '%s' | tr -d '\n\r' before writing tag= to $GITHUB_OUTPUT in release.yml to prevent newline injection.

