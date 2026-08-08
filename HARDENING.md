<!-- markdownlint-disable -->

# Hardening Report: scanaislop--aislop/v0.14.1

> This file was generated automatically by the hardening agent.

**Policy SHA:** `d636be7e43ef829af6e853da6b3c7566db9f72fe`

**Test Policy SHA:** `843adf9e4b8f85d0c08b27b9d0b09dd094b54702`

**Harden Agent Version:** `2`

Action **scanaislop--aislop/v0.14.1** was hardened automatically. 4 finding(s) were identified and resolved across 1 iteration(s).

## Findings Fixed

### unpinned-uses (severity: high)

action.yml references `actions/setup-node@v7` using a mutable tag instead of a pinned 40-character commit SHA. This allows supply-chain attacks if the tag is moved to a different commit.

Locations:

- `action.yml:26`

### script-injection (severity: high)

Rule (a): The `check` job's run block in ci.yml directly interpolates `${{ needs.test-matrix.result }}` inside a shell command string. Any `${{ ... }}` expression inside a `run:` block is subject to script injection before the shell processes it. Offending line: `if [ "${{ needs.test-matrix.result }}" != "success" ]; then`

Locations:

- `.github/workflows/ci.yml:70`

### script-injection (severity: high)

Rule (a): The 'Push refresh branch' step in contributors.yml directly interpolates `${{ github.repository }}` and `${{ github.ref_name }}` inside a shell `echo` command in a `run:` block. These github.* context values flow through YAML template substitution before the shell processes them. Offending line: `echo "Pushed to \`bot/contributors-update\`. Open a PR from the GitHub UI to merge: https://github.com/${{ github.repository }}/compare/${{ github.ref_name }}...bot/contributors-update?expand=1"`

Locations:

- `.github/workflows/contributors.yml:48`

### github-env-injection (severity: high)

In release.yml, the `RELEASE_TAG` environment variable is sourced from `${{ github.event.release.tag_name || inputs.tag }}` (where `inputs.tag` is attacker-controllable via workflow_dispatch) and is written to `$GITHUB_OUTPUT` via `echo "tag=$RELEASE_TAG" >> "$GITHUB_OUTPUT"` without the required sanitization step (`printf '%s' "$RELEASE_TAG" | tr -d '\n\r'`). Although a regex validation is applied, the check requires the specific sanitization pipeline before every write to a special environment file when the source is untrusted input.

Locations:

- `.github/workflows/release.yml:76`

## Iteration Notes

### Iteration 1

**Fixes applied:** unpinned-uses, script-injection, github-env-injection

**Notes:**

Fixed 4 findings: (1) Pinned actions/setup-node@v7 to SHA 820762786026740c76f36085b0efc47a31fe5020 in action.yml. (2) Fixed script injection in ci.yml by moving ${{ needs.test-matrix.result }} into an env block as MATRIX_RESULT. (3) Fixed script injection in contributors.yml by moving ${{ github.repository }} and ${{ github.ref_name }} into an env block as GH_REPOSITORY and GH_REF_NAME. (4) Fixed github-env-injection in release.yml by sanitizing RELEASE_TAG with printf/tr before writing to $GITHUB_OUTPUT.

