# mini-didact – A Tiny React-Style Renderer

This repo contains a small, educational implementation of a React-style renderer and hook system, inspired by [Didact](https://github.com/pomber/didact). It lets you build interactive UI using:

- `createElement` (JSX-like elements with `type` + `props`)
- A fiber-based renderer with incremental work (`requestIdleCallback`)
- Function components with a minimal `useState` hook

I’m using this project to deepen my understanding of:

- How component trees are turned into DOM updates
- How reconciliation works (diffing old vs new fibers)
- How a small hook system (like `useState`) can be wired up

> **PS:** This is **not** a production library. I'm trading performance and completeness for clarity and learning.

---

## Features

- JSX-like element creation (via `createElement` or JSX with a bundler)
- Fiber tree with incremental rendering using `requestIdleCallback`
- Simple reconciliation:
  - Add / update / delete DOM nodes
- Function components with `useState`
- Tiny API surface:

```js
import { createElement, render, useState } from "./src/mini-didact.js";

