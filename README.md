# Private Trade Links

Standalone private trade links. Product language and accepted architecture live in
[CONTEXT.md](CONTEXT.md) and [docs/adr](docs/adr).

## Toolchain and installation

Use Node 24.11.0 and npm 11.6.1. Install the committed lockfile with `npm ci`.
Foundry is pinned to commit `5e88010a83d1b87b8f4d13058e42a2949d3e9dc0`
(`foundryup --install 5e88010a83d1b87b8f4d13058e42a2949d3e9dc0`). Solidity is
pinned to 0.8.30 in `foundry.toml`, targeting Cancun. Install the NatSpec checker
locally with `cargo install lintspec --version 0.12.2 --locked --root .tools`.

Copy `web/.env.example` to `web/.env.local` when configuring browser services.
All `NEXT_PUBLIC_` values are public; never store a deployment key there.
The root `.env.example` describes local command-line configuration.

## Commands

- `npm run dev`: start the frontend on localhost:3000.
- `npm run build` and `npm run typecheck`: production compilation and strict types.
- `npm run build:contracts`: compile the Solidity workspace.
- `npm run format` / `npm run format:check`: Prettier and Forge formatting.
- `npm run lint:web`: Next.js, React Hooks, type-aware TypeScript and module rules.
- `npm run lint:contracts`: solhint-community recommended rules, zero warnings,
  and lintspec NatSpec checks.
- `npm run check`: all applicable setup quality gates, including both builds.

The initial Solidity contract is only a compiler smoke target. No settlement or
public deployment is available. Tests and ABI consistency join the gates as
those behaviors become available in subsequent tickets.

Vendor/generated output is excluded narrowly from formatting/linting. Frontend dependencies' declarations use
TypeScript's standard `skipLibCheck`; maintained source remains strictly checked.

Solhint enforces private/internal underscore names. Its alternative non-state
underscore rule conflicts with the ADR's public constants and private state
naming, so parameter/local underscore conventions remain part of ticket review.
