# Git Workflow

## Branch Strategy: GitHub Flow

- **`main` = 本番**（常にデプロイ可能）
- **`main` への直接コミット禁止** → 必ずブランチ → PR → Squash Merge
- **ブランチは短命**（1-2週間以内）

### Branch Naming

`<type>/<kebab-case-description>`

| type | 用途 | 例 |
|------|------|-----|
| feature/ | 機能追加 | `feature/export-csv` |
| fix/ | バグ修正 | `fix/login-timeout` |
| refactor/ | リファクタリング | `refactor/auth-service` |
| chore/ | 設定・依存関係 | `chore/update-deps` |

### Development Flow

```bash
# 1. Branch from main
git switch -c feature/xxx main

# 2. Work + commit (Conventional Commits)
git commit -m "feat: add export feature"

# 3. Push + create PR
git push -u origin feature/xxx

# 4. Pre-merge checks
pnpm check:type && pnpm check:lint

# 5. PR Review → Squash Merge → Delete branch
```

## Branch Granularity

- **1 theme = 1 branch** (PR should be explainable with a single topic)
- Related small fixes can be grouped (e.g., 3 login fixes → `fix/login-validation`)
- Never mix unrelated changes in one branch

## Syncing with Main (Rebase)

When main has new commits (hotfixes, other merged PRs), use rebase:

```bash
git switch main && git pull
git switch feature/xxx
git rebase main
# On conflict: fix files → git add → git rebase --continue
# If already pushed:
git push --force-with-lease
```

- **`--force-with-lease`**: Safe force push (fails if remote changed since last fetch)
- Rebase regularly to keep branch close to main

## Server Deployment Model

- **Production server**: Deploy `main` only (never edit directly)
- **Dev server**: Deploy `main` or feature branch for testing
- **Workstation**: Develop on branches → push → test on dev server → PR → merge to main

## Commit Message Format

```
<type>: <description>

<optional body>
```

Types: feat, fix, refactor, docs, test, chore, perf, ci

Note: Attribution disabled globally via ~/.claude/settings.json.

## Pull Request Workflow

When creating PRs:
1. Analyze full commit history (not just latest commit)
2. Use `git diff [base-branch]...HEAD` to see all changes
3. Draft comprehensive PR summary
4. Include test plan with TODOs
5. Push with `-u` flag if new branch
6. **Squash Merge** to keep main history clean

## Release Tags (Semantic Versioning)

`v<major>.<minor>.<patch>`

| Version | When | Example |
|---------|------|---------|
| **major** | Breaking changes (API incompatibility) | `v2.0.0` |
| **minor** | New features | `v1.1.0` |
| **patch** | Bug fixes, small improvements | `v1.1.1` |

- Not required on every merge. Tag at release milestones
- Baseline: `v1.0.0` = `c0e3660a` (production demo complete)

```bash
git tag -a v1.1.0 -m "Feature description"
git push origin v1.1.0
```

## Feature Implementation Workflow

1. **Plan First**
   - Use **planner** agent to create implementation plan
   - Identify dependencies and risks
   - Break down into phases

2. **TDD Approach**
   - Use **tdd-guide** agent
   - Write tests first (RED)
   - Implement to pass tests (GREEN)
   - Refactor (IMPROVE)
   - Verify 80%+ coverage

3. **Code Review**
   - Use **code-reviewer** agent immediately after writing code
   - Address CRITICAL and HIGH issues
   - Fix MEDIUM issues when possible

4. **Commit & Push**
   - Detailed commit messages
   - Follow conventional commits format
