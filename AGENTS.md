# Private Fork Development Guidelines

This repository is a privately maintained fork of Uptime Kuma. Code agents may
implement features, refactors, tests, documentation, and deployment support when
requested by the repository owner.

## Development Requirements

- Keep downstream changes focused so that upstream release tags remain easy to
  merge or rebase.
- Preserve backward compatibility unless the task explicitly requires a
  breaking change.
- Review the surrounding implementation before editing and avoid unrelated
  formatting or cleanup.
- Add or update tests for behavior changes and run the relevant lint, build, and
  test commands before handing work back.
- Do not build, publish, deploy, push, or open pull requests unless explicitly
  requested.
- Document downstream-only configuration, upgrade steps, manual actions, and
  verification procedures when they are required to operate the fork safely.

## Git Safety

- Preserve user changes already present in the worktree.
- Do not use destructive Git commands unless explicitly requested.
- Do not access or modify external GitHub repositories unless explicitly
  requested.
