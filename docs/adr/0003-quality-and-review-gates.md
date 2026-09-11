---
status: accepted
---

# Make code quality part of ticket completion

A passing behavior test alone does not establish that a change meets the project's maintainability conventions. Each implementation ticket must satisfy automated quality checks and a defect-first review against the specification and accepted ADRs before it is resolved.

## Automated checks

- Enable TypeScript `strict`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`.
- Configure ESLint with Next.js, React Hooks, type-aware TypeScript rules, and import restrictions enforcing the frontend module rules. Enforce intentional handling of promises, unknown input, and unsafe type operations.
- Use Prettier for frontend formatting and the Solidity tooling specified in [Solidity conventions](0001-solidity-conventions.md).
- Require zero lint warnings in maintained code. Give generated and vendor files explicit, narrow exclusions. Any targeted suppression needs a local explanation; blanket suppression or disabling checks to hide failures is unacceptable.
- Configure these checks during repository setup and expose reproducible commands. CI checks formatting, linting, type-checking, required tests, generated ABI consistency, and the production frontend build as the relevant code becomes available.
- Run applicable checks for each ticket; run the full required suite for the integrated release candidate. Setup-only tickets use meaningful build/smoke checks rather than artificial implementation-coupled tests.

Type-aware linting provides checks beyond syntax linting; its configuration should use the project's actual TypeScript setup. See [typescript-eslint typed linting](https://typescript-eslint.io/getting-started/typed-linting/).

## Implementation and review loop

1. Implement behavior with the agreed `$tdd` skill at approved public seams: one observed failing test, then the minimal passing implementation. Expected results come from independent fixtures, worked examples, or the specification.
2. Run the applicable automated checks and inspect the change against [Frontend organization](0002-frontend-organization.md) and the Solidity conventions.
3. Delegate `$review-agent` a precise baseline, the complete ticket change including new files, authoritative requirements, these ADRs, and verification results. The reviewer remains read-only and does not delegate.
4. Review concrete correctness and maintainability problems, including duplicated order rules, dependency violations, incompatible interfaces, and responsibilities whose coupling causes meaningful maintenance risk. Automated formatting/lint checks enforce mechanical style; do not manufacture defect findings for cosmetic preferences.
5. Fix confirmed actionable findings. Use TDD for behavioral fixes; perform justified refactoring during this review stage. Rerun affected checks and obtain review of the revised change. Record evidence for findings shown to be incorrect and have them reassessed.
6. Resolve the ticket only when its acceptance criteria and required checks pass and no actionable review findings remain. Record commands/results and finding dispositions. A reviewer reporting “No findings” does not override failing checks.

The implementation agent owns fixes; the review agent owns independent inspection. Automated review does not replace Yves's separately agreed review and approval of the concrete release. These conventions add no independent human reviewer or formal audit requirement.
