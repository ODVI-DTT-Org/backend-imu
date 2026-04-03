# IMU Vue Admin Dashboard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Vue 3 admin dashboard for managing IMU field agents, clients, and users with PocketBase backend.

**Architecture:** Single-page Vue 3 application with Pinia state management, Vue Router for navigation, Tailwind CSS + HeadlessUI for styling, and PocketBase for backend/auth. Desktop-first admin UI with sidebar navigation.

**Tech Stack:** Vue 3, TypeScript, Vite, Tailwind CSS, HeadlessUI, Pinia, TanStack Table, Zod, Vue Router 4, PocketBase

---

## Phase 1: Project Setup & Authentication

### Task 1: Create Vue 3 Project with Vite

**Files:**
- Create: `imu-web-vue/package.json`
- Create: `imu-web-vue/vite.config.ts`
- Create: `imu-web-vue/tsconfig.json`
- Create: `imu-web-vue/tsconfig.node.json`
- Create: `imu-web-vue/index.html`
- Create: `imu-web-vue/src/main.ts`
- Create: `imu-web-vue/src/App.vue`
- Create: `imu-web-vue/src/vite-env.d.ts`

**Step 1: Create project directory and initialize**

Run:
```bash
cd C:\odvi-apps\IMU
mkdir imu-web-vue
cd imu-web-vue
pnpm init
```

**Step 2: Install core dependencies**

Run:
```bash
pnpm add vue vue-router pinia pocketbase zod @tanstack/vue-table
pnpm add -D vite @vitejs/plugin-vue typescript vue-tsc tailwindcss postcss autoprefixer @headlessui/vue
```

**Step 3: Create package.json with scripts**

```json
{
  "name": "imu-web-vue",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint . --ext .vue,.js,.jsx,.cjs,.mjs,.ts,.tsx,.cts,.mts --fix"
  },
  "dependencies": {
    "@headlessui/vue": "^1.7.22",
    "@tanstack/vue-table": "^8.20.5",
    "pinia": "^2.2.6",
    "pocketbase": "^0.22.1",
    "vue": "^3.5.13",
    "vue-router": "^4.4.5",
    "zod": "^3.24.1"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.2.1",
    "autoprefixer": "^10.4.20",
    "postcss": "^8.4.49",
    "tailwindcss": "^3.4.17",
    "typescript": "~5.6.3",
    "vite": "^6.0.6",
    "vue-tsc": "^2.2.0"
  }
}
```

**Step 4: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 3000
  }
})
```

**Step 5: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "preserve",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.vue"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

**Step 6: Create tsconfig.node.json**

```json
{
  "compilerOptions": {
    "composite": true,
    "skipLibCheck": true,
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true
  },
  "include": ["vite.config.ts"]
}
```

**Step 7: Create index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <link rel="icon" type="image/svg+xml" href="/vite.svg">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>IMU Admin</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

**Step 8: Create src/main.ts**

```typescript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './styles/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
```

**Step 9: Create src/App.vue**

```vue
<script setup lang="ts">
import { RouterView } from 'vue-router'
</script>

<template>
  <RouterView />
</template>
```

**Step 10: Create src/vite-env.d.ts**

```typescript
/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue'
  const component: DefineComponent<{}, {}, any>
  export default component
}

interface ImportMetaEnv {
  readonly VITE_POCKETBASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

**Step 11: Verify project starts**

Run:
```bash
pnpm install
pnpm dev
```

Expected: Dev server starts at http://localhost:3000 (may show error about missing router/styles - that's OK)

**Step 12: Commit**

```bash
git add imu-web-vue/
git commit -m "feat: initialize Vue 3 project with Vite and TypeScript

- Set up Vite with Vue plugin
- Configure TypeScript
- Add core dependencies (Vue, Pinia, Vue Router, PocketBase)
- Create basic project structure

Slice 1.1 - Walking Skeleton (partial)"
```

---

### Task 2: Configure Tailwind CSS with IMU Brand

**Files:**
- Create: `imu-web-vue/tailwind.config.js`
- Create: `imu-web-vue/postcss.config.js`
- Create: `imu-web-vue/src/styles/main.css`

**Step 1: Create tailwind.config.js**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#FFF7ED',
          100: '#FFEDD5',
          200: '#FED7AA',
          300: '#FDBA74',
          400: '#FB923C',
          500: '#F97316',
          600: '#EA580C',
          700: '#C2410C',
          800: '#9A3412',
          900: '#7C2D12',
        },
        secondary: {
          50: '#EFF6FF',
          100: '#DBEAFE',
          200: '#BFDBFE',
          300: '#93C5FD',
          400: '#60A5FA',
          500: '#1E40AF',
          600: '#1E3A8A',
          700: '#1E3A8A',
          800: '#1E3A8A',
          900: '#172554',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
```

**Step 2: Create postcss.config.js**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

**Step 3: Create src/styles/main.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom base styles */
@layer base {
  html {
    @apply antialiased;
  }

  body {
    @apply bg-neutral-50 text-neutral-900 font-sans;
  }
}

/* Custom component styles */
@layer components {
  .btn {
    @apply inline-flex items-center justify-center px-4 py-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2;
  }

  .btn-primary {
    @apply btn bg-secondary-500 text-white hover:bg-secondary-600 focus:ring-secondary-500;
  }

  .btn-secondary {
    @apply btn border-2 border-primary-500 text-primary-500 hover:bg-primary-50 focus:ring-primary-500;
  }

  .btn-danger {
    @apply btn bg-red-600 text-white hover:bg-red-700 focus:ring-red-500;
  }

  .btn-ghost {
    @apply btn text-neutral-600 hover:bg-neutral-100 focus:ring-neutral-500;
  }

  .input {
    @apply w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent;
  }

  .input-error {
    @apply input border-red-500 focus:ring-red-500;
  }

  .label {
    @apply block text-sm font-medium text-neutral-700 mb-1;
  }

  .error-text {
    @apply text-sm text-red-600 mt-1;
  }

  .card {
    @apply bg-white rounded-lg border border-neutral-200 shadow-sm;
  }
}
```

**Step 4: Verify styles work**

Run:
```bash
pnpm dev
```

Expected: No CSS-related errors in console

**Step 5: Commit**

```bash
git add imu-web-vue/tailwind.config.js imu-web-vue/postcss.config.js imu-web-vue/src/styles/main.css
git commit -m "feat: configure Tailwind CSS with IMU brand colors

- Add orange primary (#F97316) and blue secondary (#1E40AF)
- Configure Inter font family
- Add base and component utility classes

Slice 1.1 - Walking Skeleton (partial)"
```

---

### Task 3: Create PocketBase Client and Environment

**Files:**
- Create: `imu-web-vue/.env`
- Create: `imu-web-vue/.env.example`
- Create: `imu-web-vue/src/lib/pocketbase.ts`
- Create: `imu-web-vue/src/lib/types.ts`

**Step 1: Create .env file**

```env
VITE_POCKETBASE_URL=http://localhost:8090
```

**Step 2: Create .env.example**

```env
VITE_POCKETBASE_URL=http://localhost:8090
```

**Step 3: Create src/lib/types.ts**

```typescript
// User types
export interface User {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'staff';
  avatar?: string;
  created: string;
  updated: string;
}

// Agent types
export interface Agent {
  id: string;
  user_id: string;
  name: string;
  email: string;
  phone: string;
  assigned_area: string;
  status: 'active' | 'inactive';
  created: string;
  updated: string;
}

// Client types
export interface Client {
  id: string;
  first_name: string;
  last_name: string;
  middle_name?: string;
  client_type: 'POTENTIAL' | 'EXISTING';
  product_type?: string;
  market_type?: string;
  pension_type?: string;
  agency_id?: string;
  agent_id?: string;
  is_starred: boolean;
  created: string;
  updated: string;
  expand?: {
    agency_id?: Agency;
    agent_id?: Agent;
  };
}

// Supporting types
export interface Address {
  id: string;
  client_id: string;
  type: 'home' | 'work' | 'mailing';
  street: string;
  city: string;
  province: string;
  postal_code: string;
  is_primary: boolean;
}

export interface PhoneNumber {
  id: string;
  client_id: string;
  type: 'mobile' | 'landline';
  number: string;
  is_primary: boolean;
}

export interface Touchpoint {
  id: string;
  client_id: string;
  agent_id: string;
  touchpoint_number: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  type: 'Visit' | 'Call';
  reason: string;
  status: 'Interested' | 'Undecided' | 'Not Interested' | 'Completed';
  notes?: string;
  photo_path?: string;
  audio_path?: string;
  location_data?: { latitude: number; longitude: number };
  created: string;
  expand?: {
    client_id?: Client;
    agent_id?: Agent;
  };
}

export interface Agency {
  id: string;
  name: string;
  code: string;
  region: string;
  address: string;
  status: 'active' | 'inactive';
}

export interface Itinerary {
  id: string;
  agent_id: string;
  date: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface ItineraryItem {
  id: string;
  itinerary_id: string;
  client_id: string;
  order: number;
  status: 'pending' | 'visited' | 'missed';
  time_in?: string;
  time_out?: string;
  notes?: string;
}
```

**Step 4: Create src/lib/pocketbase.ts**

```typescript
import PocketBase from 'pocketbase'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL || 'http://localhost:8090')

export function usePocketBase() {
  return pb
}

export default pb
```

**Step 5: Commit**

```bash
git add imu-web-vue/.env imu-web-vue/.env.example imu-web-vue/src/lib/
git commit -m "feat: add PocketBase client and TypeScript types

- Configure PocketBase client with environment URL
- Define all data model interfaces (User, Agent, Client, etc.)
- Add .env.example for documentation

Slice 1.1 - Walking Skeleton (partial)"
```

---

### Task 4: Create Basic Router Structure

**Files:**
- Create: `imu-web-vue/src/router/index.ts`

**Step 1: Create src/router/index.ts**

```typescript
import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      redirect: '/dashboard'
    },
    {
      path: '/dashboard',
      name: 'dashboard',
      component: () => import('@/views/dashboard/DashboardView.vue'),
      meta: { title: 'Dashboard' }
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { guestOnly: true }
    }
  ]
})

export default router
```

**Step 2: Create placeholder views**

Create `src/views/dashboard/DashboardView.vue`:
```vue
<script setup lang="ts">
</script>

<template>
  <div class="p-8">
    <h1 class="text-2xl font-bold">Dashboard</h1>
    <p class="text-neutral-600 mt-2">Welcome to IMU Admin</p>
  </div>
</template>
```

Create `src/views/auth/LoginView.vue`:
```vue
<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-50">
    <div class="text-center">
      <h1 class="text-2xl font-bold">Login</h1>
      <p class="text-neutral-600 mt-2">Login page placeholder</p>
    </div>
  </div>
</template>
```

**Step 3: Verify routing works**

Run:
```bash
pnpm dev
```

Expected:
- http://localhost:3000 redirects to /dashboard
- Dashboard shows placeholder text
- No console errors

**Step 4: Commit**

```bash
git add imu-web-vue/src/router/ imu-web-vue/src/views/
git commit -m "feat: set up Vue Router with basic routes

- Configure router with dashboard and login routes
- Add placeholder views for testing
- Root path redirects to dashboard

Slice 1.1 - Walking Skeleton ✅"
```

---

### Task 5: Create Auth Store with Pinia

**Files:**
- Create: `imu-web-vue/src/stores/auth.ts`

**Step 1: Create src/stores/auth.ts**

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import pb from '@/lib/pocketbase'
import type { User } from '@/lib/types'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<User | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const isAuthenticated = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')

  // Initialize from PocketBase auth store
  if (pb.authStore.isValid && pb.authStore.model) {
    user.value = pb.authStore.model as User
  }

  // Actions
  async function login(email: string, password: string) {
    loading.value = true
    error.value = null
    try {
      const authData = await pb.collection('users').authWithPassword(email, password)
      user.value = authData.record as User
      return true
    } catch (e: any) {
      error.value = e.message || 'Login failed'
      return false
    } finally {
      loading.value = false
    }
  }

  function logout() {
    pb.authStore.clear()
    user.value = null
  }

  function can(permission: string): boolean {
    if (isAdmin.value) return true

    // Staff permissions - limited access
    const staffPermissions = [
      'view_users',
      'view_agents',
      'view_clients',
      'create_agents',
      'edit_agents',
      'create_clients',
      'edit_clients',
    ]

    return staffPermissions.includes(permission)
  }

  return {
    user,
    loading,
    error,
    isAuthenticated,
    isAdmin,
    login,
    logout,
    can
  }
})
```

**Step 2: Commit**

```bash
git add imu-web-vue/src/stores/auth.ts
git commit -m "feat: create auth store with Pinia

- Add login/logout actions
- Check PocketBase auth state on init
- Add RBAC permission checking
- Track loading and error states

Slice 1.3 - PocketBase Auth Integration (partial)"
```

---

### Task 6: Create UI Components (Button, Input)

**Files:**
- Create: `imu-web-vue/src/components/ui/Button.vue`
- Create: `imu-web-vue/src/components/ui/Input.vue`

**Step 1: Create src/components/ui/Button.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'primary',
  size: 'md',
  loading: false,
  disabled: false,
  type: 'button'
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

const buttonClasses = computed(() => {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed'

  const variants = {
    primary: 'bg-secondary-500 text-white hover:bg-secondary-600 focus:ring-secondary-500',
    secondary: 'border-2 border-primary-500 text-primary-500 hover:bg-primary-50 focus:ring-primary-500',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-neutral-600 hover:bg-neutral-100 focus:ring-neutral-500'
  }

  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm',
    lg: 'px-6 py-3 text-base'
  }

  return [base, variants[props.variant], sizes[props.size]]
})

function handleClick(event: MouseEvent) {
  if (!props.loading && !props.disabled) {
    emit('click', event)
  }
}
</script>

<template>
  <button
    :type="type"
    :class="buttonClasses"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <svg
      v-if="loading"
      class="animate-spin -ml-1 mr-2 h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
    <slot />
  </button>
</template>
```

**Step 2: Create src/components/ui/Input.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  modelValue?: string
  label?: string
  type?: 'text' | 'email' | 'password' | 'number'
  placeholder?: string
  error?: string
  disabled?: boolean
  required?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  type: 'text',
  disabled: false,
  required: false
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const inputClasses = computed(() => {
  const base = 'w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:border-transparent transition-colors'
  return props.error
    ? [base, 'border-red-500 focus:ring-red-500']
    : [base, 'border-neutral-300 focus:ring-primary-500']
})

function handleInput(event: Event) {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="w-full">
    <label v-if="label" class="block text-sm font-medium text-neutral-700 mb-1">
      {{ label }}
      <span v-if="required" class="text-red-500">*</span>
    </label>
    <input
      :type="type"
      :value="modelValue"
      :placeholder="placeholder"
      :disabled="disabled"
      :class="inputClasses"
      @input="handleInput"
    />
    <p v-if="error" class="text-sm text-red-600 mt-1">{{ error }}</p>
  </div>
</template>
```

**Step 3: Commit**

```bash
git add imu-web-vue/src/components/ui/
git commit -m "feat: create Button and Input UI components

- Button with variants (primary, secondary, danger, ghost)
- Input with label, error state, and validation styling
- Loading spinner for button
- Tailwind CSS styling

Slice 1.2 - Auth Layout & Login UI (partial)"
```

---

### Task 7: Create Login Page

**Files:**
- Modify: `imu-web-vue/src/views/auth/LoginView.vue`
- Create: `imu-web-vue/src/layouts/AuthLayout.vue`

**Step 1: Create src/layouts/AuthLayout.vue**

```vue
<script setup lang="ts">
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-50 px-4">
    <div class="w-full max-w-md">
      <slot />
    </div>
  </div>
</template>
```

**Step 2: Update src/views/auth/LoginView.vue**

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AuthLayout from '@/layouts/AuthLayout.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const authStore = useAuthStore()

const email = ref('')
const password = ref('')
const showPassword = ref(false)

async function handleLogin() {
  const success = await authStore.login(email.value, password.value)
  if (success) {
    router.push('/dashboard')
  }
}
</script>

<template>
  <AuthLayout>
    <div class="text-center mb-8">
      <!-- Logo -->
      <div class="mx-auto w-16 h-16 bg-primary-500 rounded-xl flex items-center justify-center mb-4">
        <svg class="w-10 h-10 text-white" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" fill="none" />
        </svg>
      </div>
      <h1 class="text-2xl font-bold text-neutral-900">
        Itinerary Manager
      </h1>
      <p class="text-primary-500 font-medium">Admin</p>
      <p class="text-neutral-500 text-sm mt-2">Please enter your details to login</p>
    </div>

    <form @submit.prevent="handleLogin" class="space-y-4">
      <Input
        v-model="email"
        label="Username"
        type="email"
        placeholder="Enter your email"
        :error="authStore.error && !email ? 'Email is required' : ''"
        required
      />

      <div class="relative">
        <Input
          v-model="password"
          label="Password"
          :type="showPassword ? 'text' : 'password'"
          placeholder="Enter your password"
          :error="authStore.error && !password ? 'Password is required' : ''"
          required
        />
        <button
          type="button"
          class="absolute right-3 top-8 text-neutral-400 hover:text-neutral-600"
          @click="showPassword = !showPassword"
        >
          <svg v-if="showPassword" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
          </svg>
          <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>

      <div class="text-right">
        <a href="#" class="text-sm text-secondary-500 hover:text-secondary-600">Forgot your password?</a>
      </div>

      <p v-if="authStore.error" class="text-sm text-red-600 text-center">
        {{ authStore.error }}
      </p>

      <Button
        type="submit"
        variant="primary"
        size="lg"
        class="w-full"
        :loading="authStore.loading"
      >
        LOGIN
      </Button>
    </form>
  </AuthLayout>
</template>
```

**Step 3: Commit**

```bash
git add imu-web-vue/src/layouts/ imu-web-vue/src/views/auth/
git commit -m "feat: create login page with AuthLayout

- Login form with email/password fields
- Password visibility toggle
- Forgot password link (non-functional)
- Connect to auth store for login
- IMU branding (orange logo, dark blue button)
- Loading and error states

Slice 1.2 - Auth Layout & Login UI ✅
Slice 1.3 - PocketBase Auth Integration ✅"
```

---

### Task 8: Create Admin Layout with Sidebar

**Files:**
- Create: `imu-web-vue/src/layouts/AdminLayout.vue`
- Create: `imu-web-vue/src/components/shared/Sidebar.vue`
- Create: `imu-web-vue/src/components/shared/Header.vue`

**Step 1: Create src/components/shared/Sidebar.vue**

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()

const navItems = [
  { icon: 'home', label: 'Dashboard', to: '/dashboard' },
  { icon: 'users', label: 'Users', to: '/users', permission: 'view_users' },
  { icon: 'map-pin', label: 'Agents', to: '/agents' },
  { icon: 'user', label: 'Clients', to: '/clients' },
  { icon: 'settings', label: 'Settings', to: '/settings' },
]

const visibleNavItems = computed(() => {
  return navItems.filter(item => {
    if (!item.permission) return true
    return authStore.can(item.permission)
  })
})

function isActive(to: string) {
  return route.path === to || route.path.startsWith(to + '/')
}

const icons: Record<string, string> = {
  home: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6',
  users: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z',
  'map-pin': 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  settings: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z',
}
</script>

<template>
  <aside class="w-64 bg-white border-r border-neutral-200 h-screen flex flex-col">
    <!-- Logo -->
    <div class="p-4 border-b border-neutral-200">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-primary-500 rounded-lg flex items-center justify-center">
          <svg class="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="2" fill="none" />
          </svg>
        </div>
        <div>
          <h1 class="font-bold text-neutral-900">IMU Admin</h1>
        </div>
      </div>
    </div>

    <!-- Navigation -->
    <nav class="flex-1 p-4">
      <ul class="space-y-1">
        <li v-for="item in visibleNavItems" :key="item.to">
          <router-link
            :to="item.to"
            :class="[
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
              isActive(item.to)
                ? 'bg-primary-50 text-primary-600'
                : 'text-neutral-600 hover:bg-neutral-100'
            ]"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" :d="icons[item.icon]" />
            </svg>
            {{ item.label }}
          </router-link>
        </li>
      </ul>
    </nav>

    <!-- User section -->
    <div class="p-4 border-t border-neutral-200">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 bg-secondary-500 rounded-full flex items-center justify-center text-white font-medium">
          {{ authStore.user?.name?.charAt(0)?.toUpperCase() || 'U' }}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm font-medium text-neutral-900 truncate">{{ authStore.user?.name }}</p>
          <p class="text-xs text-neutral-500 capitalize">{{ authStore.user?.role }}</p>
        </div>
        <button
          @click="authStore.logout(); router.push('/login')"
          class="p-2 text-neutral-400 hover:text-neutral-600"
          title="Logout"
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
        </button>
      </div>
    </div>
  </aside>
</template>
```

**Step 2: Create src/components/shared/Header.vue**

```vue
<script setup lang="ts">
import { useRoute } from 'vue-router'

const route = useRoute()

const pageTitle = route.meta.title || 'Page'
</script>

<template>
  <header class="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-6">
    <h1 class="text-lg font-semibold text-neutral-900">{{ pageTitle }}</h1>
    <div class="flex items-center gap-4">
      <!-- Notifications placeholder -->
      <button class="p-2 text-neutral-400 hover:text-neutral-600">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
      </button>
    </div>
  </header>
</template>
```

**Step 3: Create src/layouts/AdminLayout.vue**

```vue
<script setup lang="ts">
import Sidebar from '@/components/shared/Sidebar.vue'
import Header from '@/components/shared/Header.vue'
</script>

<template>
  <div class="flex h-screen bg-neutral-50">
    <Sidebar />
    <div class="flex-1 flex flex-col overflow-hidden">
      <Header />
      <main class="flex-1 overflow-auto p-6">
        <slot />
      </main>
    </div>
  </div>
</template>
```

**Step 4: Update router to use AdminLayout**

Update `src/router/index.ts`:
```typescript
import { createRouter, createWebHistory } from 'vue-router'
import AdminLayout from '@/layouts/AdminLayout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { guestOnly: true }
    },
    {
      path: '/',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/dashboard'
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
          meta: { title: 'Dashboard' }
        }
      ]
    }
  ]
})

export default router
```

**Step 5: Update DashboardView**

Update `src/views/dashboard/DashboardView.vue`:
```vue
<script setup lang="ts">
</script>

<template>
  <div>
    <h2 class="text-xl font-semibold mb-4">Welcome to IMU Admin</h2>
    <p class="text-neutral-600">Select a section from the sidebar to get started.</p>
  </div>
</template>
```

**Step 6: Commit**

```bash
git add imu-web-vue/src/layouts/ imu-web-vue/src/components/shared/ imu-web-vue/src/router/ imu-web-vue/src/views/
git commit -m "feat: create AdminLayout with Sidebar and Header

- Sidebar with navigation items (Dashboard, Users, Agents, Clients, Settings)
- Header with page title
- User section with logout button
- Active state highlighting for nav items
- Permission-based nav item visibility

Slice 1.4 - Admin Layout Shell ✅"
```

---

### Task 9: Add Auth Guards to Router

**Files:**
- Modify: `imu-web-vue/src/router/index.ts`

**Step 1: Add auth guards**

Update `src/router/index.ts`:
```typescript
import { createRouter, createWebHistory } from 'vue-router'
import AdminLayout from '@/layouts/AdminLayout.vue'
import { useAuthStore } from '@/stores/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/auth/LoginView.vue'),
      meta: { guestOnly: true }
    },
    {
      path: '/',
      component: AdminLayout,
      meta: { requiresAuth: true },
      children: [
        {
          path: '',
          redirect: '/dashboard'
        },
        {
          path: 'dashboard',
          name: 'dashboard',
          component: () => import('@/views/dashboard/DashboardView.vue'),
          meta: { title: 'Dashboard' }
        }
      ]
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: () => import('@/views/NotFoundView.vue')
    }
  ]
})

// Auth guard
router.beforeEach((to, from, next) => {
  const authStore = useAuthStore()

  // Update page title
  document.title = `${to.meta.title || 'Page'} | IMU Admin`

  // Guest-only routes (like login)
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return next('/dashboard')
  }

  // Protected routes
  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    return next('/login')
  }

  // Permission check
  if (to.meta.permission && !authStore.can(to.meta.permission as string)) {
    return next('/dashboard')
  }

  next()
})

export default router
```

**Step 2: Create NotFoundView**

Create `src/views/NotFoundView.vue`:
```vue
<script setup lang="ts">
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'

const router = useRouter()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-neutral-50">
    <div class="text-center">
      <h1 class="text-6xl font-bold text-neutral-300">404</h1>
      <p class="text-xl text-neutral-600 mt-4">Page not found</p>
      <p class="text-neutral-500 mt-2">The page you're looking for doesn't exist.</p>
      <Button class="mt-6" @click="router.push('/dashboard')">
        Go to Dashboard
      </Button>
    </div>
  </div>
</template>
```

**Step 3: Verify auth flow works**

Run:
```bash
pnpm dev
```

Expected:
- Visiting /dashboard when not logged in redirects to /login
- Logging in redirects to /dashboard
- Logging out redirects to /login

**Step 4: Commit**

```bash
git add imu-web-vue/src/router/index.ts imu-web-vue/src/views/NotFoundView.vue
git commit -m "feat: add auth guards to router

- Redirect unauthenticated users to login
- Redirect authenticated users away from login
- Permission-based route protection
- 404 not found page
- Page title updates based on route

Slice 1.5 - Auth Guards & Redirects ✅

Phase 1 Complete: Project Setup & Auth"
```

---

## Phase 1 Summary

Phase 1 is now complete. You have:

1. ✅ Vue 3 + Vite + TypeScript project scaffolded
2. ✅ Tailwind CSS configured with IMU brand colors
3. ✅ PocketBase client and TypeScript types
4. ✅ Pinia auth store with login/logout
5. ✅ Login page with form UI
6. ✅ Admin layout with sidebar and header
7. ✅ Auth guards protecting routes

**Next Steps:**
- Phase 2: Dashboard & Layout (Slices 2.1-2.3)
- Phase 3: Users CRUD (Slices 3.1-3.6)
- Phase 4: Agents CRUD (Slices 4.1-4.6)
- Phase 5: Clients CRUD (Slices 5.1-5.7)
- Phase 6: Polish & RBAC (Slices 6.1-6.4)

See `elephant_carpaccio_v_3.md` for remaining slice definitions.

---

*Implementation Plan v1.0 - IMU Vue Admin Dashboard*
