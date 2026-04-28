The first stable release of **Varbase Test Recorder** — a free, open-source desktop application that records browser interactions on Drupal and Varbase sites and generates ready-to-run Playwright test code.

Built by the QA team at [Vardot](https://www.vardot.com).

## What It Does

Record real browser workflows — clicking, typing, navigating, uploading — and export them as complete Playwright `.spec.js` test files with no manual boilerplate required.

## Key Features

- **Record browser interactions** — captures clicks, text input, selects, checkboxes, file uploads, form submissions, and navigations in real time
- **Drupal-first intelligence** — recognizes CKEditor 5, media library, dropbuttons, jQuery UI dialogs, tabledrag, autocomplete menus, and Drupal status messages
- **Smart selector strategy** — generates stable selectors using a 6-level priority chain: ID → `data-drupal-selector` → name → label → visible text → CSS path
- **Assertion builder** — add visibility, text, URL, and element existence checks without writing code
- **Scenario management** — organize steps into named scenarios with Gherkin keywords (Given/When/Then)
- **Variable capture** — automatically captures dynamic URLs after content creation and links them across CRUD steps
- **In-app replay** — validate recorded scenarios against a live site before exporting, with adjustable speed and step-by-step mode
- **Playwright code generation** — exports complete `.spec.js` files with login helpers, CKEditor 5 support, media upload helpers, status message checks, and auto-waits
- **CRUD test generation** — optionally generates edit, delete, and clone test cases from a single recording session
- **Project integration wizard** — detects your existing Playwright project structure and places generated tests in the right location
- **Iframe support** — record and replay interactions inside iframes with automatic `frameLocator` chain generation
- **Site profiles** — manage multiple environments with different base URLs and login credentials
- **Session save/load** — save recording sessions as JSON for team sharing and later editing
- **Noise reduction** — filters out redundant clicks, label-only interactions, and login boilerplate

## Download

| Platform | File | Notes |
|----------|------|-------|
| **Windows** | `Varbase Test Recorder-1.0.0 Setup.exe` | Squirrel installer — run and it handles everything |
| **Windows** | `Varbase-Test-Recorder-win32-x64-1.0.0.zip` | Portable ZIP — extract and run |
| **macOS** | `Varbase-Test-Recorder-darwin-arm64-1.0.0.zip` | Apple Silicon — extract, move to Applications, right-click → Open on first launch |
| **Linux** | `Varbase-Test-Recorder-linux-x64-1.0.0.zip` | Extract and run the executable |

## Quick Start

1. Download and install for your platform
2. Launch the app
3. Enter your site URL in the embedded browser and navigate to it
4. Click **Record** and interact with your site
5. Review and edit captured steps in the step list
6. Add assertions for expected outcomes
7. Use **Replay** to validate the flow
8. Go to **Export** to generate and save your Playwright test file

## Requirements

- No additional dependencies needed to run the app
- Generated test files require [Node.js](https://nodejs.org/) and [Playwright](https://playwright.dev/) in your project

## Links

- [Documentation](https://github.com/Vardot/varbase-test-recorder/tree/main/docs)
- [Getting Started Guide](https://github.com/Vardot/varbase-test-recorder/blob/main/docs/getting-started.md)
- [Recording Guide](https://github.com/Vardot/varbase-test-recorder/blob/main/docs/recording-guide.md)
- [Report an Issue](https://github.com/Vardot/varbase-test-recorder/issues)

## License

GPL-2.0-or-later
