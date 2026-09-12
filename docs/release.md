# Release candidate runbook

This is preparation for Yves's review, not release approval. No public contract or
site has been deployed. Complete the manual checklist and record Yves's approval
before the separate deployment task. Never publish the synthetic-address build
produced by `npm run check` / `npm run build:smoke`.

## Reproduce from a clean checkout

Use the reviewed commit, Node 24.11.0, npm 11.6.1, and the Foundry commit in
[README](../README.md). The compiler is Solidity 0.8.30, Cancun, optimizer 200;
forge-std is pinned by the submodule and OpenZeppelin 5.4.0 by `package-lock.json`.
The CI workflow records the same installation and verification sequence.

```sh
git clone --recurse-submodules <repository-url> private-trade-links-rc
cd private-trade-links-rc
git checkout <reviewed-commit>
git submodule update --init --recursive
npm ci
cargo install lintspec --version 0.12.2 --locked --root .tools
npm run check
npx playwright install chromium
```

For browser verification, start a **dedicated disposable** Anvil with
`npm run local:start` in another terminal. Ensure port 8545 is available first;
do not reset someone else's node. In the checkout, run:

```sh
npm run local:deploy
npm run local:smoke
npm run local:settlement-smoke
npm run test:e2e
npm run build:smoke
npm run release:bundle
git status --short
```

Installed Chrome is also supported with `PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`.
The final `build:smoke` restores Next.js generated route types after the E2E
development server, so `web/next-env.d.ts` matches the production checkout before
bundling. Its output still must not be published.
Record the actual browser/OS and commands. All checks must pass; inspect the
[acceptance matrix](verification.md) for their scope. A smoke build verifies
compilation before a deployment exists; it is not a configured public release.

## Contract review bundle

`npm run release:bundle` forces a fresh build with compiler inputs, checks the
frontend ABI, and writes a uniquely named ignored `.scratch/release-candidates/`
directory. Preserve this directory with the review evidence. It includes:

- `manifest.json`: source revision and dirty flag, tool/compiler/settings and
  dependency-lock provenance, SHA-256 checksums, intended deployment ID 1 / chain
  100, and explicitly empty deployment/verification records.
- `artifact.json`, `abi.json`, `creation-bytecode.hex`, `runtime-template.hex`,
  `metadata.json`: actual compiled settlement artifacts, no constructor arguments.
- `standard-input.json`: embedded source contents and exact compiler settings,
  usable as Solidity standard JSON input for independent compilation and source
  verification. No dependency downloads or private keys are needed to compile it.

A dirty bundle is for preparation only. Generate the final bundle from the clean
reviewed checkout and retain that commit; documentation/evidence committed later
must identify the exact tested code revision. Recompile `standard-input.json`
with `solc 0.8.30+commit.73712a01 --standard-json` and compare its settlement ABI
and creation bytecode with the bundle. Runtime contains constructor-populated
EIP-712 immutable slots: it is a template, not a byte-for-byte deployed runtime.
Use the artifact's immutable references for runtime comparison, then separately
check domain values and `hashOrder`. The local settlement smoke demonstrates these
checks against Anvil; it intentionally refuses public endpoints.

## Public configuration inventory

| Input                  | Candidate value / state                                              | Required release check                                                                                                                                        |
| ---------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gnosis RPC             | `https://rpc.gnosischain.com`, override `NEXT_PUBLIC_GNOSIS_RPC_URL` | Browser JSON POST/CORS from the final origin; `eth_chainId` = `0x64`, current block and required contract reads work.                                         |
| CoW discovery list     | `https://files.cow.fi/tokens/CowSwap.json`                           | Browser GET/CORS; valid list, chain 100 filtering; app reads decimals onchain.                                                                                |
| WalletConnect          | `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` not provided                  | Real 32-hex project ID from Reown dashboard; allow final origin; test actual relay/session/signing. Injected wallets remain available without it.             |
| Public settlement      | `NEXT_PUBLIC_GNOSIS_SETTLEMENT_ADDRESS` not assigned                 | Approved immutable deployment record, ID 1 / chain 100; never repoint a published identity.                                                                   |
| Development chain      | `NEXT_PUBLIC_ENABLE_ANVIL=false` in production                       | Build rejects enabled Anvil; ID 2 must not be available publicly.                                                                                             |
| Hosting origin         | Not selected                                                         | HTTPS, origin allowed by WalletConnect, fragment handling and clipboard verified.                                                                             |
| Explorer               | `https://gnosisscan.io`                                              | Transaction links use original chain and correct hash; verified source matches approved build.                                                                |
| Deployer / key custody | Actual operator/address not yet assigned                             | Yves names the operator/address and records hardware-wallet or encrypted-keystore custody before deployment; no deployment privilege remains in the contract. |

Copy `web/.env.example` to `web/.env.local` for local configuration; deployment
build environments must provide the equivalent values. All `NEXT_PUBLIC_` values
are browser-visible. Never place a private key, seed phrase, or secret RPC credential
there. Keep real environment files and wallet credentials out of review artifacts.
The CoW source is fixed in `web/src/infrastructure/http/cow-list.ts`; signed links
cannot select endpoints. No server relay is required.

To repeat browser service checks, open the application from the intended origin,
inspect Network, and refresh token data. Confirm the RPC POST returns chain 100
and the CoW GET returns a list containing Gnosis tokens, without a CORS error.
A terminal `curl` alone does not prove browser compatibility. Record timestamp,
origin, browser version, endpoint selection (redact private URL parameters), list
version and pass/fail. Do not capture signed links, signatures or calldata in logs.
The loopback-origin probe is preliminary; rerun from the final hosting origin.
A syntactically valid project ID is not proof of working WalletConnect.

## Manual compatibility checklist — pending

Record application commit, OS, browser and wallet versions, date, connection path,
accounts used (EOAs), and pass/fail/defect evidence for every row. Use the approved
release candidate with separate maker/taker contexts. An automated injected-wallet
fixture is not evidence of real extension or mobile-wallet compatibility.

| Check                                                                                      | Browser extension EOA | Mobile EOA via WalletConnect |
| ------------------------------------------------------------------------------------------ | --------------------- | ---------------------------- |
| Connect, disconnect, account/network switch; wrong-chain guidance                          | Pending               | Pending                      |
| Maker: select/import tokens, review, exact/maximum approval, typed-data signing, copy link | Pending               | Pending                      |
| Independent taker: open link, review exact amounts/restriction/expiry, approve and accept  | Pending               | Pending                      |
| Maker: open own link and cancel; clear onchain-confirmation warning                        | Pending               | Pending                      |
| Wallet rejection, pending/reverted receipt feedback, correct account/chain/hash            | Pending               | Pending                      |
| Desktop/mobile readable full amounts/addresses, warnings and action availability           | Pending               | Pending                      |
| Copy link and open in a separate browser; Unlimited and finite expiration                  | Pending               | Pending                      |
| Draft/import/history after refresh and new session; cleared/unavailable storage recovery   | Pending               | Pending                      |

Exercise each connection path as maker and taker. Retain observed failures and
recheck fixes; required behavioral failures block readiness. Record cosmetic
issues for Yves only if they do not impair reading or acting. No cross-device
history, encryption, universal wallet support or audit is claimed.

## Deployment and enablement — only after separate approval

1. Yves reviews the candidate, automated/manual results and dependency advisory
   evidence, assigns the actual deployer/custody, and records release approval.
2. On Gnosis 100, deploy the reviewed `PrivateTradeSettlement` creation artifact
   with no constructor arguments using the approved wallet. Do not use the
   public Anvil mnemonic, local mutation scripts, a proxy or a different compiler.
   Record source commit, bundle checksums, compiler/settings/dependency locks,
   chain, deployer address, contract address and deployment transaction hash.
3. Submit the bundle's standard JSON input and exact compiler version to the
   explorer's contract source verification flow. Record the verified-source URL
   and verify the explorer's compiled creation code against the approved artifact.
4. Independently check RPC chain, deployed runtime outside documented immutable
   slots, `eip712Domain()` (name `Private Trade Links`, version `1`, chain `100`,
   verifying contract = deployed address), readable `orderStatus`, and one
   representative `hashOrder` against the frontend order module. The production
   contract is immutable, with no owner/pause/upgrade powers.
5. Bind the approved address to reserved deployment ID 1 and configure the real
   hosting origin/RPC/WalletConnect values. Run `npm run abi:check`, typecheck, and
   **normal** `npm run build` with that address and Anvil disabled. Verify the
   built client registry/domain/ABI agree with the deployment before enabling
   trading. Retain the deployment record alongside the bundle.
6. Complete final-origin browser and wallet checks and publish only the approved
   build. No production-funded smoke trade or extra testnet is required by the
   agreed policy. If configuration/code/domain checks fail, do not enable trading.

These steps document the later HITL work; running `release:bundle` performs none
of them. A new contract implementation needs a new deployment identity, preserving
all already published link IDs.

## Dependency advisory evidence

The preparation audit on 2026-09-12 (`npm audit --json`, committed lockfile)
reported 26 vulnerable dependency entries: 24 moderate and 2 high, no critical.
The high entries are transitive `axios` and nested `ws` under wallet dependencies.
The audit suggests an axios update and a major wagmi change for the nested ws
path; neither is applied as an unverified release-preparation upgrade. The
project's required quality gates do not establish absence of vulnerabilities.
Review applicability and any dependency remediation before release approval;
retain a fresh audit report and rerun wallet/quality checks after any lock change.
