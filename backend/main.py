from __future__ import annotations

import hashlib
import os
import secrets
import time
import traceback
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

try:
    from .db import (
        count_recent_requests,
        count_workflows,
        delete_workflow as delete_workflow_record,
        get_workflow,
        get_workflow_stats,
        increment_workflow_runs,
        init_db,
        list_workflow_logs,
        list_workflow_versions,
        list_workflows as list_workflow_records,
        record_workflow_log,
        save_workflow,
    )
    from .engine import (
        WorkflowExecutionError,
        WorkflowValidationError,
        run_workflow,
        validate_workflow_definition,
    )
except ImportError:
    from db import (
        count_recent_requests,
        count_workflows,
        delete_workflow as delete_workflow_record,
        get_workflow,
        get_workflow_stats,
        increment_workflow_runs,
        init_db,
        list_workflow_logs,
        list_workflow_versions,
        list_workflows as list_workflow_records,
        record_workflow_log,
        save_workflow,
    )
    from engine import (
        WorkflowExecutionError,
        WorkflowValidationError,
        run_workflow,
        validate_workflow_definition,
    )


app = FastAPI(
    title="API Alchemist",
    description="No-code API builder that turns visual workflows into live APIs.",
    version="1.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIST = Path(__file__).resolve().parents[1] / "frontend" / "dist"
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("ALCHEMIST_RATE_LIMIT_WINDOW_SECONDS", "60"))
RATE_LIMIT_MAX_REQUESTS = int(os.getenv("ALCHEMIST_RATE_LIMIT_MAX_REQUESTS", "60"))

NODE_RESERVED_KEYS = {
    "id",
    "type",
    "data",
    "position",
    "selected",
    "dragging",
    "width",
    "height",
    "positionAbsolute",
}


class DeployRequest(BaseModel):
    workflow_id: str | None = None
    name: str = "Untitled Workflow"
    nodes: list[dict[str, Any]]
    edges: list[dict[str, Any]]
    auth_enabled: bool = False
    api_key: str | None = None


def _crud_node(
    node_id: str,
    node_type: str,
    x: int,
    y: int,
    data: dict[str, Any],
) -> dict[str, Any]:
    return {
        "id": node_id,
        "type": node_type,
        "position": {"x": x, "y": y},
        "data": data,
    }


BUILTIN_CRUD_WORKFLOWS = [
    {
        "id": "crud-products-read",
        "name": "Products Read API",
        "nodes": [
            _crud_node("1", "http", 80, 200, {"label": "List Products"}),
            _crud_node(
                "2",
                "db",
                410,
                200,
                {"sql": "SELECT id, name, category, price, stock FROM products ORDER BY id DESC"},
            ),
            _crud_node("3", "response", 740, 200, {}),
        ],
        "edges": [{"from": "1", "to": "2"}, {"from": "2", "to": "3"}],
    },
    {
        "id": "crud-products-create",
        "name": "Products Create API",
        "nodes": [
            _crud_node("1", "http", 60, 185, {"label": "Create Product"}),
            _crud_node(
                "2",
                "validate",
                300,
                185,
                {"required_keys": "name,category,price,stock", "source": "request"},
            ),
            _crud_node(
                "3",
                "code",
                560,
                185,
                {
                    "language": "python",
                    "code": 'name = str(request["name"]).replace("\\\'", "\\\'\\\'")\n'
                    'category = str(request["category"]).replace("\\\'", "\\\'\\\'")\n'
                    'price = float(request["price"])\n'
                    'stock = int(request["stock"])\n'
                    'result = (\n'
                    '    f"INSERT INTO products (name, category, price, stock) "\n'
                    '    f"VALUES (\\\'{name}\\\', \\\'{category}\\\', {price}, {stock}) "\n'
                    '    f"RETURNING id, name, category, price, stock"\n'
                    ')',
                },
            ),
            _crud_node("4", "db", 840, 185, {"sql": "{input}"}),
            _crud_node("5", "response", 1120, 185, {}),
        ],
        "edges": [{"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"}, {"from": "4", "to": "5"}],
    },
    {
        "id": "crud-products-update",
        "name": "Products Update API",
        "nodes": [
            _crud_node("1", "http", 60, 185, {"label": "Update Product"}),
            _crud_node(
                "2",
                "validate",
                300,
                185,
                {"required_keys": "id,name,category,price,stock", "source": "request"},
            ),
            _crud_node(
                "3",
                "code",
                560,
                185,
                {
                    "language": "python",
                    "code": 'product_id = int(request["id"])\n'
                    'name = str(request["name"]).replace("\\\'", "\\\'\\\'")\n'
                    'category = str(request["category"]).replace("\\\'", "\\\'\\\'")\n'
                    'price = float(request["price"])\n'
                    'stock = int(request["stock"])\n'
                    'result = (\n'
                    '    f"UPDATE products "\n'
                    '    f"SET name = \\\'{name}\\\', category = \\\'{category}\\\', price = {price}, stock = {stock} "\n'
                    '    f"WHERE id = {product_id} "\n'
                    '    f"RETURNING id, name, category, price, stock"\n'
                    ')',
                },
            ),
            _crud_node("4", "db", 840, 185, {"sql": "{input}"}),
            _crud_node("5", "response", 1120, 185, {}),
        ],
        "edges": [{"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"}, {"from": "4", "to": "5"}],
    },
    {
        "id": "crud-products-delete",
        "name": "Products Delete API",
        "nodes": [
            _crud_node("1", "http", 60, 185, {"label": "Delete Product"}),
            _crud_node("2", "validate", 300, 185, {"required_keys": "id", "source": "request"}),
            _crud_node(
                "3",
                "code",
                560,
                185,
                {
                    "language": "python",
                    "code": 'product_id = int(request["id"])\n'
                    'result = (\n'
                    '    f"DELETE FROM products "\n'
                    '    f"WHERE id = {product_id} "\n'
                    '    f"RETURNING id, name, category, price, stock"\n'
                    ')',
                },
            ),
            _crud_node("4", "db", 840, 185, {"sql": "{input}"}),
            _crud_node("5", "response", 1120, 185, {}),
        ],
        "edges": [{"from": "1", "to": "2"}, {"from": "2", "to": "3"}, {"from": "3", "to": "4"}, {"from": "4", "to": "5"}],
    },
]


def _normalize_node(node: dict[str, Any]) -> dict[str, Any]:
    data = node.get("data")
    merged_data = dict(data) if isinstance(data, dict) else {}

    for key, value in node.items():
        if key not in NODE_RESERVED_KEYS and key not in merged_data:
            merged_data[key] = value

    normalized = {
        "id": str(node.get("id", "")),
        "type": str(node.get("type", "")),
        "data": merged_data,
    }

    if "position" in node:
        normalized["position"] = node["position"]

    return normalized


def _normalize_edge(edge: dict[str, Any]) -> dict[str, Any]:
    return {
        "from": edge.get("from") or edge.get("source"),
        "to": edge.get("to") or edge.get("target"),
    }


def _compare_node_shape(node: dict[str, Any]) -> dict[str, Any]:
    data = dict(node.get("data") or {})
    data.pop("label", None)
    return {
        "id": str(node.get("id", "")),
        "type": str(node.get("type", "")),
        "data": data,
    }


def _compare_edge_shape(edge: dict[str, Any]) -> dict[str, Any]:
    return {
        "from": str(edge.get("from") or edge.get("source") or ""),
        "to": str(edge.get("to") or edge.get("target") or ""),
    }


def _workflow_matches_template(workflow: dict[str, Any] | None, template: dict[str, Any]) -> bool:
    if workflow is None:
        return False

    workflow_nodes = sorted(
        (_compare_node_shape(node) for node in workflow.get("nodes", [])),
        key=lambda item: item["id"],
    )
    template_nodes = sorted(
        (_compare_node_shape(node) for node in template.get("nodes", [])),
        key=lambda item: item["id"],
    )

    workflow_edges = sorted(
        (_compare_edge_shape(edge) for edge in workflow.get("edges", [])),
        key=lambda item: (item["from"], item["to"]),
    )
    template_edges = sorted(
        (_compare_edge_shape(edge) for edge in template.get("edges", [])),
        key=lambda item: (item["from"], item["to"]),
    )

    return workflow_nodes == template_nodes and workflow_edges == template_edges


def _sync_builtin_crud_workflows() -> None:
    for template in BUILTIN_CRUD_WORKFLOWS:
        existing = get_workflow(template["id"])
        if _workflow_matches_template(existing, template):
            continue

        save_workflow(
            workflow_id=template["id"],
            name=template["name"],
            nodes=template["nodes"],
            edges=template["edges"],
            auth_enabled=False,
            api_key_hash=None,
            api_key_preview=None,
        )


def _is_builtin_crud_workflow(workflow_id: str) -> bool:
    return any(template["id"] == workflow_id for template in BUILTIN_CRUD_WORKFLOWS)


def _hash_api_key(workflow_id: str, api_key: str) -> str:
    return hashlib.sha256(f"{workflow_id}:{api_key}".encode("utf-8")).hexdigest()


def _verify_api_key(workflow_id: str, provided_key: str | None, stored_hash: str | None) -> bool:
    if not stored_hash or not provided_key:
        return False
    if len(stored_hash) == 64:
        return _hash_api_key(workflow_id, provided_key) == stored_hash
    return provided_key == stored_hash


def _api_key_preview(api_key: str | None) -> str | None:
    if not api_key:
        return None
    return f"***{api_key[-4:]}"


def _make_endpoint(request: Request, workflow_id: str) -> tuple[str, str]:
    endpoint = f"/api/run/{workflow_id}"
    endpoint_url = f"{str(request.base_url).rstrip('/')}{endpoint}"
    return endpoint, endpoint_url


def _input_format() -> dict[str, str]:
    return {"input": "string"}


def _example_response(workflow_id: str, version: int) -> dict[str, Any]:
    return {
        "status": "success",
        "workflow_id": workflow_id,
        "version": version,
        "data": "result payload",
    }


def _make_curl_example(endpoint_url: str, workflow: dict[str, Any], plain_api_key: str | None = None) -> str:
    parts = [
        f'curl -X POST "{endpoint_url}"',
        '-H "Content-Type: application/json"',
    ]
    if workflow.get("auth_enabled"):
        sample_key = plain_api_key or "<your-api-key>"
        parts.append(f'-H "x-api-key: {sample_key}"')
    parts.append('-d "{\\"input\\":\\"hello world\\"}"')
    return " ".join(parts)


def _error_response(
    workflow_id: str,
    status_code: int,
    message: str,
    node: str | None = None,
) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "error": message,
            "message": message,
            "workflow_id": workflow_id,
            "node": node,
        },
    )


def _workflow_response(
    workflow: dict[str, Any],
    request: Request,
    plain_api_key: str | None = None,
) -> dict[str, Any]:
    endpoint, endpoint_url = _make_endpoint(request, workflow["id"])
    auth_required = bool(workflow.get("auth_enabled"))
    headers_format = {"Content-Type": "application/json"}
    if auth_required:
        headers_format["x-api-key"] = "<your-api-key>"

    api_docs = {
        "endpoint": endpoint_url,
        "method": "POST",
        "body": _input_format(),
        "headers": headers_format,
        "example_response": _example_response(workflow["id"], workflow["version"]),
    }

    response = {
        "id": workflow["id"],
        "name": workflow["name"],
        "version": workflow["version"],
        "nodes": workflow["nodes"],
        "edges": workflow["edges"],
        "runs": workflow["runs"],
        "created": workflow["created"],
        "updated": workflow.get("updated"),
        "endpoint": endpoint,
        "endpoint_url": endpoint_url,
        "method": "POST",
        "input_format": _input_format(),
        "example_request": {"input": "Explain AI"},
        "headers_format": headers_format,
        "auth_required": auth_required,
        "auth_header": "x-api-key" if auth_required else None,
        "api_key_preview": workflow.get("api_key_preview"),
        "api_docs": api_docs,
        "example_response": api_docs["example_response"],
        "curl_example": _make_curl_example(endpoint_url, workflow, plain_api_key=plain_api_key),
    }

    if plain_api_key:
        response["api_key"] = plain_api_key

    return response


def _request_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


@app.on_event("startup")
def on_startup() -> None:
    init_db()
    _sync_builtin_crud_workflows()
    print("API Alchemist backend is live. SQLite initialized.")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "workflows": count_workflows(),
        "rate_limit_window_seconds": RATE_LIMIT_WINDOW_SECONDS,
        "rate_limit_max_requests": RATE_LIMIT_MAX_REQUESTS,
    }


@app.post("/deploy", response_model=None)
def deploy(req: DeployRequest, request: Request) -> Any:
    workflow_id = str(req.workflow_id or str(uuid.uuid4())[:8])
    auth_enabled = bool(req.auth_enabled)
    existing_workflow = get_workflow(workflow_id) if req.workflow_id else None

    plain_api_key = (req.api_key or "").strip() if auth_enabled else None
    api_key_hash = None
    api_key_preview = None

    if auth_enabled:
        if plain_api_key:
            api_key_hash = _hash_api_key(workflow_id, plain_api_key)
            api_key_preview = _api_key_preview(plain_api_key)
        elif existing_workflow and existing_workflow.get("auth_enabled"):
            api_key_hash = existing_workflow.get("api_key_hash")
            api_key_preview = existing_workflow.get("api_key_preview")
        else:
            plain_api_key = secrets.token_urlsafe(18)
            api_key_hash = _hash_api_key(workflow_id, plain_api_key)
            api_key_preview = _api_key_preview(plain_api_key)

    normalized_nodes = [_normalize_node(node) for node in req.nodes]
    normalized_edges = [_normalize_edge(edge) for edge in req.edges]

    try:
        validate_workflow_definition({"nodes": normalized_nodes, "edges": normalized_edges})
    except WorkflowValidationError as exc:
        return _error_response(
            workflow_id=workflow_id,
            status_code=400,
            message=exc.message,
            node=exc.node,
        )

    workflow = save_workflow(
        workflow_id=workflow_id,
        name=req.name,
        nodes=normalized_nodes,
        edges=normalized_edges,
        auth_enabled=auth_enabled,
        api_key_hash=api_key_hash,
        api_key_preview=api_key_preview,
    )

    response = _workflow_response(workflow, request, plain_api_key=plain_api_key)
    response["workflow_id"] = workflow_id
    response["message"] = f"Workflow '{req.name}' deployed successfully."
    return response


@app.post("/api/run/{workflow_id}", response_model=None)
async def run_endpoint(
    workflow_id: str,
    request: Request,
    x_api_key: str | None = Header(default=None, alias="x-api-key"),
) -> Any:
    if _is_builtin_crud_workflow(workflow_id):
        _sync_builtin_crud_workflows()

    workflow = get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_id}' not found.")

    client_ip = _request_client_ip(request)
    recent_requests = count_recent_requests(
        workflow_id,
        client_ip,
        time.time() - RATE_LIMIT_WINDOW_SECONDS,
    )
    if recent_requests >= RATE_LIMIT_MAX_REQUESTS:
        record_workflow_log(
            workflow_id=workflow_id,
            version=workflow["version"],
            client_ip=client_ip,
            status_code=429,
            elapsed_ms=None,
            request_body={},
            error_text="Rate limit exceeded",
        )
        return _error_response(workflow_id, 429, "Rate limit exceeded")

    if workflow.get("auth_enabled") and not _verify_api_key(
        workflow_id,
        x_api_key,
        workflow.get("api_key_hash"),
    ):
        record_workflow_log(
            workflow_id=workflow_id,
            version=workflow["version"],
            client_ip=client_ip,
            status_code=401,
            elapsed_ms=None,
            request_body={},
            error_text="Unauthorized",
        )
        return _error_response(workflow_id, 401, "Unauthorized")

    try:
        body: Any = await request.json()
    except Exception:
        body = {}

    if not isinstance(body, dict):
        body = {"input": body}
    elif "input" not in body:
        body = {
            **body,
            "input": body.get("message") if isinstance(body.get("message"), str) else "",
        }

    increment_workflow_runs(workflow_id)
    start = time.time()

    try:
        result = run_workflow(
            {"nodes": workflow["nodes"], "edges": workflow["edges"]},
            body,
        )
    except WorkflowExecutionError as exc:
        elapsed_ms = round((time.time() - start) * 1000, 2)
        record_workflow_log(
            workflow_id=workflow_id,
            version=workflow["version"],
            client_ip=client_ip,
            status_code=400,
            elapsed_ms=elapsed_ms,
            request_body=body,
            error_text=exc.message,
        )
        return _error_response(workflow_id, 400, exc.message, node=exc.node)
    except WorkflowValidationError as exc:
        elapsed_ms = round((time.time() - start) * 1000, 2)
        record_workflow_log(
            workflow_id=workflow_id,
            version=workflow["version"],
            client_ip=client_ip,
            status_code=400,
            elapsed_ms=elapsed_ms,
            request_body=body,
            error_text=exc.message,
        )
        return _error_response(workflow_id, 400, exc.message, node=exc.node)
    except ValueError as exc:
        elapsed_ms = round((time.time() - start) * 1000, 2)
        record_workflow_log(
            workflow_id=workflow_id,
            version=workflow["version"],
            client_ip=client_ip,
            status_code=400,
            elapsed_ms=elapsed_ms,
            request_body=body,
            error_text=str(exc),
        )
        return _error_response(workflow_id, 400, str(exc))
    except Exception as exc:
        traceback.print_exc()
        elapsed_ms = round((time.time() - start) * 1000, 2)
        record_workflow_log(
            workflow_id=workflow_id,
            version=workflow["version"],
            client_ip=client_ip,
            status_code=500,
            elapsed_ms=elapsed_ms,
            request_body=body,
            error_text=str(exc),
        )
        return _error_response(workflow_id, 500, str(exc))

    elapsed_ms = round((time.time() - start) * 1000, 2)
    record_workflow_log(
        workflow_id=workflow_id,
        version=workflow["version"],
        client_ip=client_ip,
        status_code=200,
        elapsed_ms=elapsed_ms,
        request_body=body,
        error_text=None,
    )
    workflow = get_workflow(workflow_id) or workflow
    return {
        "status": "success",
        "workflow_id": workflow_id,
        "version": workflow["version"],
        "data": result,
        "result": result,
        "request_body": body,
        "elapsed_ms": elapsed_ms,
        "runs_total": workflow["runs"],
    }


@app.get("/workflows")
def list_workflows(request: Request) -> list[dict[str, Any]]:
    return [_workflow_response(workflow, request) for workflow in list_workflow_records()]


@app.get("/workflows/{workflow_id}/versions")
def workflow_versions(workflow_id: str) -> dict[str, Any]:
    workflow = get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return {"workflow_id": workflow_id, "versions": list_workflow_versions(workflow_id)}


@app.get("/workflows/{workflow_id}/logs")
def workflow_logs(workflow_id: str, limit: int = 25) -> dict[str, Any]:
    workflow = get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return {"workflow_id": workflow_id, "logs": list_workflow_logs(workflow_id, limit=limit)}


@app.get("/workflows/{workflow_id}/stats")
def workflow_stats(workflow_id: str) -> dict[str, Any]:
    workflow = get_workflow(workflow_id)
    if workflow is None:
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return {"workflow_id": workflow_id, "stats": get_workflow_stats(workflow_id)}


@app.delete("/workflows/{workflow_id}")
def delete_workflow(workflow_id: str) -> dict[str, str]:
    if not delete_workflow_record(workflow_id):
        raise HTTPException(status_code=404, detail="Workflow not found.")
    return {"deleted": workflow_id}


if FRONTEND_DIST.exists():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
