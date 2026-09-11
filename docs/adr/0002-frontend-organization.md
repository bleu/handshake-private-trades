---
status: accepted
---

# Organize frontend features around a pure order module

Creation, acceptance, cancellation, and history share the same order rules. Use feature-oriented UI modules backed by a pure order module and explicit infrastructure adapters so those rules have one implementation and can be tested without rendering or network access.

## Organization

```text
web/src/
  app/                      # Routes, layouts, provider composition
  features/
    orders/                 # Create, review, accept, cancel, history
      components/
      hooks/
    tokens/                 # Selection and custom imports
    wallet/                 # Connection and network UI
  domain/
    orders/                 # Schemas, hashes, codec, amounts, durations,
                            # readiness and approval calculations
  infrastructure/
    chain/                  # Contract reads/writes and receipt handling
    storage/                # Drafts, imports and maker-history persistence
    http/                   # Token-list fetching
  components/
    ui/                     # shadcn primitives
  config/                   # Validated application/deployment configuration
  generated/                # Exported ABI
web/e2e/                    # Browser journeys
```

Create these directories as their responsibilities are implemented; empty scaffolding is unnecessary.

## Module rules

- Routes compose screens and providers. Trade calculations, persistence, and signing coordination live in the appropriate modules.
- `domain/orders` exposes a small public interface of pure operations. It does not import React or application infrastructure, perform wallet/network/storage calls, or read browser globals. Pure schema and cryptographic libraries are allowed; callers supply time and other external inputs.
- Feature hooks coordinate specific workflows. Keep render logic, order rules, and external effects separate instead of collecting the whole application into one hook.
- Infrastructure owns external interactions and may depend on domain types and validated configuration. Domain code cannot depend on infrastructure; shared UI primitives cannot depend on features. Keep the import graph acyclic.
- Consumers import through designated module exports. Keep internal files private to the module and enforce forbidden imports with lint rules; public exports need not re-export every file.
- Keep chain data in wagmi/TanStack Query, HTTP resources in SWR, and persisted browser records behind the storage adapter, as specified in the integration decision. Derive readiness instead of persisting it.
- Colocate module/component tests with the behavior they test; keep browser journeys in `web/e2e`. Tests use the approved public seams.
- Extract shared code around a named responsibility. Avoid miscellaneous utility files, speculative abstractions, and manual edits to generated ABI files.

## Apply SOLID through small interfaces and composition

| Principle | Project convention |
| --- | --- |
| Single responsibility | Separate order rules, workflow coordination, persistence, and rendering. |
| Open/closed | Introduce composable variation when a real requirement needs it. |
| Liskov substitution | Adapters and test doubles preserve their interface's observable behavior, including failures. |
| Interface segregation | Expose focused operations appropriate to callers. |
| Dependency inversion | Pass external effects into logic that needs them and keep domain calculations independent. |

SOLID does not require classes, inheritance hierarchies, an interface for every function, or a dependency-injection framework. Prefer the smallest module interface that hides useful complexity.

This is a project convention selected from the organization strategies supported by [Next.js](https://nextjs.org/docs/app/getting-started/project-structure), not a framework-mandated layout. Enforcement is defined in [Quality and review gates](0003-quality-and-review-gates.md).
