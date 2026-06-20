#!/usr/bin/env bash
# Process guardrail (2026-06-20): every change goes on its own feature branch and
# merges via PR. Block `git commit` / `git push` while on main/master so nothing
# lands on main directly. PR merges (`gh pr merge`) are unaffected. A command that
# branches first (`git checkout -b` / `git switch -c`) is allowed.
input=$(cat)
cmd=$(printf '%s' "$input" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tool_input',{}).get('command',''))" 2>/dev/null)

# Only gate git commit / git push.
case "$cmd" in
  *"git commit"*|*"git push"*) ;;
  *) exit 0 ;;
esac

# A command that creates a branch first is fine (it leaves main before committing).
case "$cmd" in
  *"checkout -b"*|*"switch -c"*) exit 0 ;;
esac

branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ "$branch" = "main" ] || [ "$branch" = "master" ]; then
  echo "BLOCKED: direct commit/push to '$branch' is disabled — every change must go on its own feature branch and merge via PR. Run: git checkout -b <type>/<short-desc>  then commit, push, and open a PR (gh pr create). PR merges are still allowed." >&2
  exit 2
fi
exit 0
