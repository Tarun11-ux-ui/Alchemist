from __future__ import annotations

import json
import shutil
import subprocess
from collections import deque
from urllib import error as urllib_error
from urllib import request as urllib_request
from typing import Any

try:
    from .ai import call_ai
    from .db import execute_query
except ImportError:
    from ai import call_ai
    from db import execute_query


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

ENTRY_NODE_TYPES = {"http", "trigger"}
EXIT_NODE_TYPES = {"response", "output"}
SAFE_PYTHON_BUILTINS = {
    "len": len,
    "str": str,
    "int": int,
    "float": float,
    "bool": bool,
    "list": list,
    "dict": dict,
    "min": min,
    "max": max,
    "sum": sum,
    "sorted": sorted,
    "range": range,
}


class WorkflowValidationError(Exception):
    def __init__(self, message: str, node: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.node = node


class WorkflowExecutionError(Exception):
    def __init__(self, message: str, node: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.node = node


def _build_adjacency(edges: list[dict]) -> dict[str, list[str]]:
    adjacency: dict[str, list[str]] = {}
    for edge in edges:
        source = edge.get("from") or edge.get("source", "")
        target = edge.get("to") or edge.get("target", "")
        adjacency.setdefault(source, []).append(target)
    return adjacency


def _build_reverse_adjacency(edges: list[dict]) -> dict[str, list[str]]:
    reverse: dict[str, list[str]] = {}
    for edge in edges:
        source = str(edge.get("from") or edge.get("source") or "")
        target = str(edge.get("to") or edge.get("target") or "")
        reverse.setdefault(target, []).append(source)
    return reverse


def _node_id(node: dict[str, Any]) -> str:
    return str(node.get("id") or "").strip()


def _node_type(node: dict[str, Any]) -> str:
    return str(node.get("type") or "").strip().lower()


def _traverse(start_ids: list[str], adjacency: dict[str, list[str]]) -> set[str]:
    seen: set[str] = set()
    stack = list(start_ids)

    while stack:
        node_id = stack.pop()
        if node_id in seen:
            continue
        seen.add(node_id)
        stack.extend(adjacency.get(node_id, []))

    return seen


def validate_workflow_definition(workflow: dict[str, Any]) -> None:
    nodes = workflow.get("nodes", [])
    edges = workflow.get("edges", [])

    if not isinstance(nodes, list) or not nodes:
        raise WorkflowValidationError("Workflow needs at least one node before deploy.")

    if not isinstance(edges, list):
        raise WorkflowValidationError("Workflow edges must be a list.")

    node_ids: set[str] = set()
    node_map: dict[str, dict[str, Any]] = {}

    for node in nodes:
        node_id = _node_id(node)
        if not node_id:
            raise WorkflowValidationError("Every node must have an id.")
        if node_id in node_ids:
            raise WorkflowValidationError(f"Duplicate node id '{node_id}' found.", node=node_id)
        node_ids.add(node_id)
        node_map[node_id] = node

        node_type = _node_type(node)
        if node_type not in _EXECUTORS:
            raise WorkflowValidationError(
                f"Unsupported node type '{node.get('type', '')}'.",
                node=node_id,
            )

        if node_type == "fetch":
            url = str(_node_value(node, "url", "")).strip()
            if not url:
                raise WorkflowValidationError("HTTP Request node needs a URL.", node=node_id)
            headers_raw = str(_node_value(node, "headers", "")).strip()
            if headers_raw:
                parsed_headers = _coerce_object(headers_raw)
                if not isinstance(parsed_headers, dict):
                    raise WorkflowValidationError(
                        "HTTP Request headers must be valid JSON object text.",
                        node=node_id,
                    )

        if node_type == "validate":
            source = str(_node_value(node, "source", "request")).lower().strip()
            if source not in {"request", "context"}:
                raise WorkflowValidationError(
                    "Validate node source must be either 'request' or 'context'.",
                    node=node_id,
                )

        if node_type == "code":
            language = str(_node_value(node, "language", "python")).lower().strip()
            code = str(_node_value(node, "code", "")).strip()
            if language not in {"python", "javascript"}:
                raise WorkflowValidationError(
                    "Code Transform language must be Python or JavaScript.",
                    node=node_id,
                )
            if not code:
                raise WorkflowValidationError(
                    "Code Transform needs code before deploy.",
                    node=node_id,
                )

    entry_ids = [node_id for node_id, node in node_map.items() if _node_type(node) in ENTRY_NODE_TYPES]
    exit_ids = [node_id for node_id, node in node_map.items() if _node_type(node) in EXIT_NODE_TYPES]

    if not entry_ids:
        raise WorkflowValidationError("Workflow must include one HTTP Trigger node.")
    if not exit_ids:
        raise WorkflowValidationError("Workflow must include one Response node.")
    if len(entry_ids) > 1:
        raise WorkflowValidationError("Workflow supports only one HTTP Trigger node.", node=entry_ids[1])
    if len(exit_ids) > 1:
        raise WorkflowValidationError("Workflow supports only one Response node.", node=exit_ids[1])

    normalized_edges: list[dict[str, str]] = []
    outgoing: dict[str, int] = {node_id: 0 for node_id in node_ids}
    incoming: dict[str, int] = {node_id: 0 for node_id in node_ids}

    for edge in edges:
        source = str(edge.get("from") or edge.get("source") or "").strip()
        target = str(edge.get("to") or edge.get("target") or "").strip()

        if not source or not target:
            raise WorkflowValidationError("Each connection must have both a start and end node.")
        if source not in node_ids:
            raise WorkflowValidationError(
                f"Connection starts from unknown node '{source}'.",
                node=source,
            )
        if target not in node_ids:
            raise WorkflowValidationError(
                f"Connection points to unknown node '{target}'.",
                node=target,
            )
        if source == target:
            raise WorkflowValidationError("A node cannot connect to itself.", node=source)

        normalized_edges.append({"from": source, "to": target})
        outgoing[source] += 1
        incoming[target] += 1

    if not normalized_edges:
        raise WorkflowValidationError("Connect the trigger to the response before deploy.")

    trigger_id = entry_ids[0]
    response_id = exit_ids[0]

    adjacency = _build_adjacency(normalized_edges)
    reverse_adjacency = _build_reverse_adjacency(normalized_edges)

    reachable_from_trigger = _traverse([trigger_id], adjacency)
    if response_id not in reachable_from_trigger:
        raise WorkflowValidationError("Response node is not reachable from the trigger.", node=response_id)

    leads_to_response = _traverse([response_id], reverse_adjacency)
    active_node_ids = reachable_from_trigger & leads_to_response

    for node_id, node in node_map.items():
        if node_id not in active_node_ids:
            continue

        node_type = _node_type(node)
        if node_type in ENTRY_NODE_TYPES:
            if incoming[node_id] != 0:
                raise WorkflowValidationError("HTTP Trigger cannot have incoming connections.", node=node_id)
            if outgoing[node_id] == 0:
                raise WorkflowValidationError("HTTP Trigger must connect to another node.", node=node_id)
        elif node_type in EXIT_NODE_TYPES:
            if incoming[node_id] == 0:
                raise WorkflowValidationError("Response node must receive a connection.", node=node_id)
            if outgoing[node_id] != 0:
                raise WorkflowValidationError("Response node cannot connect to later nodes.", node=node_id)
        else:
            if incoming[node_id] == 0:
                raise WorkflowValidationError("Node is missing an incoming connection.", node=node_id)
            if outgoing[node_id] == 0:
                raise WorkflowValidationError("Node is missing an outgoing connection.", node=node_id)

        if incoming[node_id] > 1:
            raise WorkflowValidationError(
                "Each node can only receive one incoming connection right now.",
                node=node_id,
            )
        if outgoing[node_id] > 1:
            raise WorkflowValidationError(
                "Each node can only send one outgoing connection right now.",
                node=node_id,
            )

    active_nodes = [node_map[node_id] for node_id in node_ids if node_id in active_node_ids]
    active_edges = [
        edge
        for edge in normalized_edges
        if edge["from"] in active_node_ids and edge["to"] in active_node_ids
    ]

    _topo_sort(active_nodes, active_edges)

def _topo_sort(nodes: list[dict], edges: list[dict]) -> list[str]:
    adjacency = _build_adjacency(edges)
    in_degree: dict[str, int] = {node["id"]: 0 for node in nodes}

    for successors in adjacency.values():
        for successor in successors:
            in_degree[successor] = in_degree.get(successor, 0) + 1

    queue: deque[str] = deque(
        [node_id for node_id, degree in in_degree.items() if degree == 0]
    )
    order: list[str] = []

    while queue:
        node_id = queue.popleft()
        order.append(node_id)
        for successor in adjacency.get(node_id, []):
            in_degree[successor] -= 1
            if in_degree[successor] == 0:
                queue.append(successor)

    if len(order) != len(nodes):
        raise ValueError("Workflow graph contains a cycle and cannot execute.")

    return order


def _reachable_subgraph(nodes: list[dict], edges: list[dict]) -> tuple[list[dict], list[dict]]:
    node_map = {str(node["id"]): node for node in nodes}
    adjacency = _build_adjacency(edges)
    entry_ids = [
        str(node["id"])
        for node in nodes
        if str(node.get("type", "")).lower() in {"http", "trigger"}
    ]

    if not entry_ids and nodes:
        incoming_targets = {
            str(edge.get("to") or edge.get("target"))
            for edge in edges
            if edge.get("to") or edge.get("target")
        }
        entry_ids = [
            str(node["id"]) for node in nodes if str(node["id"]) not in incoming_targets
        ] or [str(nodes[0]["id"])]

    seen: set[str] = set()
    stack = list(entry_ids)

    while stack:
        node_id = stack.pop()
        if node_id in seen or node_id not in node_map:
            continue

        seen.add(node_id)
        node_type = str(node_map[node_id].get("type", "")).lower()
        if node_type in EXIT_NODE_TYPES:
            continue

        for neighbor in adjacency.get(node_id, []):
            if neighbor not in seen:
                stack.append(neighbor)

    if not seen:
        return nodes, edges

    filtered_nodes = [node for node in nodes if str(node["id"]) in seen]
    filtered_edges = [
        edge
        for edge in edges
        if str(edge.get("from") or edge.get("source")) in seen
        and str(edge.get("to") or edge.get("target")) in seen
    ]
    return filtered_nodes, filtered_edges


def _node_data(node: dict) -> dict[str, Any]:
    nested = node.get("data")
    if isinstance(nested, dict):
        data = dict(nested)
    else:
        data = {}

    for key, value in node.items():
        if key not in NODE_RESERVED_KEYS and key not in data:
            data[key] = value

    return data


def _node_value(node: dict, key: str, default: Any = None) -> Any:
    return _node_data(node).get(key, default)


def _stringify(value: Any) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value)


def _coerce_object(value: Any) -> Any:
    if isinstance(value, str):
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value
    return value


def _exec_http(_node: dict, _context: Any, request_body: Any) -> Any:
    return request_body


def _exec_ai(node: dict, context: Any, _body: Any) -> str:
    prompt = _node_value(node, "prompt", "Summarize the input.")
    return call_ai(prompt, _stringify(context))


def _exec_db(node: dict, context: Any, _body: Any) -> Any:
    sql = _node_value(node, "sql", "SELECT * FROM items LIMIT 10")
    if sql.strip() == "{input}" and isinstance(context, str):
        sql = context
    else:
        sql = sql.replace("{input}", _stringify(context).replace("'", "''"))
    return execute_query(sql)


def _exec_validate(node: dict, context: Any, body: Any) -> Any:
    required_keys = str(_node_value(node, "required_keys", "")).strip()
    source = str(_node_value(node, "source", "request")).lower()
    subject = body if source == "request" else context
    subject = _coerce_object(subject)

    if not required_keys:
        return subject

    if not isinstance(subject, dict):
        raise ValueError(f"Validate node expected a JSON object from {source}.")

    missing_keys = [
        key.strip()
        for key in required_keys.split(",")
        if key.strip() and key.strip() not in subject
    ]
    if missing_keys:
        raise ValueError(f"Missing required field(s): {', '.join(missing_keys)}")

    return subject


def _exec_fetch(node: dict, context: Any, _body: Any) -> Any:
    method = str(_node_value(node, "method", "GET")).upper()
    url = str(_node_value(node, "url", "")).strip()
    headers_raw = str(_node_value(node, "headers", "")).strip()
    body_template = str(_node_value(node, "body_template", "")).strip()
    input_text = _stringify(context)

    if not url:
        raise ValueError("HTTP Request node requires a URL.")

    parsed_headers = {}
    if headers_raw:
        parsed_headers = _coerce_object(headers_raw)
        if not isinstance(parsed_headers, dict):
            raise ValueError("HTTP Request headers must be valid JSON object text.")

    resolved_url = url.replace("{input}", input_text)
    resolved_body = body_template.replace("{input}", input_text) if body_template else ""
    body_bytes = resolved_body.encode("utf-8") if resolved_body and method != "GET" else None

    request = urllib_request.Request(
        resolved_url,
        data=body_bytes,
        headers={str(key): str(value) for key, value in parsed_headers.items()},
        method=method,
    )

    try:
        with urllib_request.urlopen(request, timeout=20) as response:
            response_text = response.read().decode("utf-8")
            content_type = response.headers.get("Content-Type", "")
            parsed_body = (
                _coerce_object(response_text)
                if "json" in content_type.lower()
                else _coerce_object(response_text)
            )
            return {
                "status": response.status,
                "url": resolved_url,
                "headers": dict(response.headers.items()),
                "body": parsed_body,
            }
    except urllib_error.HTTPError as exc:
        error_text = exc.read().decode("utf-8", errors="ignore")
        raise ValueError(
            f"HTTP Request node failed with {exc.code}: {error_text or exc.reason}"
        ) from exc
    except urllib_error.URLError as exc:
        raise ValueError(f"HTTP Request node could not reach the URL: {exc.reason}") from exc


def _exec_transform(node: dict, context: Any, _body: Any) -> Any:
    key = _node_value(node, "key")
    template = _node_value(node, "template")

    if key and isinstance(context, dict):
        return context.get(key, context)

    if template:
        try:
            return template.format(input=_stringify(context))
        except KeyError:
            return template

    return context


def _exec_code(node: dict, context: Any, body: Any) -> Any:
    language = str(_node_value(node, "language", "python")).lower().strip()
    code = str(_node_value(node, "code", "")).strip()

    if not code:
        raise ValueError("Code Transform requires code.")

    if language == "python":
        local_scope = {
            "input": context,
            "request": body,
            "result": context,
            "json": json,
        }
        exec(code, {"__builtins__": SAFE_PYTHON_BUILTINS}, local_scope)
        return local_scope.get("result")

    if language == "javascript":
        node_binary = shutil.which("node")
        if not node_binary:
            raise ValueError("JavaScript transform requires Node.js to be installed on the backend.")

        runner = """
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
try {
  let result = payload.input;
  const input = payload.input;
  const request = payload.request;
  eval(payload.code);
  process.stdout.write(JSON.stringify({ result }));
} catch (error) {
  console.error(error && error.message ? error.message : String(error));
  process.exit(1);
}
""".strip()
        payload = json.dumps(
            {
                "input": context,
                "request": body,
                "code": code,
            }
        )
        completed = subprocess.run(
            [node_binary, "-e", runner],
            input=payload,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if completed.returncode != 0:
            raise ValueError(
                completed.stderr.strip() or "JavaScript transform failed."
            )
        try:
            return json.loads(completed.stdout or "{}").get("result")
        except json.JSONDecodeError as exc:
            raise ValueError("JavaScript transform returned invalid JSON.") from exc

    raise ValueError("Unsupported Code Transform language.")


def _exec_response(_node: dict, context: Any, _body: Any) -> Any:
    return context


_EXECUTORS = {
    "http": _exec_http,
    "trigger": _exec_http,
    "ai": _exec_ai,
    "db": _exec_db,
    "database": _exec_db,
    "validate": _exec_validate,
    "fetch": _exec_fetch,
    "transform": _exec_transform,
    "code": _exec_code,
    "response": _exec_response,
    "output": _exec_response,
}


def run_workflow(workflow: dict, request_body: Any) -> Any:
    nodes: list[dict] = workflow.get("nodes", [])
    edges: list[dict] = workflow.get("edges", [])

    validate_workflow_definition({"nodes": nodes, "edges": edges})

    nodes, edges = _reachable_subgraph(nodes, edges)
    node_map = {node["id"]: node for node in nodes}
    order = _topo_sort(nodes, edges)

    context: Any = None
    last_output: Any = None

    for node_id in order:
        node = node_map.get(node_id)
        if node is None:
            continue

        node_type = str(node.get("type", "")).lower()
        executor = _EXECUTORS.get(node_type)

        try:
            if executor is None:
                last_output = context
            else:
                last_output = executor(node, context, request_body)
        except WorkflowExecutionError as exc:
            raise WorkflowExecutionError(exc.message, node=exc.node or _node_id(node)) from exc
        except ValueError as exc:
            raise WorkflowExecutionError(str(exc), node=_node_id(node)) from exc
        except Exception as exc:
            raise WorkflowExecutionError(str(exc), node=_node_id(node)) from exc

        context = last_output

    return last_output
