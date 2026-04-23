# Varbase Test Recorder

[![License: GPL-2.0-or-later](https://img.shields.io/badge/License-GPL%202.0%2B-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-0f766e.svg)](package.json)
[![Electron](https://img.shields.io/badge/Electron-31-47848f.svg)](https://www.electronjs.org/)
[![Playwright](https://img.shields.io/badge/Playwright-Test-2e7d32.svg)](https://playwright.dev/)

Varbase Test Recorder is a desktop QA tool for Drupal and Varbase teams that records browser interactions in an embedded browser, organizes them into scenarios, replays them inside the app, and generates Playwright test specs ready for export or direct project integration.

Built and maintained by [Vardot](https://www.vardot.com), creators of the [Varbase](https://www.drupal.org/project/varbase) Drupal distribution.

![Varbase Test Recorder main workspace](docs/screenshots/hero-main-workspace.png)

Turn exploratory Drupal admin work into repeatable Playwright coverage without starting from a blank test file. The app is built for QA engineers, developers, and solution teams who need faster authoring for content workflows, regression packs, and Varbase-heavy editorial flows.

## Drupal-first, not Drupal-only

Varbase Test Recorder is optimized for Drupal and Varbase workflows, where it can apply framework-aware shortcuts such as Drupal selectors, status message detection, media-library handling, CRUD URL capture, and CKEditor helpers.

It can still be used on other sites. On non-Drupal targets, the recorder behaves more like a general browser interaction recorder and skips Drupal-specific intelligence when it is not relevant.

## Who It Is For

- Vardot teams and partners delivering Drupal and Varbase projects who need repeatable QA coverage
- QA teams building repeatable Drupal regression suites
- Developers who want to bootstrap Playwright coverage from real browser behavior
- Solution teams working on Varbase editorial and admin experiences
- Project teams that need structured handoff from manual testing to automated tests

## Why This Project Exists

Manual regression testing in Drupal admin flows is repetitive, fragile, and hard to hand off across teams. This app turns exploratory interaction into structured, reviewable, replayable automation with Drupal-aware behavior built in.

## Highlights

- Records clicks, typing, selects, uploads, submits, navigations, assertions, waits, CKEditor interactions, dropbuttons, dialogs, and tabledrag operations.
- Understands Drupal and Varbase admin patterns including node CRUD flows, status messages, media library, CKEditor 5, and sticky save buttons.
- Generates Playwright `.spec.js` files with helper functions and optional CRUD follow-up tests.
- Replays recorded scenarios inside the app with pause, resume, step mode, and failure handling.
- Supports iframe-aware picking and replay through frame path tracking and Playwright `frameLocator()` generation.
- Integrates directly into existing Playwright projects or scaffolds a new test-ready structure.

## Table Of Contents

- [Screenshots](#screenshots)
- [Features](#features)
- [Quick Start](#quick-start)
- [Generated Output Example](#generated-output-example)
- [What You Get](#what-you-get)
- [Architecture Overview](#architecture-overview)
- [Installation](#installation)
- [Development](#development)
- [Packaging](#packaging)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

## Screenshots

![Recording browser and step list](docs/screenshots/recording-browser-and-steps.png)
Recording in progress with the embedded browser, scenario step list, and active Drupal page.

![Step editor with frame path](docs/screenshots/step-editor-frame-path.png)
Editing a recorded step, including selector strategy and iframe frame path metadata.

![Scenario builder](docs/screenshots/scenario-builder.png)
Managing multiple scenarios, moving steps between them, and setting the active scenario.

![Assertion builder](docs/screenshots/assertion-builder.png)
Adding quick Drupal assertions and custom element assertions with selector picking.

![Replay panel](docs/screenshots/replay-panel.png)
Replaying a scenario with speed control, stop-on-failure, and per-step result tracking.

![Export panel](docs/screenshots/export-panel.png)
Previewing generated Playwright output, exporting ZIP files, and integrating into a project.

## Features

### Recording Engine

The recorder runs inside the Electron webview preload script and captures meaningful browser behavior while filtering noise. It debounces repeated input, suppresses redundant click-before-type sequences, avoids recording login boilerplate, and emits structured actions the React UI can edit.

Supported action types:

- `navigate`
- `click`
- `type`
- `select`
- `check`
- `upload`
- `submit`
- `assert_visible`
- `assert_text`
- `assert_url`
- `assert_status_message`
- `assert_exists`
- `assert_not_exists`
- `capture_url`
- `use_captured_url`
- `wait`
- `type_ckeditor`
- `upload_media`
- `dialog_click`
- `dropbutton_click`
- `tabledrag`

### Smart Selector Strategy

Selectors are chosen in this order:

1. Stable `#id`
2. `data-drupal-selector`
3. `name`
4. Associated label
5. Short visible text for clickable elements
6. Compact CSS path

This keeps generated tests readable while still providing a fallback path when semantic hooks do not exist.

### Drupal And Varbase Intelligence

The app recognizes Drupal-specific UI and content workflows when they are present, but these enhancements are optional rather than required for using the recorder:

- Node add, view, edit, delete, clone, and layout URLs
- Admin content and structure routes
- Drupal status messages for created, updated, deleted, cloned, and saved content
- CKEditor 5 editable areas
- Media library buttons
- Dropbutton menus
- jQuery UI dialogs
- Autocomplete results
- Tabledrag handles
- Sticky save button variants

### Scenario Management

Recorded steps are grouped into scenarios. You can rename scenarios, switch the active target for new recordings, move steps between scenarios, reorder steps, and tune keywords such as `Given`, `When`, `Then`, and `And`.

### Assertion Builder

Assertions can be added manually through templates or custom builder inputs. The UI supports visibility, text, URL, existence, non-existence, and Drupal status message checks.

### Element Picker And Iframe Support

The picker overlays the live page and returns the best selector for the chosen element. For iframe content, it lets you drill into same-origin frames, records the frame index path, shows a breadcrumb trail, and feeds that path into replay and code generation.

### Replay Engine

Replay runs scenarios directly in the embedded browser so authors can validate flows before exporting. It supports:

- Full-speed replay
- Step-by-step execution
- Pause and resume
- Stop on failure
- Per-step status and error display
- Navigation handling with preload re-sync
- Optional login before replay when the flow needs an authenticated starting point

### Export And Project Integration

You can:

- Preview generated Playwright test code
- Export a ZIP with test files
- Save and reload recorder sessions
- Integrate into an existing Playwright project
- Scaffold a new Playwright project with helper utilities and CRUD specs

## What You Get

- A desktop recorder that understands Drupal admin behavior instead of treating it like a generic form filler
- Editable, scenario-based steps with assertions, variables, and replay before export
- Playwright output that stays close to human intent and includes helper utilities where needed
- A project integration path for teams that already have Playwright in place

## Quick Start

1. Install dependencies with `npm install`.
2. Launch the app with `npm start`.
3. Open your Drupal or Varbase site, or another target site, in the embedded browser, then press `Record`.
4. Perform the flow you want to automate, refine steps in the right-side tabs, replay if needed, then export or integrate the generated Playwright spec.

## Generated Output Example

```js
import { test, expect } from '@playwright/test';
import { login } from './helpers/login';
import { clickSaveButton, checkStatusMessage } from './helpers/common';

test.describe.serial('Manage Basic Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Create page with media field', async ({ page }) => {
    await page.goto('/node/add/basic_page');
    await page.locator('#edit-title-0-value').fill('Automation title', { force: true });
    await page.frameLocator('iframe').nth(0).locator('body').click({ force: true });
    await clickSaveButton(page);
    await checkStatusMessage(page, 'created');
  });
});
```

The generated `login()` helper and `beforeEach` login flow are optional and are only included when login generation is enabled.

## Architecture Overview

```text
Renderer (React UI)
  ├─ StepList / StepEditor / ReplayPanel / ExportPanel
  ├─ useRecorder / useReplay / useGenerator hooks
  └─ Browser component
       └─ Electron <webview>
            ├─ recorder-preload.js
            │    ├─ action capture
            │    ├─ element picker
            │    └─ replay executor
            └─ Drupal / Varbase site

Main Process
  ├─ Electron window lifecycle
  ├─ IPC handlers for save/load/export/integrate
  └─ Forge packaging setup
```

## Installation

### Prerequisites

- Node.js 18 or newer
- npm 9 or newer
- A Drupal or Varbase environment is recommended for the best experience, but other sites can also be recorded

### Install

```bash
npm install
npm start
```

## Development

### Scripts

- `npm start` starts Electron Forge in development mode.
- `npm run package` creates a packaged local build.
- `npm run make` builds distributables through Electron Forge makers.

### Workspace Structure

- `src/main` Electron main process and IPC handlers
- `src/preload` bridge preload and recorder preload
- `src/renderer` React application, hooks, and components
- `src/generator` Playwright spec generation
- `src/integrator` scaffold and project integration logic
- `src/shared` action type definitions and Drupal patterns

## Packaging

The app is packaged with Electron Forge and Vite. Current makers include ZIP builds for major desktop platforms and Squirrel for Windows installers.

## Documentation

Extended guides live under the `docs/` directory:

- [Getting Started](docs/getting-started.md)
- [Recording Guide](docs/recording-guide.md)
- [Scenario Management](docs/scenario-management.md)
- [Assertions](docs/assertions.md)
- [Replay](docs/replay.md)
- [Code Generation](docs/code-generation.md)
- [Export And Integration](docs/export-integration.md)
- [Configuration](docs/configuration.md)
- [Iframe Support](docs/iframe-support.md)
- [Variables](docs/variables.md)
- [Architecture](docs/architecture.md)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development workflow, coding expectations, and pull request guidance.

## License

This project is licensed under [GPL-2.0-or-later](LICENSE).

## Acknowledgments

- [Vardot](https://www.vardot.com) and the [Varbase](https://www.drupal.org/project/varbase) ecosystem
- [Drupal](https://www.drupal.org) open-source contributors
- [Electron](https://www.electronjs.org/)
- [React](https://react.dev/)
- [Playwright](https://playwright.dev/)
