# Contributing

Thank you for contributing to Varbase Test Recorder.

## Development Setup

1. Fork the repository and clone your fork.
2. Run `npm install` to install all dependencies.
3. Run `npm start` to launch the app in development mode with hot-reload.
4. Make focused changes scoped to one concern.
5. Test your change by running a recording, replay, or export flow as appropriate.
6. Open a pull request against the `main` branch.

```bash
git clone https://github.com/Vardot/varbase-test-recorder.git
cd varbase-test-recorder
npm install
npm start
```

## Contribution Guidelines

- Keep changes scoped to one concern.
- Preserve existing UX and generated output behavior unless the change explicitly targets them.
- Prefer minimal, root-cause fixes over broad rewrites.
- Update documentation when behavior changes.
- Do not introduce unrelated formatting churn.

## Pull Request Expectations

- Explain what changed and why.
- Include screenshots for UI changes when possible.
- Mention affected flows such as recording, replay, generation, or integration.
- Call out any known limitations or follow-up work.

## Suggested Verification

Before opening a PR, validate the relevant slice:

- Launch the app and verify the impacted UI flow
- Confirm generated Playwright output still matches expectations
- If replay behavior changed, run a replay scenario
- If project integration changed, inspect the produced scaffold or output files

## Code Style

- Use the existing project style.
- Prefer small, readable functions.
- Keep renderer logic in hooks and components organized by responsibility.
- Avoid adding dependencies unless they solve a real problem that the current code cannot solve cleanly.

## Reporting Security Issues

Do not open public issues for security-sensitive findings. Instead, report them privately through GitHub Security Advisories:

https://github.com/Vardot/varbase-test-recorder/security/advisories/new
