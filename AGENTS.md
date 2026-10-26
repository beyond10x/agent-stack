# AGENTS.md

The beyond10x agent stack as data and as one scroll-driven page. `stack.yaml` holds the layers,
components, edges and call flows; a Rust generator turns it into the JSON the site reads. The site
is published at https://beyond10x.github.io/agent-stack/.

Running code is Rust with clap derive. The site is Vue 3 + TypeScript, built with Vite and pnpm.

## Serves

The objectives of the collection this repository moves, by id from `atlas/ROADMAP.md`:

- **O5 — the generic agent platform.** It shows which layer owns what, so a reader can place each
  component of the platform before using it.

A change here that moves none of these is a question for the operator, not a task.

A component's own `## Serves` lives in its repository's `AGENTS.md`, where Atlas `check-map`
reads it. This repository keeps no copy of another component's section.

## Layout

| Path | What it is | Who writes it |
|---|---|---|
| `stack.yaml` | Layers, nodes, edges and flows of the agent stack | authored |
| `crates/agent-stack/` | `agent-stack generate [--check]`: validates `stack.yaml`, writes the JSON | authored |
| `site/src/generated/agent-stack.json` | Data contract `b10x-agent-stack/v1` | `task generate` |
| `site/` | The page (Vue 3, Vite, pnpm) | authored |

## Commands

| Command | Does |
|---|---|
| `task check` | The gate: fmt, clippy, tests, JSON drift, site install, check and build |
| `task generate` | Rewrite the JSON after a change to `stack.yaml` |
| `task preview` | Build and serve the site on `127.0.0.1:4317` (`PORT=` to change) |

## Rules

- Change `stack.yaml`, then `task generate`. Never edit `site/src/generated/` by hand; `task check`
  fails on drift.
- No architecture text beyond what the organization's agent-stack decisions and glossary already
  say. A new node, edge or definition names its source in the commit message.
- `github` links are emitted only for nodes marked `public: true`; mark a repository public only
  after `gh api repos/beyond10x/<name> -q .visibility` answers `public`.
- The site makes no external network requests: no CDN fonts, scripts or analytics.
- Every commit and push is `b10x-bot[bot]` through `b10x-gates bot`.
- Nothing from a customer or employer outside beyond10x enters this repository.
- ESS opt-out: this repository is documentation tooling. It has no domain nouns and no runtime
  behaviour to specify.
