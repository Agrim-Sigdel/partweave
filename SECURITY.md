# Security Policy

## Supported versions

partweave is a CLI distributed on npm. Security fixes are made against the **latest published
version** only. Always run the current release (`npx partweave@latest …`).

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report vulnerabilities privately via one of:

- GitHub's **[Report a vulnerability](https://github.com/Agrim-Sigdel/partweave/security/advisories/new)**
  (Security → Advisories) — preferred, keeps the report confidential; or
- email **sigdelagrim35@gmail.com** with the subject `partweave security`.

Please include:

- the partweave version (`partweave --version`) and how you invoked it,
- a description of the issue and its impact,
- steps to reproduce (or a minimal generated project that demonstrates it).

You can expect an acknowledgement within a few days. Once a fix is available, we'll publish a
release and, where appropriate, a GitHub Security Advisory crediting you (unless you prefer to
remain anonymous).

## Scope

**In scope** — issues in the generator itself:

- The CLI executing untrusted input unsafely, path traversal when writing files, or command
  injection during scaffolding.
- A supply-chain issue in partweave's own published dependencies.

**Out of scope — important:** the code partweave **generates** is a **starting point**, not a
hardened, production-ready application. It ships with sensible defaults (e.g. an env-driven
secret key, JWT auth, CORS locked down when `DEBUG` is off), but **you are responsible for
reviewing and hardening generated projects before deploying them.** In particular:

- Rotate/replace the generated `DJANGO_SECRET_KEY` and never commit real secrets.
- Review authentication, CORS, allowed hosts, and token storage for your threat model
  (the web starter stores tokens in `localStorage` by default — swap for httpOnly cookies in
  production).
- Keep the generated project's own dependencies patched.

A weakness in a project you generated and then deployed is not a vulnerability in partweave.
If you believe a **default** we ship is insecure, though, that *is* in scope — please report it.

## Verifying releases

npm packages are published with **provenance** via GitHub Actions OIDC trusted publishing, so
you can verify on npm that a given version was built from this repository's
[`publish.yml`](.github/workflows/publish.yml) workflow.
