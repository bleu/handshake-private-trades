# Issue tracker: Local Markdown

Issues and specs live under `.scratch/`, which is gitignored for now.

## Conventions

- One feature per directory: `.scratch/<feature>/`.
- Specs: `.scratch/<feature>/spec.md`.
- Tickets: `.scratch/<feature>/issues/NN-<slug>.md`, numbered from `01`, one file per ticket.
- Publish by writing these files; fetch by reading the requested file.
- Record triage roles in `Labels:` using `docs/agents/triage-labels.md`. Keep workflow state in `Status:` separately.
- Append discussion under `## Comments`.

## Wayfinding operations

- Map: `.scratch/<effort>/map.md`, labelled `wayfinder:map`.
- Child decisions: `.scratch/<effort>/issues/NN-<slug>.md`, each with a title, parent link, `Type:`, `Labels: wayfinder:<type>`, `Assignee:`, and `Status:`.
- Types: research, prototype, grilling, or task.
- Status: open (unclaimed), claimed (in progress), or resolved (closed). New tickets use `Assignee: unassigned`.
- Blocking: `Blocked by: NN, NN`, or `none`. A ticket is unblocked when every listed blocker is resolved. Create children before wiring dependencies.
- Frontier: open, unassigned, unblocked children, ordered by filename number.
- Claim before work: save `Status: claimed` and assign the developer driving the map.
- Resolve: append the resolution under `## Answer`, set `Status: resolved`, and append a linked gist to the map's Decisions so far.
- Use linked ticket titles in human-facing references; numbers are relationship keys.
- Keep precise questions in tickets and unformulated follow-on areas in the map's Not yet specified section.
