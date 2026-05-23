# Complete Scaffold Examples

## Example 1: Complete SolidStart Project

This is the full file-by-file output for a SolidStart full-stack application with file-based routing, server functions, data loading, and testing.

### File: package.json

```json
{
  "name": "example-with-prisma",
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "vite start",
    "preview": "vite preview"
  },
  "devDependencies": {
    "@types/node": "^24.7.0",
    "@types/nprogress": "^0.2.3",
    "@typescript-eslint/eslint-plugin": "^8.59.4",
    "@typescript-eslint/parser": "^8.59.4",
    "eslint": "^10.4.0",
    "eslint-plugin-solid": "^0.14.5",
    "prettier": "^3.8.3",
    "prettier-plugin-tailwindcss": "^0.8.0"
  },
  "dependencies": {
    "@prisma/client": "^5.12.1",
    "@solidjs/meta": "^0.29.4",
    "@solidjs/router": "^0.15.0",
    "@solidjs/start": "2.0.0-alpha.2",
    "@solidjs/vite-plugin-nitro-2": "^0.1.0",
    "@tailwindcss/vite": "^4.3.0",
    "lucide-solid": "^1.16.0",
    "nprogress": "^0.2.0",
    "prisma": "^5.12.1",
    "solid-js": "^1.9.5",
    "tailwindcss": "^4.0.0",
    "vite": "^7.0.0",
    "zod": "^4.4.3"
  },
  "engines": {
    "node": ">=22"
  }
}
```

### File: eslint.config.js

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

### File: tsconfig.json

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

### File: vite.config.ts

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

### File: .gitignore

```
dist
.wrangler
.output
.vercel
.netlify
.vinxi
app.config.timestamp_*.js

# Environment
.env
.env*.local

# dependencies
/node_modules

# IDEs and editors
/.idea
.project
.classpath
*.launch
.settings/

# Temp
gitignore

# System Files
.DS_Store
Thumbs.db
```

### File: src/app.tsx

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

### File: src/entry-client.tsx

```typescript
// @refresh reload
import { mount, StartClient } from "@solidjs/start/client";

mount(() => <StartClient />, document.getElementById("app")!);
```

### File: src/entry-server.tsx

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

### File: src/components/Counter.tsx

```typescript
import { createSignal, type Component } from "solid-js";

const Counter: Component = () => {
  const [count, setCount] = createSignal(0);

  return (
    <button type="button" onClick={() => setCount((prev) => prev + 1)}>
      Count: {count()}
    </button>
  );
};

export default Counter;
```

### File: src/components/Nav.tsx

```typescript
import { A } from "@solidjs/router";
import type { Component } from "solid-js";

const Nav: Component = () => {
  return (
    <nav>
      <A href="/" end>
        Home
      </A>
      <A href="/about">About</A>
    </nav>
  );
};

export default Nav;
```

### File: src/context/AppContext.tsx

```typescript
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

### File: src/lib/utils.ts

```typescript
export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
```

### File: src/routes/index.tsx

```typescript
import { Title } from "@solidjs/meta";
import Counter from "~/components/Counter";
import Nav from "~/components/Nav";

export default function Home() {
  return (
    <main>
      <Title>Home</Title>
      <Nav />
      <h1>Welcome to SolidStart</h1>
      <Counter />
    </main>
  );
}
```

### File: src/routes/about.tsx

```typescript
import { Title } from "@solidjs/meta";
import Nav from "~/components/Nav";

export default function About() {
  return (
    <main>
      <Title>About</Title>
      <Nav />
      <h1>About</h1>
      <p>This is a SolidStart application with server-side rendering.</p>
    </main>
  );
}
```

### File: src/routes/api/hello.ts

```typescript
import type { APIEvent } from "@solidjs/start/server";

export function GET(event: APIEvent) {
  return { message: "Hello from the API" };
}

export function POST(event: APIEvent) {
  return { message: "Received POST request" };
}
```

### File: test/Counter.test.tsx

```typescript
import { render, fireEvent, screen } from "@solidjs/testing-library";
import { describe, it, expect } from "vitest";
import Counter from "../src/components/Counter";

describe("Counter", () => {
  it("renders with initial count of 0", () => {
    render(() => <Counter />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Count: 0");
  });

  it("increments count on click", async () => {
    render(() => <Counter />);
    const button = screen.getByRole("button");
    fireEvent.click(button);
    expect(button).toHaveTextContent("Count: 1");
  });
});
```

---

## Example 2: SolidStart with Data Loading and Mutations

### File: src/routes/todos.tsx

```typescript
import { createAsync, useSubmission, action, query } from "@solidjs/router";
import { For, Suspense } from "solid-js";
import { Title } from "@solidjs/meta";

interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

const getTodos = query(async () => {
  "use server";
  // Replace with actual database call
  return [
    { id: "1", title: "Learn SolidJS", completed: false },
    { id: "2", title: "Build an app", completed: false },
  ] as Todo[];
}, "todos");

const addTodo = action(async (formData: FormData) => {
  "use server";
  const title = formData.get("title") as string;
  if (!title) throw new Error("Title is required");
  // Replace with actual database call
  console.log("Adding todo:", title);
}, "addTodo");

export default function TodosPage() {
  const todos = createAsync(() => getTodos());
  const submission = useSubmission(addTodo);

  return (
    <main>
      <Title>Todos</Title>
      <h1>Todos</h1>

      <form action={addTodo} method="post">
        <input
          name="title"
          placeholder="New todo..."
          required
          disabled={submission.pending}
        />
        <button type="submit" disabled={submission.pending}>
          {submission.pending ? "Adding..." : "Add"}
        </button>
      </form>

      <Suspense fallback={<p>Loading todos...</p>}>
        <ul>
          <For each={todos()}>
            {(todo) => (
              <li>
                <span
                  style={{
                    "text-decoration": todo.completed ? "line-through" : "none",
                  }}
                >
                  {todo.title}
                </span>
              </li>
            )}
          </For>
        </ul>
      </Suspense>
    </main>
  );
}
```
