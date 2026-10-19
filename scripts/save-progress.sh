#!/usr/bin/env bash
# For disposable Actions checkouts only. Preserve raw progress across code changes.
set -euo pipefail
if [[ "${GITHUB_ACTIONS:-}" != "true" && "${POKERADAR_PROGRESS_TEST:-}" != "1" ]]; then
  echo 'Use this helper only in disposable Actions/test checkouts.' >&2
  exit 1
fi
cd "$(git rev-parse --show-toplevel)"
checkpoint=''
progress_ref="pokeradar-progress-${GITHUB_RUN_ID:-manual}"
patch_dir=$(mktemp -d)
backup_on_failure() {
  result=$?
  if [[ "$result" != 0 && -n "$checkpoint" ]]; then
    if git push origin "$checkpoint:refs/heads/$progress_ref"; then
      echo "::error::Progress could not be merged safely; checkpoint retained on $progress_ref. Main was not overwritten."
    else
      echo "::error::Could not push checkpoint branch; use the uploaded raw-progress artifact. Main was not overwritten."
    fi
  fi
  rm -rf "$patch_dir"
}
trap backup_on_failure EXIT
base=$(git rev-parse HEAD)
git add data site
if git diff --cached --quiet; then exit 0; fi
git commit --quiet -m 'Checkpoint card and price update'
checkpoint=$(git rev-parse HEAD)
if [[ -n "${RUNNER_TEMP:-}" && "${POKERADAR_PROGRESS_TEST:-}" != "1" ]]; then
  git archive --format=tar.gz -o "$RUNNER_TEMP/pokeradar-checkpoint.tgz" "$checkpoint" data site/catalog.json site/prices.json
fi
# Derived summaries can be rebuilt. Apply only provider progress to latest main;
# conflicting manual raw-data edits require review rather than a silent override.
git diff --binary "$base" "$checkpoint" -- data site/catalog.json site/prices.json > "$patch_dir/raw.patch"
for attempt in 1 2 3; do
  git fetch origin main:refs/remotes/origin/main
  git reset --hard origin/main
  if [[ -s "$patch_dir/raw.patch" ]]; then
    git apply --3way --index "$patch_dir/raw.patch"
  fi
  node scripts/backtest.mjs
  node scripts/build.mjs
  node scripts/verify-site.mjs
  git add data site
  if git diff --cached --quiet; then exit 0; fi
  git commit --quiet -m 'Update card catalog and market snapshots'
  if git push origin HEAD:main; then exit 0; fi
  echo "Main advanced during build; retrying safe progress merge ($attempt/3)."
done
exit 1
