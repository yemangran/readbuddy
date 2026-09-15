# Issue tracker: GitHub

这个 repo 的 issues 和 specs 存放在 GitHub issues 中。所有操作都使用 `gh` CLI。

## Conventions

- 创建 issue：`gh issue create --title "..." --body "..."`
- 读取 issue：`gh issue view <number> --comments`
- 列出 issue：`gh issue list --state open`
- 评论、标签和关闭操作使用对应的 `gh issue` 命令。

## Pull requests as a triage surface

PRs as a request surface: no.

## When a skill says "publish to the issue tracker"

创建一个 GitHub issue。

## When a skill says "fetch the relevant ticket"

运行 `gh issue view <number> --comments`。
