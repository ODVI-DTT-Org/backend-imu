# Deep Analysis: IMU Web - Lego Box Tech Stack

> **Document Purpose:** Comprehensive technical analysis of the Lego Box microfrontend architecture for IMU Web application development.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Core Technology Stack](#3-core-technology-stack)
4. [Microfrontend Architecture](#4-microfrontend-architecture)
5. [Shell Application](#5-shell-application)
6. [UI Kit Component Library](#6-ui-kit-component-library)
7. [PocketBase Backend](#7-pocketbase-backend)
8. [Authentication & Authorization](#8-authentication--authorization)
9. [Migration System](#9-migration-system)
10. [Development Workflow](#10-development-workflow)
11. [Build & Configuration](#11-build--configuration)
12. [Security Considerations](#12-security-considerations)
13. [Extensibility Guide](#13-extensibility-guide)
14. [Best Practices](#14-best-practices)
15. [Troubleshooting Guide](#15-troubleshooting-guide)

---

## 1. Executive Summary

### What is Lego Box?

**Lego Box** is a custom microfrontend framework built on top of **Piral** (v1.9.2), designed to enable modular, scalable web application development. The name reflects the "building blocks" philosophy—each microfrontend (pilet) is a self-contained module that snaps into the main shell application.

### Key Benefits

| Benefit | Description |
|---------|-------------|
| **Modularity** | Independent development and deployment of features |
| **Scalability** | Teams can work on pilets without conflicts |
| **Reusability** | Shared UI kit and services across all pilets |
| **Flexibility** | Easy to add, remove, or update features |
| **Type Safety** | Full TypeScript support throughout |

### Target Use Case

IMU Web uses Lego Box to build a **field agent management system** with features like:
- Client management
- Itinerary planning
- Touchpoint tracking
- Reporting dashboards

---

## 2. Architecture Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        LEGO BOX ECOSYSTEM                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    SHELL APPLICATION                     │   │
│  │                  @lego-box/shell@1.0.24                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │   │
│  │  │    Auth     │  │  Routing    │  │   PocketBase    │  │   │
│  │  │   Service   │  │   (React    │  │   Connection    │  │   │
│  │  │  (CASL)     │  │   Router)   │  │                 │  │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                     SHARED API                           │   │
│  │  • api.pocketbase  • api.auth  • context.registerPage   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│            ┌─────────────────┼─────────────────┐               │
│            ▼                 ▼                 ▼               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │    Pilet A   │  │    Pilet B   │  │    Pilet C   │         │
│  │   (Clients)  │  │  (Itinerary) │  │   (Reports)  │         │
│  └──────────────┘  └──────────────┘  └──────────────┘         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
              ┌───────────────────────────┐
              │        PocketBase         │
              │     (Backend BaaS)        │
              │       Port 8090           │
              └───────────────────────────┘
```

### Directory Structure

```
imu-web/
├── package.json                    # Root workspace configuration
├── pnpm-workspace.yaml             # Workspace definition
├── tsconfig.base.json              # Base TypeScript config
├── .env / .env.example             # Environment variables
│
├── scripts/                        # Development & automation scripts
│   ├── dev-all-pilets.js          # Main development orchestrator
│   ├── run-migrations.js          # Database migration runner
│   ├── discover-pilets.js         # Auto-discover pilets
│   ├── dev-multiple-pilets.js     # Multi-pilet dev mode
│   └── kill-ports.js              # Process cleanup utility
│
├── packages/                       # Internal shared packages
│   ├── ui-kit/                    # Custom UI components
│   │   ├── src/
│   │   │   ├── components/        # React components
│   │   │   │   └── *.tsx
│   │   │   ├── index.ts           # Public exports
│   │   │   └── index.css          # Global styles
│   │   └── package.json
│   │
│   └── create-pilet/              # Pilet scaffolding CLI
│       ├── src/
│       │   └── index.js
│       └── package.json
│
├── pilets/                        # Microfrontend applications
│   └── my-pilet/                  # Example pilet
│       ├── src/
│       │   ├── index.tsx          # Pilet registration
│       │   └── pages/             # Page components
│       │       └── *.tsx
│       ├── package.json
│       ├── webpack.config.js      # Custom webpack config
│       └── tailwind.config.js     # Tailwind configuration
│
└── migrations/                    # Database migrations
    └── _sample_migration.js.example
```

---

## 3. Core Technology Stack

### Version Matrix

| Technology | Version | Purpose |
|------------|---------|---------|
| **Piral** | 1.9.2 | Microfrontend framework |
| **React** | 18.2.0 | UI library |
| **TypeScript** | 5.3.3 | Type safety |
| **Tailwind CSS** | 3.4.0 | Styling |
| **PocketBase** | 0.21.0 | Backend-as-a-Service |
| **pnpm** | workspace | Package manager |
| **Webpack** | 5.x | Module bundler (pilets) |
| **Vite** | 5.x | Build tool (shell) |

### Dependency Categories

#### Production Dependencies

```json
{
  "dependencies": {
    // Piral Framework
    "piral-core": "1.9.2",
    "piral-auth": "1.5.0",

    // React Ecosystem
    "react": "18.2.0",
    "react-dom": "18.2.0",
    "react-router-dom": "6.x",

    // UI & Styling
    "tailwindcss": "3.4.0",
    "class-variance-authority": "0.7.0",
    "lucide-react": "0.400.0",
    "tailwind-merge": "2.2.0",
    "clsx": "2.x",

    // Backend & Auth
    "pocketbase": "0.21.0",
    "@casl/ability": "6.8.0",
    "@casl/react": "3.1.1"
  }
}
```

#### Development Dependencies

```json
{
  "devDependencies": {
    // TypeScript
    "typescript": "5.3.3",
    "@types/react": "18.x",
    "@types/react-dom": "18.x",

    // Build Tools
    "vite": "5.x",
    "webpack": "5.x",
    "webpack-cli": "5.x",
    "ts-loader": "9.x",

    // Piral CLI
    "piral-cli": "1.9.2",
    "piral-cli-webpack5": "1.9.2"
  }
}
```

---

## 4. Microfrontend Architecture

### What is a Pilet?

A **pilet** is a self-contained microfrontend module that:
- Has its own `package.json` and dependencies
- Registers pages, menus, and components with the shell
- Can be developed, tested, and deployed independently
- Communicates with other pilets through the shared API

### Pilet Structure

```
pilets/my-pilet/
├── package.json              # Pilet metadata & dependencies
├── webpack.config.js         # Custom webpack configuration
├── tailwind.config.js        # Tailwind CSS configuration
├── tsconfig.json             # TypeScript configuration
└── src/
    ├── index.tsx             # Entry point - registers with shell
    ├── pages/                # Page components
    │   ├── Dashboard.tsx
    │   └── Detail.tsx
    └── components/           # Pilet-specific components
        └── Widget.tsx
```

### Pilet Package Configuration

```json
{
  "name": "@imu/pilet-clients",
  "version": "1.0.0",
  "piral": {
    "name": "@lego-box/shell",
    "dependencies": {
      "@lego-box/shell": "1.0.24"
    }
  },
  "dependencies": {
    "@lego-box/ui-kit": "workspace:*",
    "react": "18.2.0"
  },
  "scripts": {
    "dev": "pilet debug --port 9001",
    "build": "pilet build"
  }
}
```

### Pilet Registration Pattern

```tsx
// src/index.tsx
import { PiletApi } from '@lego-box/shell';
import { ClientsList } from './pages/ClientsList';
import { ClientDetail } from './pages/ClientDetail';

export function setup(api: PiletApi) {
  // Register pages
  api.registerPage('/clients', ClientsList);
  api.registerPage('/clients/:id', ClientDetail);

  // Register sidebar menu
  api.registerMenu({
    name: 'clients-menu',
    label: 'Clients',
    href: '/clients',
    icon: 'users'
  });

  // Register protected page with RBAC
  const context = api.getContext();
  context.registerProtectedPage('/clients', ClientsList, {
    action: 'read',
    subject: 'clients'
  });
}
```

---

## 5. Shell Application

### Shell Responsibilities

The shell (`@lego-box/shell@1.0.24`) is the orchestrator that provides:

1. **Application Container** - Hosts all pilets
2. **Routing** - React Router with dynamic route registration
3. **Authentication** - Login/logout flow with PocketBase
4. **Authorization** - CASL-based RBAC
5. **State Management** - Shared state via Piral API
6. **Layout** - Sidebar navigation, header, footer

### Shell Exposed API

```typescript
interface PiletApi {
  // PocketBase Integration
  pocketbase: PocketBase;

  // Authentication
  auth: {
    getId(): string | null;
    getEmail(): string | null;
    getUser(): User | null;
    can(action: string, subject: string): boolean;
    login(email: string, password: string): Promise<void>;
    logout(): void;
    isAuthenticated(): boolean;
  };

  // Page Registration
  registerPage(route: string, component: ComponentType): void;

  // Menu Registration
  registerMenu(item: MenuItem): void;

  // Context Access
  getContext(): ShellContext;
}

interface ShellContext {
  registerProtectedPage(
    route: string,
    component: ComponentType,
    options: { action: string; subject: string }
  ): void;

  registerSidebarMenu(item: MenuItem): void;
}
```

### Shell Configuration

```typescript
// Shell main entry (conceptual)
const shellConfig = {
  // PocketBase connection
  pocketbaseUrl: import.meta.env.VITE_POCKETBASE_URL,

  // App metadata
  app: {
    name: import.meta.env.VITE_APP_NAME || 'IMU',
    identifier: import.meta.env.VITE_APP_IDENTIFIER || 'imu-default'
  },

  // Routes
  routes: {
    public: ['/login', '/forgot-password'],
    protected: ['/'] // All others require auth
  }
};
```

---

## 6. UI Kit Component Library

### Component Categories

The UI Kit (`@lego-box/ui-kit`) provides pre-built components:

| Category | Components |
|----------|------------|
| **Layout** | `Card`, `Container`, `Grid`, `Stack` |
| **Forms** | `Button`, `Input`, `Select`, `Checkbox`, `Radio`, `TextArea` |
| **Feedback** | `Dialog`, `Toast`, `Alert`, `Spinner` |
| **Navigation** | `Tabs`, `Breadcrumb`, `Pagination` |
| **Data Display** | `Table`, `Badge`, `Avatar`, `Tag` |

### Component Design Pattern

Components use **class-variance-authority (CVA)** for variant management:

```tsx
// Button component example
import { cva, type VariantProps } from 'class-variance-authority';

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center rounded-md font-medium transition-colors',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary/90',
        secondary: 'bg-secondary text-white hover:bg-secondary/90',
        outline: 'border border-input bg-background hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive: 'bg-destructive text-white hover:bg-destructive/90'
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-base',
        lg: 'h-12 px-6 text-lg'
      }
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md'
    }
  }
);

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}

export function Button({ variant, size, children, ...props }: ButtonProps) {
  return (
    <button className={buttonVariants({ variant, size })} {...props}>
      {children}
    </button>
  );
}
```

### Using UI Kit in Pilets

```tsx
import { Button, Card, Input, Dialog } from '@lego-box/ui-kit';

function MyPage() {
  return (
    <Card>
      <Input label="Name" placeholder="Enter name" />
      <Button variant="primary">Submit</Button>
    </Card>
  );
}
```

### Extending UI Kit

Add custom components in `packages/ui-kit/src/components/`:

```tsx
// packages/ui-kit/src/components/ClientCard.tsx
import { Card } from './Card';

interface ClientCardProps {
  client: {
    name: string;
    type: string;
  };
}

export function ClientCard({ client }: ClientCardProps) {
  return (
    <Card>
      <h3>{client.name}</h3>
      <Badge>{client.type}</Badge>
    </Card>
  );
}
```

Export from `packages/ui-kit/src/components/index.ts`:

```typescript
export * from './ClientCard';
```

---

## 7. PocketBase Backend

### What is PocketBase?

**PocketBase** is an open-source backend-as-a-Service (BaaS) that provides:
- SQLite database with real-time subscriptions
- Authentication (email/password, OAuth2)
- File storage
- Admin dashboard (http://localhost:8090/_/)

### Connection Pattern

```typescript
// Shell provides the PocketBase instance
import PocketBase from 'pocketbase';

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);

// Exposed to pilets via API
api.pocketbase.collection('clients').getList(1, 50);
```

### CRUD Operations

```typescript
// Create
await api.pocketbase.collection('clients').create({
  firstName: 'John',
  lastName: 'Doe',
  clientType: 'EXISTING'
});

// Read (list)
const result = await api.pocketbase.collection('clients').getList(1, 50, {
  filter: 'clientType = "EXISTING"',
  sort: '-created'
});

// Read (single)
const client = await api.pocketbase.collection('clients').getOne('RECORD_ID');

// Update
await api.pocketbase.collection('clients').update('RECORD_ID', {
  firstName: 'Jane'
});

// Delete
await api.pocketbase.collection('clients').delete('RECORD_ID');
```

### Real-time Subscriptions

```typescript
// Subscribe to changes
api.pocketbase.collection('clients').subscribe('*', (e) => {
  if (e.action === 'create') {
    console.log('New client:', e.record);
  }
  if (e.action === 'update') {
    console.log('Updated client:', e.record);
  }
  if (e.action === 'delete') {
    console.log('Deleted client:', e.record);
  }
});

// Unsubscribe
api.pocketbase.collection('clients').unsubscribe();
```

### Collection Schema Example

```javascript
// Migration: creating a collection
await context.createCollection('clients', {
  name: 'clients',
  type: 'base',
  schema: [
    { name: 'firstName', type: 'text', required: true },
    { name: 'lastName', type: 'text', required: true },
    { name: 'clientType', type: 'select', options: { values: ['POTENTIAL', 'EXISTING'] } },
    { name: 'productType', type: 'text' },
    { name: 'isStarred', type: 'bool', required: false }
  ],
  indexes: ['CREATE INDEX idx_clients_type ON clients (clientType)']
});
```

---

## 8. Authentication & Authorization

### Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Login     │────▶│  PocketBase │────▶│   Session   │
│    Page     │     │   Auth API  │     │   Created   │
└─────────────┘     └─────────────┘     └─────────────┘
                                               │
                                               ▼
                     ┌─────────────────────────────────┐
                     │     Shell Stores User Data      │
                     │  • User ID                      │
                     │  • Email                        │
                     │  • Role                         │
                     │  • Permissions                  │
                     └─────────────────────────────────┘
```

### Using Auth in Pilets

```tsx
import { useAuth } from '@lego-box/shell';

function MyComponent() {
  const { user, isAuthenticated, can } = useAuth();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return (
    <div>
      <h1>Welcome, {user.email}</h1>

      {can('create', 'clients') && (
        <Button>Create Client</Button>
      )}
    </div>
  );
}
```

### RBAC Permission Format

Permissions follow the pattern: `action:collection`

| Permission | Description |
|------------|-------------|
| `read:clients` | Can view clients |
| `create:clients` | Can create new clients |
| `update:clients` | Can edit existing clients |
| `delete:clients` | Can delete clients |
| `manage:users` | Can manage users (admin) |

### Protecting Pages

```tsx
// In pilet setup
context.registerProtectedPage('/clients', ClientsPage, {
  action: 'read',
  subject: 'clients'
});

// Or inline check
if (!api.auth.can('read', 'clients')) {
  return <AccessDenied />;
}
```

### CASL Ability Configuration

```typescript
// Shell defines abilities based on user role
import { AbilityBuilder, createMongoAbility } from '@casl/ability';

function defineAbilitiesFor(user) {
  const { can, cannot, build } = new AbilityBuilder(createMongoAbility);

  if (user.role === 'admin') {
    can('manage', 'all');
  }

  if (user.role === 'agent') {
    can('read', 'clients');
    can('create', 'clients');
    can('update', 'clients');
    cannot('delete', 'clients');
  }

  return build();
}
```

---

## 9. Migration System

### Migration File Format

Migrations are JavaScript files with `up()` and `down()` functions:

```javascript
// migrations/1700000000000_create_clients.js

/**
 * @param {MigrationContext} context
 */
export async function up(context) {
  await context.createCollection('clients', {
    name: 'clients',
    type: 'base',
    schema: [
      {
        name: 'firstName',
        type: 'text',
        required: true
      },
      {
        name: 'lastName',
        type: 'text',
        required: true
      },
      {
        name: 'clientType',
        type: 'select',
        required: true,
        options: {
          values: ['POTENTIAL', 'EXISTING']
        }
      }
    ]
  });

  // Seed initial data
  await context.insertRecord('clients', {
    firstName: 'John',
    lastName: 'Doe',
    clientType: 'EXISTING'
  });
}

/**
 * @param {MigrationContext} context
 */
export async function down(context) {
  await context.deleteCollection('clients');
}
```

### Migration Context API

```typescript
interface MigrationContext {
  // Collection management
  createCollection(name: string, schema: CollectionSchema): Promise<void>;
  updateCollection(name: string, updates: Partial<CollectionSchema>): Promise<void>;
  deleteCollection(name: string): Promise<void>;

  // Record management
  insertRecord(collection: string, data: object): Promise<Record>;
  updateRecord(collection: string, id: string, data: object): Promise<void>;
  deleteRecord(collection: string, id: string): Promise<void>;

  // Query
  getRecords(collection: string, filter?: string): Promise<Record[]>;

  // Index management
  createIndex(collection: string, index: string): Promise<void>;
  dropIndex(collection: string, indexName: string): Promise<void>;
}
```

### Migration Naming Convention

```
{timestamp}_{action}_{target}.js

Examples:
├── 1700000000001_create_clients.js
├── 1700000000002_add_client_indexes.js
├── 1700000000003_seed_client_data.js
└── 1700000000004_create_touchpoints.js
```

### Running Migrations

```bash
# Migrations run automatically before dev
pnpm dev

# Or manually
pnpm migrate

# Or via script
node scripts/run-migrations.js
```

---

## 10. Development Workflow

### Available Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `pnpm dev` | Start shell + all pilets with migrations |
| `dev:all` | `pnpm dev:all` | Alternative dev mode (all pilets on port 9000) |
| `build` | `pnpm build` | Build UI kit |
| `migrate` | `pnpm migrate` | Run database migrations |
| `create:pilet` | `pnpm create:pilet` | Scaffold new pilet |
| `update:all` | `pnpm update:all` | Update all dependencies |

### Development Server Ports

| Component | Port |
|-----------|------|
| Shell | 1234 |
| Pilet 1 | 9001 |
| Pilet 2 | 9002 |
| Pilet N | 900N |
| PocketBase | 8090 |

### Starting Development

```bash
# 1. Navigate to project
cd imu-web

# 2. Install dependencies
pnpm install

# 3. Set up environment
cp .env.example .env
# Edit .env with your configuration

# 4. Start development (shell + pilets + migrations)
pnpm dev
```

### Hot Reload Behavior

- **Shell changes**: Full reload
- **Pilet changes**: Hot module replacement (HMR)
- **UI Kit changes**: Rebuild required (`pnpm build`)
- **Migrations**: Run on next `pnpm dev`

### Creating a New Pilet

```bash
# Using the scaffold script
pnpm create:pilet

# Follow prompts:
# - Enter pilet name (e.g., "reports")
# - Select template
# - Pilet created in pilets/reports/
```

Manual creation:

```bash
# 1. Create directory
mkdir -p pilets/my-feature/src/pages

# 2. Create package.json
cat > pilets/my-feature/package.json << 'EOF'
{
  "name": "@imu/pilet-my-feature",
  "version": "1.0.0",
  "main": "dist/index.js",
  "piral": {
    "name": "@lego-box/shell",
    "dependencies": {}
  },
  "dependencies": {
    "@lego-box/ui-kit": "workspace:*",
    "react": "18.2.0"
  },
  "scripts": {
    "dev": "pilet debug --port 9003",
    "build": "pilet build"
  }
}
EOF

# 3. Create entry file
cat > pilets/my-feature/src/index.tsx << 'EOF'
import { PiletApi } from '@lego-box/shell';

export function setup(api: PiletApi) {
  console.log('My Feature pilet loaded!');
}
EOF

# 4. Install dependencies
pnpm install
```

---

## 11. Build & Configuration

### Webpack Configuration (Pilets)

```javascript
// pilets/my-pilet/webpack.config.js
module.exports = {
  entry: './src/index.tsx',
  output: {
    filename: 'index.js',
    libraryTarget: 'system'  // Required for Piral
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader', 'postcss-loader']
      }
    ]
  },
  externals: {
    react: 'react',
    'react-dom': 'react-dom'
  },
  devServer: {
    port: 9001,
    headers: {
      'Access-Control-Allow-Origin': '*',  // CORS for shell
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'X-Requested-With, content-type, Authorization'
    }
  }
};
```

### TypeScript Configuration

```json
// tsconfig.base.json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

### Tailwind Configuration

```javascript
// tailwind.config.js
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx}',
    './packages/ui-kit/src/**/*.{js,ts,jsx,tsx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Using CSS variables for theming
        primary: 'hsl(var(--primary))',
        secondary: 'hsl(var(--secondary))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: 'hsl(var(--muted))',
        accent: 'hsl(var(--accent))',
        destructive: 'hsl(var(--destructive))',
        border: 'hsl(var(--border))'
      }
    }
  },
  plugins: []
};
```

### CSS Variables (Theme)

```css
/* packages/ui-kit/src/index.css */
:root {
  --primary: 222.2 47.4% 11.2%;
  --secondary: 210 40% 96.1%;
  --background: 0 0% 100%;
  --foreground: 222.2 47.4% 11.2%;
  --muted: 210 40% 96.1%;
  --accent: 210 40% 96.1%;
  --destructive: 0 84.2% 60.2%;
  --border: 214.3 31.8% 91.4%;
}

.dark {
  --primary: 210 40% 98%;
  --secondary: 222.2 47.4% 11.2%;
  --background: 222.2 47.4% 11.2%;
  --foreground: 210 40% 98%;
  --muted: 217.2 32.6% 17.5%;
  --accent: 217.2 32.6% 17.5%;
  --destructive: 0 62.8% 30.6%;
  --border: 217.2 32.6% 17.5%;
}
```

---

## 12. Security Considerations

### Authentication Security

- **Session Management**: PocketBase handles sessions with secure HTTP-only cookies
- **Token Refresh**: Automatic token refresh before expiration
- **Logout**: Clears all session data from client

### RBAC Implementation

```
User → Role → Permissions → Ability

Example:
  user@example.com → agent → [read:clients, create:clients] → CASL Ability
```

### CORS Configuration

Development CORS is permissive (`*`). Production requires:

```javascript
// Production CORS
{
  "Access-Control-Allow-Origin": "https://your-domain.com",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
}
```

### PocketBase Security Rules

```javascript
// Collection API rules
{
  "listRule": "@request.auth.id != ''",           // Authenticated users
  "viewRule": "@request.auth.id != ''",
  "createRule": "@request.auth.role = 'admin'",   // Admins only
  "updateRule": "@request.auth.id = user",        // Own records
  "deleteRule": "@request.auth.role = 'admin'"
}
```

### Environment Variables

Never commit sensitive values:

```env
# .env (git-ignored)
VITE_POCKETBASE_URL=http://127.0.0.1:8090
POCKETBASE_ADMIN_EMAIL=admin@example.com
POCKETBASE_ADMIN_PASSWORD=secure_password_here
```

---

## 13. Extensibility Guide

### Adding New Features

1. **Create a new pilet** for isolated features
2. **Extend UI Kit** for shared components
3. **Add migrations** for database changes
4. **Register routes and menus** in pilet setup

### Integration Points

| Extension Point | Method | Example |
|-----------------|--------|---------|
| New page | `api.registerPage()` | Dashboard, Settings |
| New menu item | `api.registerMenu()` | Sidebar navigation |
| Protected route | `context.registerProtectedPage()` | Admin pages |
| Shared component | UI Kit export | Custom cards, forms |
| Database schema | Migration | New collections |

### Communication Between Pilets

Pilets should communicate via:
1. **Shared state** (PocketBase collections)
2. **Events** (Piral's event system)
3. **URL parameters** (navigation)

```typescript
// Pilet A emits event
api.emit('client-selected', { clientId: '123' });

// Pilet B listens for event
api.on('client-selected', (data) => {
  console.log('Selected:', data.clientId);
});
```

---

## 14. Best Practices

### Code Organization

```
pilets/clients/
├── src/
│   ├── index.tsx           # Registration only
│   ├── pages/              # Route components
│   │   ├── ClientsList.tsx
│   │   └── ClientDetail.tsx
│   ├── components/         # Pilet-specific components
│   │   └── ClientCard.tsx
│   ├── hooks/              # Custom hooks
│   │   └── useClients.ts
│   └── types/              # TypeScript types
│       └── client.ts
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Pilet | `@imu/pilet-{name}` | `@imu/pilet-clients` |
| Component | PascalCase | `ClientCard` |
| Hook | camelCase with `use` | `useClients` |
| Collection | snake_case | `client_touchpoints` |
| Migration | `{timestamp}_{action}_{target}` | `1700000000000_create_clients` |

### Performance Tips

1. **Lazy load pages** - Use `React.lazy()` for route components
2. **Optimize images** - Compress before storing in PocketBase
3. **Limit subscriptions** - Unsubscribe when components unmount
4. **Use pagination** - Don't fetch all records at once

```typescript
// Good: Paginated query
const result = await api.pocketbase.collection('clients').getList(1, 20);

// Bad: Fetching all
const allClients = await api.pocketbase.collection('clients').getFullList();
```

### Error Handling

```typescript
try {
  await api.pocketbase.collection('clients').create(data);
} catch (error) {
  if (error.status === 400) {
    // Validation error
    console.error('Validation failed:', error.data);
  } else if (error.status === 403) {
    // Permission denied
    console.error('Not authorized');
  } else {
    // Generic error
    console.error('Failed to create client:', error.message);
  }
}
```

---

## 15. Troubleshooting Guide

### Common Issues

#### Pilet not loading

```bash
# Check pilet is running
curl http://localhost:9001/index.js

# Check CORS headers
curl -I http://localhost:9001/index.js
# Should include: Access-Control-Allow-Origin: *
```

#### PocketBase connection failed

```bash
# Check PocketBase is running
curl http://localhost:8090/api/health

# Check environment variable
echo $VITE_POCKETBASE_URL
```

#### Migration errors

```bash
# Check migration syntax
node -c migrations/your_migration.js

# Reset PocketBase (development only!)
rm -rf pb_data/
```

#### Authentication issues

```typescript
// Debug auth state
console.log('Auth ID:', api.auth.getId());
console.log('Auth Email:', api.auth.getEmail());
console.log('Is Authenticated:', api.auth.isAuthenticated());
```

### Debug Commands

```bash
# List all running processes on project ports
lsof -i :1234  # Shell
lsof -i :9001  # Pilet
lsof -i :8090  # PocketBase

# Kill processes on specific ports
node scripts/kill-ports.js

# Check pnpm workspace
pnpm list --depth 0
```

### Useful Logs

```typescript
// Enable Piral debug mode
localStorage.setItem('piral:debug', 'true');

// Log API availability
console.log('Available API:', Object.keys(api));
console.log('PocketBase:', api.pocketbase);
console.log('Auth methods:', Object.keys(api.auth));
```

---

## Appendix A: Quick Reference

### File Structure Cheat Sheet

```
imu-web/
├── package.json          # Scripts, root dependencies
├── pnpm-workspace.yaml   # Workspace packages
├── .env                  # Environment variables
├── scripts/              # Dev automation
├── packages/
│   └── ui-kit/           # Shared components
├── pilets/               # Microfrontends
│   └── {name}/
│       ├── src/index.tsx # Entry point
│       └── package.json  # Pilet config
└── migrations/           # DB migrations
```

### API Quick Reference

```typescript
// PocketBase CRUD
api.pocketbase.collection('name').create(data)
api.pocketbase.collection('name').getList(page, perPage, options?)
api.pocketbase.collection('name').getOne(id)
api.pocketbase.collection('name').update(id, data)
api.pocketbase.collection('name').delete(id)

// Auth
api.auth.login(email, password)
api.auth.logout()
api.auth.getId()
api.auth.can(action, subject)

// Registration
api.registerPage(path, component)
api.registerMenu(menuItem)
context.registerProtectedPage(path, component, { action, subject })
```

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_POCKETBASE_URL` | Yes | `http://127.0.0.1:8090` | PocketBase server URL |
| `POCKETBASE_ADMIN_EMAIL` | For migrations | - | Admin email |
| `POCKETBASE_ADMIN_PASSWORD` | For migrations | - | Admin password |
| `VITE_APP_NAME` | No | `IMU` | Application name |
| `VITE_APP_IDENTIFIER` | No | `imu-default` | App identifier |

---

## Appendix B: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2024-01 | Initial Lego Box setup |
| 1.0.24 | Current | Shell with PocketBase, CASL RBAC |

---

## Appendix C: Related Resources

- **Piral Documentation**: https://docs.piral.io/
- **PocketBase Documentation**: https://pocketbase.io/docs/
- **CASL Documentation**: https://casl.js.org/v6/en/
- **Tailwind CSS**: https://tailwindcss.com/docs
- **React Router**: https://reactrouter.com/

---

*Document Version: 1.0.0*
*Last Updated: 2025-02-20*
*Author: Claude Code Analysis*
