---
name: solid-agents-project-scaffolder
description: >
  Use when creating a new SolidJS project, scaffolding a SolidStart application, or setting up project infrastructure.
  Prevents misconfigured Vite/TypeScript settings, wrong directory structures, and React-style project patterns.
  Covers Vite configuration, TypeScript setup, component directory structure, routing, state management, and testing setup.
  Keywords: SolidJS scaffold, SolidStart project, Vite config, tsconfig,
  project template, file structure, routing setup, new SolidJS project,
  start from scratch, create SolidJS app.
license: MIT
compatibility: "Designed for Claude Code. Requires SolidJS 1.x/2.x."
metadata:
  author: OpenAEC-Foundation
  version: "1.0"
---

# solid-agents-project-scaffolder

## Quick Reference

### Project Type Decision Tree

```
Need a new SolidJS project?
├── Need SSR, file-based routing, server functions, or API routes?
│   └── YES → SolidStart scaffold
│       ├── Full-stack app with data loading? → SolidStart with query/action
│       ├── Static site with prerendering? → SolidStart with SSG preset
│       └── API backend + frontend? → SolidStart with API routes
└── NO → Plain SolidJS scaffold (client-side SPA)
    ├── Simple reactive UI? → Plain SolidJS + Vite
    ├── Need routing? → Plain SolidJS + @solidjs/router
    └── Embedded widget or library? → Plain SolidJS minimal
```

### Critical Warnings

**NEVER** use `create-react-app`, `next`, or any React scaffolding tool for a SolidJS project. The generated configuration, babel presets, and JSX transform are incompatible.

**NEVER** omit `vite-plugin-solid` from `vite.config.ts`. Without it, JSX compilation fails silently or produces React output.

**ALWAYS** set `"jsxImportSource": "solid-js"` in `tsconfig.json`. Without this, TypeScript resolves JSX types from React, causing type errors on SolidJS-specific attributes.

**ALWAYS** use `babel-preset-solid` (included via `vite-plugin-solid`). This preset compiles JSX into SolidJS's fine-grained reactive DOM operations instead of `React.createElement` calls.

**NEVER** include `react`, `react-dom`, `@types/react`, or `@types/react-dom` in dependencies. Their presence causes type conflicts and import confusion.

**ALWAYS** use `solid-js/web` for `render` and `hydrate` — these are NOT imported from `solid-js` directly.

---

## SolidStart Scaffold (Full-Stack)

### Required Dependencies

| Package                    | Type          | Purpose                             |
| -------------------------- | ------------- | ----------------------------------- |
| `solid-js`                 | dependency    | Core reactive framework             |
| `@solidjs/router`          | dependency    | Routing (file-based + programmatic) |
| `@solidjs/start`           | dependency    | SolidStart meta-framework           |
| `@solidjs/meta`            | dependency    | Document head management            |
| `vinxi`                    | devDependency | Build orchestration (Vite + Nitro)  |
| `typescript`               | devDependency | TypeScript compiler                 |
| `vitest`                   | devDependency | Testing framework                   |
| `@solidjs/testing-library` | devDependency | Component testing utilities         |
| `jsdom`                    | devDependency | DOM environment for tests           |

### Project Structure

```
my-solidstart-app/
├── public/
│   └── favicon.ico
├── prisma/
│   └── schema.prisma
├── src/
│   ├── assets/
│   ├── components/
│   │   ├── form/
│   │   ├── shared/
│   │   └── ui/
│   ├── config/
│   ├── constants/
│   ├── features/
│   ├── layouts/
│   ├── lib/
│   │   ├── client/
│   │   ├── server/
│   │   └── shared/
│   ├── routes/
│   ├── server/
│   │   ├── actions/
│   │   ├── db/
│   │   └── services/
│   ├── templates/
│   ├── types/
│   ├── app.css
│   ├── app.tsx
│   ├── entry-client.tsx
│   └── entry-server.tsx
├── test/
│   └── Counter.test.tsx
├── eslint.config.js
├── bun.lock
├── package.json
├── tsconfig.json
├── vite.config.ts
└── .gitignore
```

### Configuration Files

#### eslint.config.js

```javascript
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import solidPlugin from "eslint-plugin-solid";

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ["node_modules/**", ".solid/**", "dist/**", "prisma/migrations/**"],
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      solid: solidPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      ...solidPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
];
```

#### tsconfig.json (SolidStart)

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "jsx": "preserve",
    "jsxImportSource": "solid-js",
    "allowJs": true,
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["vite/client", "node"],
    "isolatedModules": true,
    "paths": {
      "~/*": ["./src/*"]
    }
  }
}
```

#### src/app.tsx

```typescript
import { Suspense } from "solid-js";
import { Router } from "@solidjs/router";
import { FileRoutes } from "@solidjs/start/router";
import { MetaProvider } from "@solidjs/meta";

export default function App() {
  return (
    <Router
      root={(props) => (
        <MetaProvider>
          <Suspense>{props.children}</Suspense>
        </MetaProvider>
      )}
    >
      <FileRoutes />
    </Router>
  );
}
```

#### src/entry-client.tsx

```typescript
// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

mount(() => <StartClient />, document.getElementById("app")!);
```

#### src/entry-server.tsx

```typescript
import { createHandler, StartServer } from "@solidjs/start/server";

export default createHandler(() => (
  <StartServer
    document={({ assets, children, scripts }) => (
      <html lang="en">
        <head>
          <meta charset="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" href="/favicon.ico" />
          {assets}
        </head>
        <body>
          <div id="app">{children}</div>
          {scripts}
        </body>
      </html>
    )}
  />
));
```

---

## State Management Setup

### Context + Store Provider Pattern

ALWAYS use this pattern for shared application state. NEVER use React's `useReducer` or Redux patterns.

```typescript
// src/context/AppContext.tsx
import { createContext, useContext, type ParentProps } from "solid-js";
import { createStore } from "solid-js/store";

interface AppState {
  user: { name: string; email: string } | null;
  theme: "light" | "dark";
}

interface AppActions {
  setUser: (user: AppState["user"]) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<[AppState, AppActions]>();

export function AppProvider(props: ParentProps) {
  const [state, setState] = createStore<AppState>({
    user: null,
    theme: "light",
  });

  const actions: AppActions = {
    setUser: (user) => setState("user", user),
    toggleTheme: () =>
      setState("theme", (prev) => (prev === "light" ? "dark" : "light")),
  };

  return (
    <AppContext.Provider value={[state, actions]}>
      {props.children}
    </AppContext.Provider>
  );
}

export function useApp(): [AppState, AppActions] {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp must be used within AppProvider");
  return context;
}
```

### vite.config.ts

```typescript
import { defineConfig } from "vite";
import { nitroV2Plugin as nitro } from "@solidjs/vite-plugin-nitro-2";
import { solidStart } from "@solidjs/start/config";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    solidStart({
      middleware: "./src/middleware/security.ts",
    }),
    nitro(),
  ],
  ssr: { external: ["@prisma/client"] },
});
```

---

## Testing Setup

### Example Test: test/Counter.test.tsx

```typescript
import { render, fireEvent, screen } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";
import Counter from "../src/components/Counter";

describe("Counter", () => {
  it("increments count on click", async () => {
    render(() => <Counter />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Count: 0");
    fireEvent.click(button);
    expect(button).toHaveTextContent("Count: 1");
  });
});
```

---

## Reference Links

- [references/methods.md](references/methods.md) -- Scaffolding templates: file listings, config templates, component templates
- [references/examples.md](references/examples.md) -- Complete SolidJS project scaffold, complete SolidStart project scaffold
- [references/anti-patterns.md](references/anti-patterns.md) -- Scaffolding mistakes: wrong config, missing babel preset, React boilerplate

### Official Sources

- https://docs.solidjs.com/solid-start/getting-started
- https://docs.solidjs.com/guides/getting-started-with-solid
- https://github.com/solidjs/solid
- https://github.com/solidjs/solid-start
