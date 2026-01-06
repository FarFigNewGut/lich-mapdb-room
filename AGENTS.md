# AGENTS.md - Coding Agent Guidelines

This document provides guidelines for AI coding agents working on the Lich Map Room Database project.

## Project Overview

A static web app for exploring rooms from the Lich map database for Gemstone IV. Features include room search, map navigation, and detailed room information display.

**Tech Stack**: Vanilla JavaScript (ES modules), HTML5, CSS3, Ruby 2.7 (map data downloader)

## Build/Lint/Test Commands

```bash
# Ruby - Map data updater
bundle install
bundle exec ruby util/update_map.rb              # Default (GS game)
GAMECODE=GS bundle exec ruby util/update_map.rb  # Explicit game code

# Frontend - No build step, serve statically
python -m http.server 8000  # or: npx serve .

# Testing/Linting - Not configured. Manual browser testing only.
```

## Project Structure

```
├── index.html              # Main entry point
├── data/map.json           # Room database (auto-updated daily)
├── static/js/
│   ├── app.js              # Main application entry
│   ├── data.js             # IndexedDB caching & data loading
│   ├── router.js           # Hash-based SPA router
│   ├── room.js             # Room page rendering
│   ├── search.js           # Search page rendering
│   └── utils.js            # Shared utilities (escapeHtml, announceToScreenReader)
├── static/css/room.css     # Custom styles (dark mode + reduced motion support)
├── static/maps/            # Map images (auto-updated)
└── util/update_map.rb      # Map data downloader script
```

## Code Style Guidelines

### JavaScript

- **Indentation**: 4 spaces
- **Quotes**: Single quotes
- **Semicolons**: Required
- **Naming**: `camelCase` for functions/variables, `UPPER_SNAKE_CASE` for constants

**Module Structure**:
```javascript
import { func1 } from './module.js';  // Imports at top
const CONSTANT = 'value';             // Constants after imports
let moduleState = null;               // Module state (minimize)
export function publicFunc() { }      // Exported functions
function privateHelper() { }          // Private functions
```

**DOM & Events**:
- Use `document.getElementById()` and `element.querySelector()`
- Prefer `innerHTML` with template literals for rendering
- Always escape user content: `escapeHtml()` from utils.js
- Use `addEventListener()`, not inline handlers

**Accessibility (CRITICAL)**:
- All interactive elements need ARIA labels
- Use semantic HTML (`nav`, `main`, `section`, `article`)
- Screen reader announcements via `announceToScreenReader()` from utils.js
- Keyboard navigation support required
- Focus management for modals/popups

### CSS

- **Indentation**: 4 spaces
- **Naming**: `kebab-case` class names (`.room-card`, `.exit-item`)
- **State classes**: `.visible`, `.hidden`, `.selected`

**Dark Mode**: Always provide dark mode variants:
```css
.my-element { color: #334155; }
@media (prefers-color-scheme: dark) { .my-element { color: #e2e8f0; } }
```

**Reduced Motion**: Disable animations for users who prefer it:
```css
@media (prefers-reduced-motion: reduce) { .animated { animation: none; } }
```

### Ruby

- **Indentation**: 2 spaces (Ruby standard)
- **Naming**: `snake_case` for variables/methods, `SCREAMING_SNAKE_CASE` for constants

### HTML

- Use semantic elements: `nav`, `main`, `section`, `article`, `header`, `footer`
- ARIA roles and labels on interactive elements
- Skip links for keyboard navigation at top of body

## Important Patterns

**Data Loading** (data.js): IndexedDB caching with version comparison, in-memory indices for fast lookups

**Routing** (router.js): Hash-based SPA routing (`#/room/123`, `#/search`), pattern matching with `:id` params

**Rendering** (room.js/search.js): Build HTML with template literals, initialize interactions after DOM via `requestAnimationFrame`

**Search** (search.js): Tag autocomplete with keyboard nav, cascading dropdowns (tag -> map -> location)

## Common Gotchas

1. **XSS Prevention**: Always use `escapeHtml()` when inserting user/dynamic content
2. **Image Coordinates**: Room highlighting uses original image dimensions scaled to rendered size
3. **IndexedDB Quota**: Cache saving may fail silently on quota exceeded
4. **Map Updates**: Daily GitHub Action commits to main - don't be surprised by auto-commits

## Dependencies

- **Ruby**: No external gems - uses only Ruby stdlib
- **JavaScript**: No npm dependencies - vanilla JS only
- **Vendored**: Pico.css (styling), Prism.js (syntax highlighting)

## GitHub Actions

The `update_maps.yml` workflow runs daily at 03:42 UTC:
1. Runs `bundle exec ruby util/update_map.rb`
2. Commits changes to `data/map.json`, `data/updated_at`, `static/maps/`
3. Pushes to main branch

Do not modify the workflow without understanding the update process.
