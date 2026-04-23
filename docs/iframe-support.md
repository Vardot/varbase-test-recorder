# Iframe Support

Iframe handling is available through pick mode, replay, and generated Playwright output.

![Step editor with frame path](screenshots/step-editor-frame-path.png)

## How Picking Works

1. Start pick mode from the step editor or assertion builder.
2. Hover over an iframe to see the orange dashed highlight.
3. Click the iframe to enter it.
4. Use the breadcrumb to move deeper or go back.
5. Pick the final target element.

## What Gets Stored

The action stores:

- The selector for the chosen element
- The selector strategy
- A `framePath` array such as `[0]` or `[0, 2]`

The frame path is the zero-based index of each iframe within its parent document.

## Replay Behavior

Replay resolves the target iframe document before searching for the element. Same-origin frames work. Cross-origin frames are detected and reported as inaccessible.

## Generated Playwright Behavior

The generator turns `framePath` into chained `frameLocator('iframe').nth(index)` calls.

## Limitations

- Cross-origin iframe content cannot be inspected by the picker.
- Automatic live recording inside iframes is not part of the current implementation; iframe workflows are supported through explicit picking.
