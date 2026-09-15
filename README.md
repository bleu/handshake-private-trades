# Private Trade Links

Create, sign, and share private token trades.

> **Warning:** The contracts have not been audited. Use at your own risk.

## Deployments

Deployed on **Gnosis** (chain ID 100). Deployments on other chains are coming soon.

| Network | Settlement contract                                                                                                    |
| ------- | ---------------------------------------------------------------------------------------------------------------------- |
| Gnosis  | [0xd0f033cc7c7481548368fdc71167119ea6487bbf](https://gnosisscan.io/address/0xd0f033cc7c7481548368fdc71167119ea6487bbf) |

## Installation

Use Node 24.11.0, pnpm 10.5.2, and Foundry
`nightly-5e88010a83d1b87b8f4d13058e42a2949d3e9dc0`.
Solidity 0.8.30 and compiler settings are pinned in `foundry.toml`.

```sh
git submodule update --init --recursive
pnpm install --frozen-lockfile
cp web/.env.example web/.env.local
pnpm run dev
```

The frontend runs at `http://localhost:3000`. Configure browser services in
`web/.env.local`; `NEXT_PUBLIC_` values are public and must not contain private keys.

## Commands

| Command                    | Purpose                                                          |
| -------------------------- | ---------------------------------------------------------------- |
| `pnpm run dev`             | Start the frontend                                               |
| `pnpm run build`           | Build for production                                             |
| `pnpm run typecheck`       | Check TypeScript types                                           |
| `pnpm run build:contracts` | Compile contracts                                                |
| `pnpm run test:unit`       | Run order and storage tests                                      |
| `pnpm run test:contracts`  | Run Solidity tests                                               |
| `pnpm run test:e2e`        | Run browser tests with automatically managed Anvil               |
| `pnpm run check`           | Run formatting, lint, types, tests, ABI checks, and build checks |

Before running browser tests, install Chromium with `pnpm exec playwright install chromium`.
Quality checks also require the NatSpec checker:
`cargo install lintspec --version 0.12.2 --locked --root .tools`.

## CoW token selection

We consume tokens from [CoW Swap's token list](https://files.cow.fi/tokens/CowSwap.json).

## Documentation

- [Domain and terminology](CONTEXT.md)
- [Architecture decisions](docs/adr)
- [Automated verification](docs/verification.md)
- [Release runbook](docs/release.md)
