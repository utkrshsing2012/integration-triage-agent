#!/bin/bash
# PreToolUse hook for the Bash tool, project-scoped. Blocks `gh pr merge` unless
# the PR carries an explained:N label with N >= 3. The explain-back is the
# learning gate: Utkarsh explains the PR in five lines, Claude grades it via
# /explain-back, and the label records the grade. Exit 2 blocks; exit 0 passes.
input=$(cat)
cmd=$(jq -r '.tool_input.command // empty' <<<"$input")
[ -z "$cmd" ] && exit 0
cwd=$(jq -r '.cwd // empty' <<<"$input")

grep -qE '(^|[;&|]\s*)gh\s+pr\s+merge\b' <<<"$cmd" || exit 0

block() {
  echo "BLOCKED by .claude/hooks/require-explain-back.sh: $1. Utkarsh writes the five-line explain-back as a PR comment, then runs /explain-back <pr> to get graded and labelled. Merge needs explained:3 or higher." >&2
  exit 2
}

pr=$(grep -oE 'gh\s+pr\s+merge\s+[0-9]+' <<<"$cmd" | grep -oE '[0-9]+$' || true)
if [ -z "$pr" ]; then
  pr=$(cd "${cwd:-.}" && gh pr view --json number --jq .number 2>/dev/null || true)
fi
[ -z "$pr" ] && block "could not determine which PR is being merged"

labels=$(cd "${cwd:-.}" && gh pr view "$pr" --json labels --jq '.labels[].name' 2>/dev/null || true)
grade=$(grep -oE '^explained:[0-9]$' <<<"$labels" | grep -oE '[0-9]$' | sort -n | tail -1 || true)
[ -z "$grade" ] && block "PR #$pr has no explained:N label"
[ "$grade" -lt 3 ] && block "PR #$pr is labelled explained:$grade, which is below 3"
exit 0
