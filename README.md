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
Settlement and maker-only individual cancellation are implemented.
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

## Settlement deployment and ABI

Start Anvil with `npm run local:start`, then run `npm run local:reset` and `npm run local:deploy`. This deploys the two fixtures first and settlement third from the documented maker, assigning development ID 2 to `0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` on chain 31337. Repeating `local:deploy` reuses and verifies this address. Unexpected nonce/code is rejected; reset the disposable local chain instead of remapping an ID. `npm run local:smoke` checks initial token funding; `npm run local:settlement-smoke` verifies compiled runtime (excluding constructor immutable slots), chain, address, EIP-712 domain, and TypeScript/onchain digest parity.

Run `npm run abi:export` after compiling contract changes. `npm run abi:check` recompiles and rejects a stale generated frontend ABI. Never hand-edit `web/src/generated/private-trade-settlement.ts`. Changes to deployed contract code require a new deployment identity; never change a published ID's chain/address/domain.

The frozen typed registry is `web/src/config/deployments.ts`. Public ID 1 is reserved for Gnosis (100); set `NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS` only from the approved deployment record. No public address has been assigned or deployed here. Missing configuration omits Gnosis trading in development; `npm run build` rejects missing/invalid public configuration and any enabled Anvil deployment. `npm run config:smoke` checks these startup boundaries. WalletConnect remains separately configurable as described above.

`npm run build:smoke` and the quality gate build use an explicitly synthetic Gnosis address solely to verify compilation before public deployment. **Do not publish that build output.** For a release, run the normal `npm run build` with the actual approved immutable deployment configuration and verify its onchain code/domain/hash first. Development-only network and deployment ID 2 are excluded from public builds.

## Shared order module

Import order operations through `web/src/domain/orders/index.ts`. This pure module owns validated signed fields, exact decimal/base-unit conversion, EIP-712 typed data and digest, strict low-s 65-byte maker-signature verification, signature-time duration conversion, and canonical binary link encoding/decoding. Callers supply the configured deployment registry and time; the module performs no wallet, RPC, HTTP, or storage operations. Valid expired orders remain decodable.

`npm run test:unit` exercises its public exports with literal hash fixtures also checked by Solidity, full-range bigint examples, malformed/noncanonical payloads, signature/domain tampering, and exact binary offsets. `local:settlement-smoke` also compares this module's digest with the live local contract. `encodeOrderLink` and `decodeOrderLink` both verify maker signatures and return promises; callers handle rejection without logging signed payloads.

## CoW token selection

The token explorer uses CoW's [official default list](https://github.com/cowprotocol/token-lists), fetched directly from `https://files.cow.fi/tokens/CowSwap.json` with SWR and keyed by source/network. Its current browser CORS response was verified. List names, symbols, and HTTPS logos provide discovery metadata; addresses remain visible. Failed lists show unknown membership or explicitly stale cached data. Missing metadata and failed logos fall back to addresses/placeholders.

Wagmi owns direct ERC-20 decimals, balances, and settlement allowances, scoped by chain, token, account and configured spender. Reads refresh every 15 seconds, on focus/mount, and with Refresh token data. List decimals are validated but discarded before reaching selection; unreadable or failed revalidated onchain decimals disable Use token. Balances/allowances are unavailable while disconnected, unreadable, or lacking a configured settlement. These are selection controls only; custom imports and trade creation are later tickets.

Before browser tests, start Anvil in a separate terminal, then `npm run local:reset && npm run local:deploy`. Run `npm run test:e2e` (or `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e` for installed Chrome). The suite includes real local token reads and controlled HTTP/RPC/wallet failure cases. Playwright uses `.next-e2e/` so its generated output does not lock an ordinary development server. It supplies a synthetic Gnosis address for RPC fixtures only; it never sends public transactions. CI starts/deploys Anvil before these tests. Tests use browser boundary fixtures rather than replacing SWR or wagmi internals.

Browser suites that submit transactions from the shared Anvil fixture accounts run in the single-worker `anvil` Playwright project to avoid nonce races between unrelated tests. Other browser suites remain parallel. Multi-browser journeys still use independent browser contexts within their scenario.
