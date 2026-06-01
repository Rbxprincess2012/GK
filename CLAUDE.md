# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev -- --port 5174   # dev server (port 5173 is taken by another project via PM2)
npm run build                # production build
npm run lint                 # ESLint
npm run preview              # preview production build
```

## Architecture

**Frontend-only** at this stage. No backend exists yet — all data lives in Zustand stores with mock data. When the backend (Node.js + Express + PostgreSQL) is added, store actions will be replaced by API calls via `src/lib/api.js`.

### Auth flow

`src/lib/mockAuth.js` handles login locally (no real API). Credentials are stored in `localStorage`. When connecting a real backend, replace the `mockLogin()` call in `src/pages/Login.jsx` with `api.post('/auth/login', ...)`.

Three roles: `manager`, `director`, `admin`. Role `admin` is hidden from all UI except when the current user has `admin` role. Route guards are in `ProtectedRoute` inside `src/App.jsx`.

### State management

All state is in `src/store/` as Zustand stores — no persistence between page reloads:

- `driversStore` — drivers with vehicles; mock data pre-seeded
- `clientsStore` — clients with multiple addresses and tags per address
- `ordersStore` — orders with multi-point items; auto-increments `number`
- `scheduleStore` — day shift (3/3 auto-generated) and night shift (manual); keyed by `yyyy-MM-dd`
- `usersStore` — system users; generates email/password on create

### Order data model

An order contains `items[]`, each item is one pickup point:
- `action`: `'take'` (1 slot) or `'replace'` (2 slots — brings empty, takes full)
- `container_count`: multiplied by slots above
- `waste_class`: `'4'` or `'5'`
- Max 3 slots per truck; >3 means multiple trips by the same driver

### Routing

`src/App.jsx` — all routes with `ProtectedRoute` guards. Pages `/users` requires `director|admin`; `/settings` requires `admin` only.

### Layout & navigation

`src/components/layout/AppSidebar.jsx` — nav items have a `roles` field; items are filtered by `user.role`. Sidebar pункт "Пользователи" (`/users`) is only rendered for `director` and `admin`.

`src/components/layout/AppLayout.jsx` — wraps pages with `AnimatePresence` for page transitions (Motion).

### Styling

- Tailwind v4 with `@tailwindcss/vite` plugin (no `tailwind.config.js`)
- shadcn/ui components in `src/components/ui/` (Radix-based)
- Dark theme enforced via `document.documentElement.classList.add('dark')` in `src/main.jsx`
- Custom CSS variables in `src/index.css` under `:root` — oklch color space, deep navy palette, blue primary
- Utility classes `.glow-card` and `.glow-primary` defined in `src/index.css`
- Animations via `motion/react` (Motion library, not framer-motion)

### Adding shadcn components

```bash
npx shadcn@latest add --cwd "d:/Татьяна" <component-name>
```

### Path alias

`@/` maps to `src/` (configured in `vite.config.js` and `jsconfig.json`).
