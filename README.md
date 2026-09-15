# Private Trade Links

Standalone private trade links. Product language and accepted architecture live in
[CONTEXT.md](CONTEXT.md) and [docs/adr](docs/adr).

## Toolchain and installation

Clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive`
after cloning. forge-std is pinned by its submodule commit and `foundry.lock`.

Use Node 24.11.0 and pnpm 10.5.2 (`corepack enable` if pnpm is not available).
The root `packageManager` field pins pnpm, and `pnpm-workspace.yaml` includes the
frontend. Install both packages with `pnpm install --frozen-lockfile`.
Use pnpm for this repository; `pnpm-lock.yaml` replaces the npm lockfile.
The install configuration keeps dependency files separate from the shared store
for the wallet-cache patch and preserves the required predev/prebuild/prestart
checks. Only the listed native build dependencies may run installation scripts.
Foundry is pinned to commit `5e88010a83d1b87b8f4d13058e42a2949d3e9dc0`
(`foundryup --install nightly-5e88010a83d1b87b8f4d13058e42a2949d3e9dc0`). Solidity is
pinned to 0.8.30 in `foundry.toml`, targeting Cancun. Install the NatSpec checker
locally with `cargo install lintspec --version 0.12.2 --locked --root .tools`.

Copy `web/.env.example` to `web/.env.local` when configuring browser services.
All `NEXT_PUBLIC_` values are public; never store a deployment key there.
The root `.env.example` describes local command-line configuration.

## Commands

- `pnpm run dev`: start the frontend on localhost:3000.
- `pnpm run build` and `pnpm run typecheck`: production compilation and strict types.
- `pnpm run build:contracts`: compile the Solidity workspace.
- `pnpm run format` / `pnpm run format:check`: Prettier and Forge formatting.
- `pnpm run lint:web`: Next.js, React Hooks, type-aware TypeScript and module rules.
- `pnpm run lint:contracts`: solhint-community recommended rules, zero warnings,
  and lintspec NatSpec checks.
- `pnpm run check`: all applicable setup quality gates, including both builds.

The Solidity workspace exposes the immutable order hash and status interface.
Settlement and maker-only individual cancellation are implemented.
`pnpm run test:contracts` runs public-interface Foundry tests, including independent
reference digests in `fixtures/order-hashes.json`; tests are included in `check`.
Generated ABI consistency is part of `pnpm run check`.

Vendor/generated output is excluded narrowly from formatting/linting. Frontend dependencies' declarations use
TypeScript's standard `skipLibCheck`; maintained source remains strictly checked.

Solhint enforces private/internal underscore names. Its alternative non-state
underscore rule conflicts with the ADR's public constants and private state
naming, so parameter/local underscore conventions remain part of ticket review.

## Manual testing on Gnosis

Copy `web/.env.example` to `web/.env.local`, confirm the Gnosis settlement address
matches the deployment you are testing, and run `pnpm run dev`. Use your browser
wallet on Gnosis (chain 100) with separate maker and taker accounts. Approvals,
settlement, and cancellation use real tokens and xDAI for gas.

Anvil is reserved for automated browser tests and is managed by Playwright.
Manual testing needs no local blockchain, fixture deployment, or test mnemonic.

## Wallet shell

The browser-only shell uses RainbowKit, wagmi, and TanStack Query. Routes `/`,
`/trade`, and `/history` support creation, received links, and maker history; shared providers stay mounted when
navigating. Gnosis is the manual testing and production network. Playwright enables Anvil
only in its test server; production builds reject it. Trading requires a
configured settlement and current prerequisite reads.

Set `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` to your 32-character project ID from
[Reown Dashboard](https://dashboard.reown.com/), and allow your application's origin.
Without it, injected browser wallets remain available and the UI explains that
WalletConnect is unavailable. No project credentials are fabricated. Mobile
WalletConnect compatibility requires the later real-wallet verification ticket.
See [RainbowKit installation](https://rainbowkit.com/docs/installation).

`NEXT_PUBLIC_GNOSIS_RPC_URL` overrides the public Gnosis RPC
[`https://rpc.gnosischain.com`](https://docs.gnosischain.com/tools/RPC%20Providers/).
Use a browser-compatible HTTPS endpoint. The automated test
wallet provider uses `http://127.0.0.1:8545` for Anvil. Signed links never supply RPC
URLs. RPC/WalletConnect public configuration contains no deployment keys.

Run `pnpm exec playwright install chromium` once, then `pnpm run test:e2e`.
Alternatively use installed Chrome with `PLAYWRIGHT_CHANNEL=chrome`.
Browser tests use a deterministic EIP-1193 wallet boundary and local server; they
do not claim real-extension or mobile compatibility verification.

## Settlement deployment and ABI

For Gnosis deployment, copy the root `.env.example` to `.env` and run
`chmod 600 .env`. Fill `DEPLOYER_PRIVATE_KEY` (including `0x`), `GNOSIS_RPC_URL`
(Gnosis chain 100), and `ETHERSCAN_API_KEY` (an Etherscan V2 API key).
The root `.env` is gitignored and loaded automatically by Foundry. Keep it out
of the browser environment and never paste its contents into logs or chat.
The deployer needs xDAI for transaction fees.

```sh
pnpm run deploy:simulate
pnpm run deploy:gnosis
```

Simulation sends no transactions. `deploy:gnosis` deploys one immutable
`PrivateTradeSettlement` with no constructor arguments and submits explorer
verification using the repository compiler settings. It rejects other chains.
The development tokens are local fixtures and are not deployed publicly.
Follow the [release runbook](docs/release.md) for artifact provenance and onchain
checks before configuring the frontend. Preserve the contract address and
transaction hash from Forge's output and ignored `broadcast/` receipts.

If deployment succeeds but verification fails, retry verification against the
existing address, without deploying again:

```sh
pnpm run verify:gnosis <DEPLOYED_ADDRESS> contracts/src/PrivateTradeSettlement.sol:PrivateTradeSettlement
```

Use the same source and compiler settings as the deployment. Foundry's
[deployment documentation](https://getfoundry.sh/forge/deploying/) describes
verification, and [Etherscan lists Gnosis](https://docs.etherscan.io/supported-chains)
as supported by its V2 API.

Run `pnpm run abi:export` after compiling contract changes. `pnpm run abi:check` recompiles and rejects a stale generated frontend ABI. Never hand-edit `web/src/generated/private-trade-settlement.ts`. Changes to deployed contract code require a new deployment identity; never change a published ID's chain/address/domain.

The frozen typed registry is `web/src/config/deployments.ts`. Public ID 1 is reserved for Gnosis (100); set `NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS` only from the approved deployment record. Missing configuration omits Gnosis trading in development; `pnpm run build` rejects missing/invalid public configuration and any enabled Anvil deployment. `pnpm run config:smoke` checks these startup boundaries. WalletConnect remains separately configurable as described above.

`pnpm run build:smoke` and the quality gate build use an explicitly synthetic Gnosis address solely to verify compilation before public deployment. **Do not publish that build output.** For a release, run the normal `pnpm run build` with the actual approved immutable deployment configuration and verify its onchain code/domain/hash first. Development-only network and deployment ID 2 are excluded from public builds.

## Shared order module

Import order operations through `web/src/domain/orders/index.ts`. This pure module owns validated signed fields, exact decimal/base-unit conversion, EIP-712 typed data and digest, strict low-s 65-byte maker-signature verification, signature-time duration conversion, and canonical binary link encoding/decoding. Callers supply the configured deployment registry and time; the module performs no wallet, RPC, HTTP, or storage operations. Valid expired orders remain decodable.

`pnpm run test:unit` exercises its public exports with literal hash fixtures also checked by Solidity, full-range bigint examples, malformed/noncanonical payloads, signature/domain tampering, and exact binary offsets. The automated test-chain setup also compares this module's digest with the live fixture contract. `encodeOrderLink` and `decodeOrderLink` both verify maker signatures and return promises; callers handle rejection without logging signed payloads.

## CoW token selection

The token explorer uses CoW's [official default list](https://github.com/cowprotocol/token-lists), fetched directly from `https://files.cow.fi/tokens/CowSwap.json` with SWR and keyed by source/network. Its current browser CORS response was verified. List names, symbols, and HTTPS logos provide discovery metadata; addresses remain visible. Failed lists show unknown membership or explicitly stale cached data. Missing metadata and failed logos fall back to addresses/placeholders.

Wagmi owns direct ERC-20 decimals, balances, and settlement allowances, scoped by chain, token, account and configured spender. Reads refresh every 15 seconds, on focus/mount, and with Refresh token data. List decimals are validated but discarded before reaching selection; unreadable or failed revalidated onchain decimals disable Use token. Balances/allowances are unavailable while disconnected, unreadable, or lacking a configured settlement. Custom imports and trade creation use the same onchain metadata and readiness checks.

Run `pnpm run test:e2e` (or `PLAYWRIGHT_CHANNEL=chrome pnpm run test:e2e`
for installed Chrome). Playwright starts a fresh Anvil on `127.0.0.1:8545`,
deploys DEV6/DEV18 and settlement, verifies fixture funding and contract
code/domain/hash parity, and stops the node when testing finishes. Port 8545
must be free; setup never reuses or resets another node. No manual setup is needed.
The deterministic fixture settlement keeps deployment ID 2 at
`0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0` on chain 31337.

The suite includes real local token reads and controlled HTTP/RPC/wallet failure
cases. Playwright uses `.next-e2e/` so its generated output does not lock an
ordinary development server. It supplies a synthetic Gnosis address for RPC
fixtures only; it never sends public transactions. CI runs the same command.
Tests use browser boundary fixtures rather than replacing SWR or wagmi internals.

Browser suites that submit transactions from the shared Anvil fixture accounts run in the single-worker `anvil` Playwright project to avoid nonce races between unrelated tests. Other browser suites remain parallel. Multi-browser journeys still use independent browser contexts within their scenario.

RainbowKit 2.2.11 directly reads optional wallet caches from browser storage. `pnpm install --frozen-lockfile` applies the narrowly scoped, source-hash-checked compatibility patch in `scripts/patch-wallet-cache.mjs` so blocked/quota-limited caches cannot break the wallet UI. It does not replace browser storage or change order/draft persistence: those failures still show recovery messages. `pnpm run wallet-cache:check` and startup/build gates verify the patch; after an install with scripts disabled, run `pnpm run wallet-cache:patch`. Review and remove/update this patch when upgrading RainbowKit or adopting an upstream fix.

Transaction feedback follows the original chain/account across route and wallet changes and retains original/replacement hashes. A wallet cancellation does not cancel an order. Submitted transactions are never automatically resubmitted. Receipt failures remain pending/rechecking; observed receipts are checked on focus and every 15 seconds during the session so a missing receipt removes false confirmation. Reloading clears this transient activity: reopen the retained trade link to read current onchain state. Maker history stores signed orders, not pending transaction receipts; there is no persisted taker activity.

The [automated acceptance matrix](docs/verification.md) maps requirements to public-seam tests and records the browser/viewport evidence and remaining manual-wallet checks.

The [release runbook](docs/release.md) documents clean-checkout verification,
`pnpm run release:bundle`, public configuration, artifact/source verification, and
the pending manual-wallet and release-approval checklist.
