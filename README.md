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

## Local blockchain

Run `npm run local:start` in a dedicated terminal, then `npm run local:fixtures`
and `npm run local:smoke`. The node binds loopback, chain 31337, with 10 accounts
and 10,000 development ETH each. The development-only mnemonic is
`test test test test test test test test test test test junk`. Never send real
assets to these publicly known accounts. Maker is
`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`; taker is
`0x70997970C51812dc3A010C7d01b50e0d17dc79C8`. Accounts are unlocked locally;
fixture deployment needs no private key configuration.

The fixtures mint 1,000,000 DEV6 (6 decimals) and DEV18 (18 decimals) to each
account. Addresses are written to ignored `.scratch/local-chain.json`.
`npm run local:reset` clears chain state; run fixtures and smoke again afterward.
Restarting the node also creates fresh state. `ANVIL_RPC_URL` may select a local
port (default 8545 when omitted), including IPv6 loopback; `localhost` resolves
to IPv4 loopback consistently. Mutation commands reject non-loopback URLs, non-31337 chains, and non-Anvil
clients. No public settlement address is configured by these commands.

Solhint constructor visibility is omitted because Solidity 0.8.30 deprecates explicit
constructor visibility; ordinary function visibility remains enforced.
