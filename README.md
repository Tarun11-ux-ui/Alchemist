# API Alchemist

API Alchemist is a visual no-code API builder with a React frontend and a FastAPI backend. You design a workflow on a canvas, deploy it, and the app turns that flow into a live `POST` endpoint.

Each deployed workflow keeps version history, request logs, basic usage stats, optional API-key protection, and auto-generated request details for testing from the UI.

## What You Can Build

- Accept input through a live HTTP endpoint
- Run an AI prompt on the incoming context
- Query a local SQLite database
- Validate required request or context fields
- Call an external HTTP API
- Transform data with templates or key extraction
- Run Python or JavaScript code transforms
- Return the final result as the API response

## Supported Workflow Nodes

| Node             | Purpose                                                       |
| ---------------- | ------------------------------------------------------------- |
| `HTTP Trigger`   | Starts the workflow with the incoming request body            |
| `AI Prompt`      | Sends the current context into the AI helper                  |
| `DB Query`       | Runs SQLite against the local demo database                   |
| `Validate`       | Checks required fields from the request body or prior context |
| `HTTP Request`   | Calls another API and passes its response forward             |
| `Transform`      | Extracts a key or formats text using `{input}`                |
| `Code Transform` | Runs Python or JavaScript and assigns output to `result`      |
| `Response`       | Returns the final workflow output                             |

## Current Workflow Rules

Deploy-time validation enforces a few guardrails:

- exactly one `HTTP Trigger`
- exactly one `Response`
- every active node must be connected
- the `Response` must be reachable from the trigger
- each active node can currently have only one incoming and one outgoing connection
- cycles are rejected

## Features

- Drag-and-drop workflow builder with React Flow
- Deploy a canvas into a callable endpoint at `/api/run/{workflow_id}`
- Version history for redeployed workflows
- Request logs and summary stats per workflow
- Optional per-workflow API keys with hashed storage
- Per-workflow rate limiting by client IP
- Built-in e-commerce CRUD demo APIs for products
- Automatic repair of built-in CRUD workflows if stale definitions are detected
- Built-in API docs data returned from deploy responses
- FastAPI can serve the built frontend from the same process
- Local demo fallback for AI blocks when OpenAI is unavailable

## Project Structure

- `frontend/` React + Vite app
- `backend/` FastAPI app, workflow engine, SQLite access layer
- `backend/alchemist.db` local SQLite database

## Quick Start

### Backend

```powershell
python -m venv venv
.\venv\Scripts\activate
pip install -r .\backend\requirements.txt
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000
```

Useful URLs:

- `http://localhost:8000/health`
- `http://localhost:8000/docs`

The backend also ensures the built-in product CRUD workflows stay correct on startup, so the web demo can recover from stale saved workflow definitions.

### Frontend

```powershell
cd .\frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`.

During local development, Vite proxies these backend routes to `http://localhost:8000` by default:

- `/health`
- `/deploy`
- `/api/*`
- `/workflows/*`

If your backend runs somewhere else in development, set:

```powershell
$env:VITE_BACKEND_DEV_URL="http://your-backend-host:8000"
```

## Single-Server Deployment

Build the frontend:

```powershell
cd .\frontend
npm run build
```

Then start FastAPI from the repo root:

```powershell
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```

If `frontend/dist` exists, FastAPI serves the UI at `/` and the workflow APIs from the same backend process.

## Separate Frontend / Backend Deployment

If the frontend is hosted separately, point it at the backend with:

```powershell
$env:VITE_API_URL="https://your-api-domain.com"
```

The frontend uses that base URL for:

- API requests
- displayed public endpoint URLs
- live testing from the deploy panel

## Environment Variables

### Backend

```powershell
$env:OPENAI_API_KEY="your-key"
$env:ALCHEMIST_RATE_LIMIT_WINDOW_SECONDS="60"
$env:ALCHEMIST_RATE_LIMIT_MAX_REQUESTS="60"
```

Notes:

- AI blocks fall back to a local demo response if OpenAI is unavailable.
- JavaScript code transforms require `node` to be installed on the backend machine.

### Frontend

```powershell
$env:VITE_BACKEND_DEV_URL="http://localhost:8000"
$env:VITE_API_URL="https://your-api-domain.com"
```

## API Overview

### Built-In CRUD Demo APIs

The app includes fixed workflow IDs for the product CRUD demo:

- `crud-products-read`
- `crud-products-create`
- `crud-products-update`
- `crud-products-delete`

These power the `Web Demo` product admin page in the frontend.

If any of these saved workflows drift to an older definition, the backend repairs them automatically on startup and before running the built-in CRUD endpoints.

### Health

`GET /health`

Returns service status, workflow count, and current rate-limit settings.

### Deploy a Workflow

`POST /deploy`

Example request:

```json
{
  "name": "Summarize Input",
  "nodes": [
    { "id": "1", "type": "http", "data": { "label": "HTTP Trigger" } },
    {
      "id": "2",
      "type": "ai",
      "data": { "prompt": "Summarize the following input." }
    },
    { "id": "3", "type": "response", "data": {} }
  ],
  "edges": [
    { "from": "1", "to": "2" },
    { "from": "2", "to": "3" }
  ],
  "auth_enabled": false
}
```

Example response:

```json
{
  "workflow_id": "abc12345",
  "endpoint": "/api/run/abc12345",
  "endpoint_url": "http://localhost:8000/api/run/abc12345",
  "method": "POST",
  "version": 1,
  "auth_required": false
}
```

Redeploying the same `workflow_id` creates a new version on the same public endpoint.

### Run a Deployed Workflow

`POST /api/run/{workflow_id}`

Example request:

```json
{
  "input": "Explain AI in one sentence."
}
```

Example success response:

```json
{
  "status": "success",
  "workflow_id": "abc12345",
  "version": 2,
  "data": "result payload"
}
```

Example error response:

```json
{
  "status": "error",
  "message": "Missing required field(s): input",
  "workflow_id": "abc12345",
  "node": "2"
}
```

If the request body is not a JSON object, the backend wraps it as:

```json
{
  "input": "..."
}
```

If the body is an object without `input`, the backend falls back to `message` when available.

### Workflow Metadata Endpoints

- `GET /workflows`
- `GET /workflows/{workflow_id}/versions`
- `GET /workflows/{workflow_id}/logs`
- `GET /workflows/{workflow_id}/stats`
- `DELETE /workflows/{workflow_id}`

These power the deployed API list, version history, request log view, and usage snapshot cards in the frontend.

## Authentication

Workflows can be deployed with `auth_enabled: true`.

When enabled:

- clients must send `x-api-key`
- the displayed key is returned only at deploy time when generated or explicitly provided
- the stored backend value is hashed per workflow

Example header:

```http
x-api-key: your-secret-key
```

Unauthorized requests return `401`.

## Rate Limiting

Workflow execution is rate-limited per workflow and client IP.

Defaults:

- `ALCHEMIST_RATE_LIMIT_WINDOW_SECONDS=60`
- `ALCHEMIST_RATE_LIMIT_MAX_REQUESTS=60`

If the limit is exceeded, the API returns `429`.

## Local Database

The backend initializes `backend/alchemist.db` automatically and seeds:

- a demo `items` table for generic DB-node examples
- a `products` table for the built-in e-commerce CRUD demo

| id  | name  | value |
| --- | ----- | ----- |
| 1   | alpha | 100   |
| 2   | beta  | 200   |
| 3   | gamma | 300   |

The `DB Query` node can query this table directly.

## Code Transform Notes

`Code Transform` supports:

- Python
- JavaScript

Available values inside code blocks:

- `input` for the previous node output
- `request` for the original API body
- `result` as the value you should assign before returning

Example Python:

```python
result = {"upper": str(input).upper()}
```

Example JavaScript:

```javascript
result = { upper: String(input).toUpperCase() };
```

## Demo-Friendly AI Behavior

AI nodes still work in demo mode even if OpenAI is unavailable.

- If OpenAI is available, the AI node calls the configured model.
- If not, the app returns a local demo response so the workflow stays usable.

## Limitations

- The workflow engine currently executes a single linear path.
- Branching and fan-in/fan-out are not supported.
- The database is local SQLite, intended for demo and prototype use.
- The generated public API shape is currently `POST` with JSON input.
