<!-- Thanks for contributing to partweave! Keep PRs to one logical change. -->

## What & why

<!-- What does this change and why? Link any related issue: "Closes #123". -->

## Type of change

- [ ] Bug fix
- [ ] New component (`modules/`) or app
- [ ] CLI capability
- [ ] Docs
- [ ] Refactor / chore

## How I verified it

<!-- The command(s) you ran and the observed result. For generator changes, show that a
     freshly scaffolded project is green. -->

```sh
# e.g.
pnpm --filter partweave typecheck && pnpm --filter partweave test
node packages/cli/dist/index.js create app --dir /tmp/app --server --web --mobile --with auth,example --yes
cd /tmp/app && pnpm install && pnpm -r typecheck && pnpm -r test
```

## Checklist

- [ ] `pnpm --filter partweave typecheck` passes
- [ ] `pnpm --filter partweave test` passes
- [ ] A generated project including my change installs and typechecks/tests cleanly
- [ ] I updated docs / `CHANGELOG.md` where relevant
- [ ] I read [CONTRIBUTING.md](../CONTRIBUTING.md)
