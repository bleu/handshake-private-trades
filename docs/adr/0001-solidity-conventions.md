---
status: accepted
---

# Follow Wonderland Solidity conventions

The settlement contract must be consistent to implement, inspect, and review. Adopt Wonderland's Solidity coding style and NatSpec conventions, with the project's exact signed-order schema and approved public-seam testing policy taking precedence over conflicting examples.

## Organization and style

- Separate `IPrivateTradeSettlement` from `PrivateTradeSettlement`. Put shared structs, enums, events, and errors in the interface; keep implementation helpers internal unless a focused library earns its place.
- Use named imports and remappings. Order imports as external libraries, internal libraries, local interfaces, then local contracts.
- Use Wonderland naming: interfaces prefixed with `I`; uppercase snake case for constants/immutables; camel case for public state; leading underscores for private/internal state, local variables, parameters, and named returns.
- Preserve the agreed `Order` member names, types, ordering, and EIP-712 domain/type definitions. Style changes must not alter signed identities. Existing event definitions likewise remain authoritative.
- Use contract-prefixed custom errors and past-tense events. Document state transitions through the agreed lifecycle events.
- Document constructors, state, functions, types, errors, events, and modifiers with meaningful NatSpec. Keep parameter/return annotations aligned with declarations and use `@inheritdoc` where documentation is inherited.

## Enforcement and testing

Use `forge fmt` for Solidity formatting, `solhint-community` with the handbook's recommended baseline and documented project rules, and `lintspec` for NatSpec checks. Lock compatible tool versions during setup; formatting and linting are separate checks.

Test through the approved public interfaces using the agreed TDD loop. Wonderland's examples of direct internal-function testing do not override that choice. Branch-oriented test planning may identify behavioral cases; implement one failing test and its behavior at a time. Coverage helps locate missing cases rather than replacing behavioral assertions.

## References

- [Wonderland development overview](https://handbook.wonderland.xyz/docs/development/overview/)
- [Wonderland Solidity coding style](https://handbook.wonderland.xyz/docs/development/solidity/coding-style/)
- [Wonderland NatSpec](https://handbook.wonderland.xyz/docs/development/solidity/natspec)
- [Wonderland testing guidance](https://handbook.wonderland.xyz/docs/testing/unit-integration)
- [Quality and review gates](0003-quality-and-review-gates.md)
