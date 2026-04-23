# Export And Integration

The app supports both standalone export and direct project integration.

![Export panel](screenshots/export-panel.png)

## Export Options

- Preview generated Playwright code
- Export a ZIP archive
- Save a recorder session as JSON
- Load a saved recorder session

## Project Integration Wizard

The integration flow can:

1. Select a project directory
2. Analyze whether Playwright already exists
3. Scaffold helper files and config when needed
4. Place generated specs into the appropriate location
5. Optionally run `npm install`

## Scaffolded Project Contents

The generated scaffold includes:

- `playwright.config.js`
- login helper
- common helper utilities
- selector helper file
- CRUD example specs
- fixture placeholders

Scaffolded login helpers and login-related placeholder values are only necessary when the target project needs automated authentication. If not, they can be left unused or removed.

## When To Use ZIP Export

Choose ZIP export if you want to inspect the output outside the target project first or hand it off to another team.

## When To Use Direct Integration

Choose direct integration when your project already uses Playwright or when you want the recorder to bootstrap a new Playwright layout for you.
