# Architecture

Varbase Test Recorder is an Electron desktop application with a React renderer and a webview-based interaction layer.

## High-Level Components

- Electron main process
- Electron preload bridge
- Webview recorder preload
- React renderer application
- Generator and integration modules

## Data Flow

1. The user interacts with the page inside the webview.
2. `recorder-preload.js` captures actions and sends them to the renderer with `ipcRenderer.sendToHost()`.
3. React hooks normalize actions, scenarios, and variables.
4. The UI renders editable steps, scenarios, assertions, replay, and export panels.
5. Generator modules translate actions into Playwright code.
6. Main-process IPC handlers save sessions, export ZIP files, and integrate with projects.

## Replay Flow

1. The renderer resolves scenario steps.
2. Navigation actions are executed from the renderer through the webview API.
3. DOM actions are sent to the preload as `replay-action` messages.
4. The preload finds the target element, executes the action, and returns pass or fail.
5. The UI updates step status in real time.

## Key Source Areas

- `src/main` app boot and IPC handlers
- `src/preload` host bridge and recorder preload
- `src/renderer/components` UI panels
- `src/renderer/hooks` stateful app logic
- `src/generator` Playwright spec generation
- `src/integrator` project integration and scaffolding
- `src/shared` common constants and Drupal patterns
