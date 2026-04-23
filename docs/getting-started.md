# Getting Started

This guide takes you from a fresh clone to your first generated Playwright spec.

![Main workspace overview](screenshots/hero-main-workspace.png)

## Prerequisites

- Node.js 18+
- npm 9+
- Access to a Drupal or Varbase site is recommended, but other sites can also be recorded

Login is optional. If your target flow does not require authentication, or your project already handles authentication elsewhere, you can leave login-related generation and replay options disabled.

## Install And Run

```bash
npm install
npm start
```

## First Recording

1. Launch the app.
2. Enter your site URL in the embedded browser and load the page.
3. Click `Record` in the top toolbar.
4. Perform the workflow you want to automate.
5. Stop recording when finished.
6. Review the generated steps in the left panel.

## Refine The Scenario

- Use the `Edit` tab to change selectors, values, wait timing, or action types.
- Use the `Scenarios` tab to rename the scenario or move steps.
- Use the `Assert` tab to add checks after key interactions.
- Use the `Vars` tab to inspect captured URLs and CRUD-related dynamic values.

## Validate With Replay

Open the `Replay` tab and run the recorded scenario inside the app before exporting it. This helps catch selector mistakes and navigation issues early. Enable replay login only if the flow actually needs an authenticated entry point.

## Export The Result

Use the `Export` tab to preview the generated Playwright spec, export a ZIP, save the current session, or integrate directly into an existing Playwright project.

## Recommended Next Reads

- [Recording Guide](recording-guide.md)
- [Replay](replay.md)
- [Code Generation](code-generation.md)
- [Export And Integration](export-integration.md)
