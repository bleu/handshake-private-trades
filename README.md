# Private Trade Links

Standalone private trade links. Product language and accepted architecture live in
[CONTEXT.md](CONTEXT.md) and [docs/adr](docs/adr).

## Toolchain and installation

Clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive`
after cloning. forge-std is pinned by its submodule commit and `foundry.lock`.

Use Node 24.11.0 and npm 11.6.1. Install the committed lockfile with `npm ci`.
Foundry is pinned to commit `5e88010a83d1b87b8f4d13058e42a2949d3e9dc0`
(`foundryup --install nightly-5e88010a83d1b87b8f4d13058e42a2949d3e9dc0`). Solidity is
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

The Solidity workspace exposes the immutable order hash and status interface.
Settlement is implemented; cancellation remains disabled until its implementation ticket.
`npm run test:contracts` runs public-interface Foundry tests, including independent
reference digests in `fixtures/order-hashes.json`; tests are included in `check`.
No public deployment is available. ABI consistency joins the gates when exported.

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

## Wallet shell

The browser-only shell uses RainbowKit, wagmi, and TanStack Query. Routes `/`,
`/trade`, and `/history` are placeholders; shared providers stay mounted when
navigating. Only Gnosis is available in production. Set
`NEXT_PUBLIC_ENABLE_ANVIL=true` with `npm run dev` to also offer local chain 31337;
a production build rejects that setting. Wallet connection does not enable trading.

Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to your 32-character project ID from
[Reown Dashboard](https://dashboard.reown.com/), and allow your application's origin.
Without it, injected browser wallets remain available and the UI explains that
WalletConnect is unavailable. No project credentials are fabricated. Mobile
WalletConnect compatibility requires the later real-wallet verification ticket.
See [RainbowKit installation](https://rainbowkit.com/docs/installation).

`NEXT_PUBLIC_GNOSIS_RPC_URL` overrides the public Gnosis RPC
[`https://rpc.gnosischain.com`](https://docs.gnosischain.com/tools/RPC%20Providers/).
Use a browser-compatible HTTPS endpoint. The local
wallet provider uses `http://127.0.0.1:8545` for Anvil. Signed links never supply RPC
URLs. RPC/WalletConnect public configuration contains no deployment keys.

Run `npx playwright install chromium` once, then `npm run test:e2e -w web`.
Alternatively use installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`.
Browser tests use a deterministic EIP-1193 wallet boundary and local server; they
do not claim real-extension or mobile compatibility verification.
