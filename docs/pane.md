# HUD pane layout

Developer reference for `hooks/core/pane`. The shared frame is implemented; development checks are documented in [CONTRIBUTING.md](../CONTRIBUTING.md).

[Overview](../README.md) · [User controls](guide.md#controls)

## Responsibilities

| Part | Owns |
| --- | --- |
| `open.ts` | Opening, focus, exclusive panels, and back navigation. |
| `frame.ts` | Header, body, footer, compact layout, and inactive focus hint. |
| `hooks.ts` | Shared press and close handlers. |
| `state.ts` | Visibility, focus state, and guards for asynchronous moves. |
| `scroll.ts` | Keyboard scroll intent. |
| `kit/` | Shared controls and windowed content. |

Modules draw their content and keep their pane-specific hooks. The engine chooses inline or dock placement; each render supplies the available width and height.

## Frame

`framedPane` returns the focus-aware UI, available body rows, and a frame renderer. Content is passed as `PaneZones`: header, body, optional footer, and keyboard hint.

```text
Header   1 row
Body     remaining visible rows
Footer   1 reserved row; help while focused
```

Below `minRows`, the footer disappears first, then the header. The frame keeps one extra trailing row for engine scroll events. Modules handle their own content windows.

An unfocused panel is muted and shows a focus shortcut at the top right. Narrow panels drop the inactive label first. Focused panels hide this overlay.

## Verification

Check both placements at wide and narrow sizes:

- Mouse, arrows, page keys, and Tab keep selection visible.
- The focus hint stays visible during scrolling and resizing.
- Escape goes back before closing nested views.
- Closing or reopening a pane invalidates stale asynchronous focus work.

Use the existing regression tests and the checks in [CONTRIBUTING.md](../CONTRIBUTING.md#checks). Avoid tests that only repeat layout or wording.
