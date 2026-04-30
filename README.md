<p align="center">
  <a href="https://kanwas.ai/" target="_blank">
    <img src="./docs/images/logo.png" alt="Kanwas" height="80" />
  </a>
</p>
<p align="center">
  Shared context board for teams and agents
</p>
<p align="center">
  Try Kanwas for free at <a href="https://kanwas.ai/">kanwas.ai</a>
</p>

# What's Kanwas?

Kanwas is a multiplayer workspace for AI work. Teams and an AI agent share the same documents, evidence, and decisions, with the agent's tool calls streaming into the same timeline everyone sees.

![Kanwas canvas](./docs/images/hero.webp)

## Who it's for

- **Founders.** Turn a fundraising deck, customer interviews, MVP spec, and hiring plan into one canvas where the agent helps across all of them. Less context to keep in your head, more output across many fronts.
- **Product managers.** Drop interview snippets, tickets, and competitor screenshots on a board; get a discovery readout and a PRD with every claim traceable to its source.
- **Developers.** Pull a PM's spec, designs, and research onto a canvas; work with the agent to turn it into an implementation plan with tasks and acceptance criteria. Then `kanwas pull` the markdown into your repo and hand it to Claude Code, Codex, or whatever coding agent you use.
- **Marketers.** Plan a launch with positioning, messaging, asset list, and timeline. The agent drafts copy variants you can compare side-by-side and iterate on with the team.
- **Sales.** A reusable account board: research, comms history, stakeholder map, and proposal drafts. Each deal makes the template better.

## Why teams use it

- **Shared context that compounds.** Every decision and outcome makes the next board better than the last.
- **Canvas + agent on one surface.** Work alongside AI over the same evidence, ideas, and trade-offs — transparent to everyone.
- **Sharp deliverables in minutes.** Generate structured, execution-ready artifacts for every stage of the work.
- **Your files, your repo.** Git-backed markdown filesystem with full version history. No vendor lock-in.

## Quickstart

### Prerequisites

- Docker + Docker Compose
- An Anthropic API key (and/or OpenAI API key)

### Run it

```bash
git clone https://github.com/kanwas-ai/kanwas.git
cd kanwas

# Env files — fill in API keys, APP_KEY, etc.
cp .env.example .env
cp backend/.env.example backend/.env
cp yjs-server/.env.example yjs-server/.env
cp frontend/.env.example frontend/.env

docker-compose --profile app up
```

Open http://localhost:5173 and you're in.

For local development (hot reload, running services with `pnpm dev`) and the architectural walkthrough, see [`docs/SYSTEM_OVERVIEW.md`](./docs/SYSTEM_OVERVIEW.md).

## Community

Questions, ideas, want to chat with the team?

- 💬 [Kanwas Kollective on Slack](https://join.slack.com/t/kanwaskollective/shared_invite/zt-3vsln4mro-omqBG1gi1Kmc9fgzTHL7oQ)

## Contributing

We'd love help. A few notes:

- Read [`docs/SYSTEM_OVERVIEW.md`](./docs/SYSTEM_OVERVIEW.md) for the mental model and project-specific gotchas (especially around Yjs/BlockNote — clone semantics and transactions matter).
- Open an issue before large changes so we can align on direction.
- Run `pnpm format` and the relevant package's lint before opening a PR.
- First-time contributors will be asked to sign our [Contributor License Agreement](./.github/CLA.md). The CLA bot will comment on your PR with a link and the signing phrase — you only need to sign once.

## License

Kanwas is licensed under the [Apache License 2.0](./LICENSE).

## Acknowledgements

Kanwas stands on the shoulders of [Yjs](https://github.com/yjs/yjs), [BlockNote](https://www.blocknotejs.org/), [AdonisJS](https://adonisjs.com/), [E2B](https://e2b.dev/), and many other great open-source projects.
