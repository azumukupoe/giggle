# AGENTS.md

Guidelines for AI coding agents working on the Giggle codebase.

## Project Overview

Giggle is an event aggregation platform:
- **frontend/**: Next.js 16 (React 19, TypeScript, Tailwind CSS 4)
- **ingestion/**: Python data ingestion pipeline (Python 3.13+, Pydantic, httpx)

## Build, Lint, and Test Commands

### Frontend (Next.js)

```bash
cd frontend

npm install          # Install dependencies
npm run dev          # Development server
npm run build        # Production build
npm run start        # Start production server

# Linting
npm run lint                      # Lint all files
npx eslint path/to/file.tsx       # Lint specific file

# Type checking
npx tsc --noEmit
```

### Ingestion (Python)

```bash
cd ingestion

uv sync                           # Install dependencies
uv run main.py                    # Run ingestion pipeline
uv run main.py --source songkick  # Run specific source
uv run main.py --dry-run          # Dry run (no DB changes)
uv run main.py --debug            # Debug mode

# Type checking
uv run mypy .

# Testing (single test)
uv run pytest path/to/test_file.py::test_function_name -v
```

## Code Style Guidelines

### TypeScript/React (Frontend)

#### Imports
Order imports with blank lines between groups:
1. `"use client"` directive (if needed)
2. React/Next.js imports
3. Third-party libraries
4. Local components/utilities (use `@/` path alias)

```typescript
"use client";

import { useState, useMemo, memo, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { Event } from "@/types/event";
```

#### Components
- Use function components with arrow syntax
- Use `"use client"` for components with hooks/interactivity
- Wrap with `memo()` for performance-critical components
- Set `displayName` when using memo

```typescript
const EventCardComponent = ({ event }: { event: GroupedEvent }) => {
    const [isOpen, setIsOpen] = useState(false);
    // ...
};

export const EventCard = memo(EventCardComponent);
EventCard.displayName = "EventCard";
```

#### Types
- Define shared types in `types/` directory
- Use `interface` for object shapes
- Use inline types for component-specific props
- Arrays: `Type[]`, nullable: `Type | null`

```typescript
interface TicketButtonProps {
    ev: Event;
    getDomain: (url: string) => string | null;
}
```

#### Naming
- Components: PascalCase (`EventCard.tsx`)
- Utilities/hooks: camelCase (`eventUtils.ts`)
- Constants: SCREAMING_SNAKE_CASE

#### Formatting
- 4-space indentation
- Use template literals for string interpolation
- Prefer early returns for guard clauses
- Use `useMemo` and `useCallback` for expensive computations

### Python (Ingestion)

#### Imports
Order imports with blank lines between groups:
1. Standard library
2. Third-party packages
3. Local modules (absolute imports: `from ingestion.module import ...`)

```python
from abc import ABC, abstractmethod
from typing import List, Optional

from pydantic import BaseModel
import httpx

from ingestion.models import Event
```

#### Type Hints
Always use type hints for parameters and return types:

```python
def get_events(self, query: str = None) -> List[Event]:
    """Fetch events by query."""
    pass
```

#### Classes
- Use Pydantic `BaseModel` for data models
- Use `ABC` for abstract base classes
- Use `@property` for computed attributes

```python
class BaseConnector(ABC):
    def __init__(self, debug: bool = False):
        self.debug = debug

    @property
    @abstractmethod
    def source_name(self) -> str:
        pass
```

#### Naming
- Classes: PascalCase (`BaseConnector`)
- Functions/methods: snake_case (`get_events`)
- Private methods: leading underscore (`_upsert_events`)

#### Error Handling
```python
try:
    result = self.supabase.table("events").upsert(data).execute()
except Exception as e:
    print(f"Supabase upsert error: {e}")
    raise
```

## Project Structure

```
giggle/
├── frontend/
│   ├── app/                  # App Router pages and API routes
│   ├── components/
│   │   ├── features/         # Feature-specific components
│   │   ├── layout/           # Layout components
│   │   ├── providers/        # Context providers
│   │   └── ui/               # Reusable UI components
│   ├── lib/                  # External service clients
│   ├── types/                # TypeScript types
│   └── utils/                # Utility functions
└── ingestion/
    ├── connectors/           # Data source connectors
    ├── services/             # Business logic
    ├── utils/                # Utilities
    ├── models.py             # Pydantic models
    └── main.py               # Entry point
```

## Key Patterns

### Adding a New Connector
1. Create file in `ingestion/connectors/`
2. Extend `BaseConnector`, implement `source_name` and `get_events()`
3. Register in `main.py`

### Adding a New Component
1. Place in appropriate `components/` subdirectory
2. Use `"use client"` if it needs hooks/interactivity
3. Use named exports with `@/` path alias for imports
