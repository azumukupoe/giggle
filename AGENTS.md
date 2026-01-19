<!-- OPENSPEC:START -->
# OpenSpec Instructions

These instructions are for AI assistants working in this project.

Always open `@/openspec/AGENTS.md` when the request:
- Mentions planning or proposals (words like proposal, spec, change, plan)
- Introduces new capabilities, breaking changes, architecture shifts, or big performance/security work
- Sounds ambiguous and you need the authoritative spec before coding

Use `@/openspec/AGENTS.md` to learn:
- How to create and apply change proposals
- Spec format and conventions
- Project structure and guidelines

Keep this managed block so 'openspec update' can refresh the instructions.

<!-- OPENSPEC:END -->

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

bun install          # Install dependencies
bun run dev          # Development server (port 3000)
bun run build        # Production build
bun run start        # Start production server

# Linting
bun run lint                      # Lint all files
bun eslint path/to/file.tsx       # Lint specific file

# Type checking
bun tsc --noEmit                  # Check all files
bun tsc --noEmit path/to/file.ts  # Check specific file
```

### Ingestion (Python)

```bash
cd ingestion

uv sync                           # Install dependencies
uv run main.py                    # Run full ingestion pipeline
uv run main.py --source songkick  # Run specific source (case-insensitive match)
uv run main.py --dry-run          # Dry run (no DB changes)
uv run main.py --debug            # Debug mode (verbose logging)

# Type checking
uv run mypy .                     # Check all files
uv run mypy path/to/file.py       # Check specific file

# Testing (single test)
uv run pytest path/to/test_file.py::test_function_name -v
uv run pytest path/to/test_file.py -k "test_name_pattern" -v
```

## Code Style Guidelines

### TypeScript/React (Frontend)

#### Imports
Order with blank lines between groups:
1. `"use client"` directive (if needed)
2. React/Next.js (`react`, `next/*`)
3. Third-party libraries (`date-fns`, `framer-motion`, `lucide-react`)
4. Local imports with `@/` alias (`@/components/*`, `@/types/*`, `@/utils/*`)

```typescript
"use client";

import { useState, useMemo, memo, useCallback } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Calendar, MapPin } from "lucide-react";

import { Modal } from "@/components/ui/Modal";
import { Event, GroupedEvent } from "@/types/event";
import { getDomain } from "@/utils/eventUtils";
```

#### Components
- Arrow function components with destructured props
- Use `"use client"` directive for components with hooks/interactivity
- Wrap performance-critical components with `memo()`
- Set `displayName` after memo wrapping

```typescript
const EventCardComponent = ({ event }: { event: GroupedEvent }) => {
    const [isOpen, setIsOpen] = useState(false);
    // ...
};

export const EventCard = memo(EventCardComponent);
EventCard.displayName = "EventCard";
```

#### Types
- Shared types in `types/` directory using `interface`
- Inline types for component-specific props
- Arrays: `Type[]`, nullable: `Type | null`

```typescript
export interface Event {
    id: string
    event: string[]
    date: string[]
    time: string[] | null
}
```

#### Formatting
- 4-space indentation
- Template literals for string interpolation
- Early returns for guard clauses
- `useMemo`/`useCallback` for expensive computations and callback stability

### Python (Ingestion)

#### Imports
Order with blank lines between groups:
1. Standard library (`abc`, `typing`, `datetime`, `argparse`)
2. Third-party packages (`pydantic`, `httpx`, `tenacity`)
3. Local modules with absolute imports (`from ingestion.models import ...`)

```python
from abc import ABC, abstractmethod
from typing import List, Optional, Union

from pydantic import BaseModel, field_validator
import httpx

from ingestion.models import Event
from ingestion.utils.config import load_dotenv
```

#### Type Hints
Always use type hints for parameters, return types, and class attributes:

```python
def get_events(self, query: str = None) -> List[Event]:
    """Fetch events by query."""
    pass

def run_connector(connector_cls, std) -> Tuple[str, List[Event]]:
    """Instantiate and run a connector."""
    pass
```

#### Classes
- Pydantic `BaseModel` for data models with validators
- `ABC` for abstract base classes
- `@property` for computed/abstract attributes

```python
class BaseConnector(ABC):
    def __init__(self, debug: bool = False):
        self.debug = debug

    @property
    @abstractmethod
    def source_name(self) -> str:
        """Return the name of the source."""
        pass
```

#### Error Handling
Catch exceptions, log with context, and re-raise when appropriate:

```python
try:
    result = self.supabase.table("events").upsert(data).execute()
except Exception as e:
    print(f"[{source_name}] Failed: {e}")
    raise
```

## Project Structure

```
giggle/
├── frontend/
│   ├── app/                  # App Router pages and API routes
│   ├── components/
│   │   ├── features/         # Feature-specific (events/)
│   │   ├── layout/           # Layout components (Navbar)
│   │   ├── providers/        # Context providers
│   │   └── ui/               # Reusable UI (Modal, Tooltip)
│   ├── lib/                  # External service clients
│   ├── types/                # TypeScript interfaces
│   └── utils/                # Utility functions
└── ingestion/
    ├── connectors/           # Data source connectors
    │   ├── base.py           # BaseConnector ABC
    │   ├── registry.py       # Connector registration
    │   ├── songkick.py       # Songkick connector
    │   ├── eplus.py          # e+ connector
    │   └── pia.py            # PIA connector
    ├── services/             # Business logic
    │   ├── importer.py       # DB import logic
    │   └── standardizer.py   # Data normalization
    ├── utils/                # Utilities (config, db, dates, text)
    ├── models.py             # Pydantic Event model
    └── main.py               # CLI entry point
```

## Key Patterns

### Adding a New Connector
1. Create `ingestion/connectors/<source>.py`
2. Extend `BaseConnector`, implement `source_name` property and `get_events()` method
3. Import in `main.py` to register with the connector registry

### Adding a New Component
1. Place in appropriate `components/` subdirectory
2. Add `"use client"` if it uses hooks or browser APIs
3. Use named exports with `@/` path alias for imports
