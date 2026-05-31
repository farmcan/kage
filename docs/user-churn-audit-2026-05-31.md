# Five-Round User Churn Audit

Date: 2026-05-31

This audit treats the GitHub repository and GitHub Pages site as the product funnel. The goal is to find why a first-time visitor would not use KAGE, why they would leave, and which maintenance moves are most likely to increase stars.

## Current Public Signals

- GitHub stars: 5
- Forks: 2
- Open issues: 1
- Latest release: v0.1.4
- Repository description: `Local-first desktop and CLI session manager for Claude Code, Codex, and QoderCLI.`
- Homepage: `https://farmcan.github.io/kage/`

## Round 1: First 10 Seconds On GitHub

Why a user leaves:

- The category is clear, but the pain is still slightly abstract.
- A visitor may not know whether KAGE is a desktop app, CLI, session browser, bridge tool, or terminal replacement.
- Internal docs were visible too early in the README, which made the project feel more like a planning repo than a product.

What to maintain:

- Keep the first screen focused on one promise: find, resume, fork, replay, and bridge local AI coding sessions.
- Keep screenshots above the fold.
- Keep release and download links visible before deep architecture links.
- Move planning docs below installation and core workflows.

## Round 2: "Is This For Me?"

Why a user leaves:

- If they only use one agent, KAGE may feel unnecessary.
- If they expect a hosted sync product, they may misunderstand the local-first boundary.
- If they are evaluating against Codex desktop, Claude native resume, or Warp, they need a comparison in plain language.

What to maintain:

- Keep a `Use KAGE if` and `Skip it for now if` section in the README.
- Keep a short comparison against native resume pickers, terminals, raw scripts, and cloud tools.
- Avoid implying KAGE replaces the agent or the terminal.

## Round 3: Install Friction

Why a user leaves:

- The macOS DMG is still unsigned.
- A first-time visitor may not know they need existing local Claude Code, Codex, or QoderCLI sessions for KAGE to be useful.
- If they install and see an empty list, the product can feel broken even when it is behaving correctly.

What to maintain:

- Keep the unsigned Gatekeeper note next to the DMG link until #34 is closed.
- Say before install that KAGE is useful after agents have created local session history.
- In releases, repeat the exact first commands: `kage doctor`, `kage sessions --include-subdirs`, and `kage search "auth"`.
- Add signed/notarized DMG as the highest-trust release task.

## Round 4: First Successful Moment

Why a user leaves:

- KAGE's "aha" moment is not installing it; it is finding a forgotten useful session or bridging a real session into another agent.
- If the README shows many route aliases before the story, it can feel like a command glossary instead of a workflow.
- Replay, fork, bridge, and continue need crisp meanings or users will click the wrong thing.

What to maintain:

- Lead with one workflow: search a transcript, select a session, bridge it, then resume in the target agent.
- Keep action names stable:
  - `Continue`: original session, original agent.
  - `Fork`: same agent, new branch of context.
  - `Bridge`: different agent, native resume format.
  - `Replay story`: read-only local HTML review.
- Turn repeated questions into README FAQ entries instead of adding more route examples at the top.

## Round 5: Star Decision

Why a user leaves without starring:

- They may understand the idea but not trust that the project will keep moving.
- They may not see a clear roadmap from unsigned DMG to signed app, demo GIF, and mobile/multi-device companion.
- The GitHub social proof is still small, so the repo needs strong product proof.

What to maintain:

- Every release should include a user-facing workflow headline, a DMG, a screenshot or GIF, known limitations, and the CLI install path.
- Keep open issues few and meaningful. High-value public issues should map to adoption blockers.
- Add a 15-25 second demo GIF before broad promotion.
- Keep the GitHub About description and topics aligned after every positioning change.

## Priority Fixes

1. Signed and notarized DMG.
2. Real demo GIF: open app, search transcript, select session, bridge, show resume command.
3. README first-screen conversion: product promise, screenshot, fast install, local-first trust.
4. Homepage CTAs: direct DMG download, GitHub star, CLI install.
5. First-run empty state and sample workflow for users who have not created agent sessions yet.

## Maintenance Rhythm

Weekly:

- Check stars, forks, release downloads, and open issues.
- Make sure the top README links point at the latest release.
- Keep only current roadmap items in visible issues.

Before every release:

- Verify `README.md`, `app/README.md`, `docs/index.html`, and release notes use the same version.
- Verify the DMG download link works.
- Verify screenshots or GIFs show the current app state.
- Add a short known-limitations note.

After every launch:

- Turn repeated objections into README copy.
- Turn repeated setup failures into issue templates or first-run UI fixes.
- Retire old planning docs from the public path once they stop helping a first-time user.
