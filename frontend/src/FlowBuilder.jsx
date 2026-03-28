import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactFlow, {
  addEdge,
  Background,
  ConnectionLineType,
  ConnectionMode,
  Controls,
  Handle,
  MiniMap,
  Panel,
  Position,
  useEdgesState,
  useNodesState,
} from "reactflow";
import "reactflow/dist/style.css";
import "./flow-builder.css";

const NODE_PALETTE = [
  {
    type: "http",
    label: "HTTP Trigger",
    icon: "POST",
    color: "#40e0d0",
    glow: "#40e0d044",
    desc: "Receives the live API request payload.",
  },
  {
    type: "ai",
    label: "AI Prompt",
    icon: "AI",
    color: "#ff8a5b",
    glow: "#ff8a5b44",
    desc: "Runs an AI prompt against the incoming context.",
  },
  {
    type: "db",
    label: "DB Query",
    icon: "SQL",
    color: "#9cff8f",
    glow: "#9cff8f44",
    desc: "Executes SQLite queries with input substitution.",
  },
  {
    type: "validate",
    label: "Validate",
    icon: "CHECK",
    color: "#7dc4ff",
    glow: "#7dc4ff44",
    desc: "Checks request fields before the API continues.",
  },
  {
    type: "fetch",
    label: "HTTP Request",
    icon: "FETCH",
    color: "#c7a6ff",
    glow: "#c7a6ff44",
    desc: "Calls another API and returns its response.",
  },
  {
    type: "transform",
    label: "Transform",
    icon: "FX",
    color: "#ffd36e",
    glow: "#ffd36e44",
    desc: "Extracts keys or formats the previous result.",
  },
  {
    type: "code",
    label: "Code Transform",
    icon: "CODE",
    color: "#5bb6ff",
    glow: "#5bb6ff44",
    desc: "Runs Python or JavaScript to reshape the previous result.",
  },
  {
    type: "response",
    label: "Response",
    icon: "OUT",
    color: "#ff6f91",
    glow: "#ff6f9144",
    desc: "Returns the final API response.",
  },
];

const TYPE_META = Object.fromEntries(NODE_PALETTE.map((node) => [node.type, node]));

const INPUT_STYLE = {
  width: "100%",
  background: "#08111f",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: 8,
  color: "#f4f7fb",
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  padding: "7px 9px",
  resize: "vertical",
  marginTop: 5,
};

const LABEL_STYLE = {
  fontSize: 10,
  color: "#7e90a9",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
};

const HIDDEN_DEPLOY_BUTTON_STYLE = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
  pointerEvents: "none",
};

const FLOATING_ACTION_STYLE = {
  position: "absolute",
  transform: "translate(-50%, -100%)",
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 10px",
  borderRadius: 12,
  border: "1px solid rgba(133, 153, 184, 0.2)",
  background: "rgba(8, 17, 31, 0.96)",
  boxShadow: "0 18px 30px rgba(1, 8, 18, 0.34)",
  color: "#f4f7fb",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
  zIndex: 20,
};

const EDGE_STYLE = {
  stroke: "#63f5e7",
  strokeWidth: 3.25,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function handleStyle(color, side) {
  return {
    background: color,
    border: "2px solid #04111f",
    width: 16,
    height: 16,
    borderRadius: "50%",
    [side]: -8,
    boxShadow: `0 0 0 3px ${color}22, 0 0 18px ${color}88`,
  };
}

function NodeHandles({ color }) {
  return (
    <>
      <Handle
        type="target"
        id="target"
        position={Position.Left}
        style={handleStyle(color, "left")}
      />
      <Handle
        type="source"
        id="source"
        position={Position.Right}
        style={handleStyle(color, "right")}
      />
    </>
  );
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
}

function createNodeData(type) {
  switch (type) {
    case "http":
      return { label: "HTTP Trigger" };
    case "ai":
      return { prompt: "Summarize the following input in one short sentence." };
    case "db":
      return { sql: "SELECT * FROM items LIMIT 5" };
    case "validate":
      return { required_keys: "input", source: "request" };
    case "fetch":
      return {
        method: "GET",
        url: "https://api.example.com/data?q={input}",
        headers: '{"Accept":"application/json"}',
        body_template: "",
      };
    case "transform":
      return { key: "", template: "" };
    case "code":
      return {
        language: "python",
        code: "result = input",
      };
    default:
      return {};
  }
}

function NodeShell({ children, selected, type }) {
  const meta = TYPE_META[type] || {
    color: "#aab4c8",
    glow: "#aab4c833",
    icon: "?",
    label: type,
  };

  return (
    <div
      style={{
        background: "linear-gradient(145deg, rgba(8, 17, 31, 0.98), rgba(15, 27, 48, 0.98))",
        border: `1.5px solid ${selected ? meta.color : `${meta.color}66`}`,
        borderRadius: 16,
        minWidth: 220,
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        boxShadow: selected
          ? `0 0 0 3px ${meta.color}20, 0 18px 38px ${meta.glow}`
          : "0 14px 30px rgba(1, 8, 18, 0.4)",
        overflow: "hidden",
        transition: "all 0.18s ease",
      }}
    >
      <div
        style={{
          padding: "10px 14px",
          background: `linear-gradient(90deg, ${meta.color}22, transparent)`,
          borderBottom: `1px solid ${meta.color}22`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: meta.color,
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            {meta.icon}
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 800,
              color: meta.color,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {meta.label}
          </span>
        </div>
        <span style={{ fontSize: 10, color: "#7e90a9" }}>{meta.desc}</span>
      </div>
      <div style={{ padding: "12px 14px" }}>{children}</div>
    </div>
  );
}

function HttpNode({ data, selected }) {
  const [label, setLabel] = useState(data.label || "HTTP Trigger");

  useEffect(() => {
    data.label = label;
  }, [data, label]);

  return (
    <NodeShell selected={selected} type="http">
      <NodeHandles color="#40e0d0" />
      <div style={LABEL_STYLE}>Entry Label</div>
      <input
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        value={label}
        onChange={(event) => setLabel(event.target.value)}
        placeholder="HTTP Trigger"
        className="nodrag"
      />
      <div style={{ fontSize: 10, color: "#7e90a9", marginTop: 8 }}>
        Sends the full request body into the workflow as the starting context.
      </div>
    </NodeShell>
  );
}

function AiNode({ data, selected }) {
  const [prompt, setPrompt] = useState(
    data.prompt || "Summarize the following input in one short sentence.",
  );

  useEffect(() => {
    data.prompt = prompt;
  }, [data, prompt]);

  return (
    <NodeShell selected={selected} type="ai">
      <NodeHandles color="#ff8a5b" />
      <div style={LABEL_STYLE}>Prompt</div>
      <textarea
        style={{ ...INPUT_STYLE, minHeight: 88 }}
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="Explain or transform the incoming data..."
        className="nodrag"
      />
    </NodeShell>
  );
}

function DbNode({ data, selected }) {
  const [sql, setSql] = useState(data.sql || "SELECT * FROM items LIMIT 5");

  useEffect(() => {
    data.sql = sql;
  }, [data, sql]);

  return (
    <NodeShell selected={selected} type="db">
      <NodeHandles color="#9cff8f" />
      <div style={LABEL_STYLE}>SQL Query</div>
      <textarea
        style={{ ...INPUT_STYLE, minHeight: 78 }}
        value={sql}
        onChange={(event) => setSql(event.target.value)}
        placeholder="SELECT * FROM items WHERE name = '{input}'"
        className="nodrag"
      />
      <div style={{ fontSize: 10, color: "#7e90a9", marginTop: 8 }}>
        Use {"{input}"} to inject the previous node output into the query.
      </div>
    </NodeShell>
  );
}

function ValidateNode({ data, selected }) {
  const [requiredKeys, setRequiredKeys] = useState(data.required_keys || "input");
  const [source, setSource] = useState(data.source || "request");

  useEffect(() => {
    data.required_keys = requiredKeys;
    data.source = source;
  }, [data, requiredKeys, source]);

  return (
    <NodeShell selected={selected} type="validate">
      <NodeHandles color="#7dc4ff" />
      <div style={LABEL_STYLE}>Required Keys</div>
      <input
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        value={requiredKeys}
        onChange={(event) => setRequiredKeys(event.target.value)}
        placeholder="input, message"
        className="nodrag"
      />
      <div style={{ ...LABEL_STYLE, marginTop: 10 }}>Source</div>
      <select
        value={source}
        onChange={(event) => setSource(event.target.value)}
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        className="nodrag"
      >
        <option value="request">Request body</option>
        <option value="context">Previous block output</option>
      </select>
    </NodeShell>
  );
}

function FetchNode({ data, selected }) {
  const [method, setMethod] = useState(data.method || "GET");
  const [url, setUrl] = useState(data.url || "https://api.example.com/data?q={input}");
  const [headers, setHeaders] = useState(data.headers || '{"Accept":"application/json"}');
  const [bodyTemplate, setBodyTemplate] = useState(data.body_template || "");

  useEffect(() => {
    data.method = method;
    data.url = url;
    data.headers = headers;
    data.body_template = bodyTemplate;
  }, [bodyTemplate, data, headers, method, url]);

  return (
    <NodeShell selected={selected} type="fetch">
      <NodeHandles color="#c7a6ff" />
      <div style={LABEL_STYLE}>Method</div>
      <select
        value={method}
        onChange={(event) => setMethod(event.target.value)}
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        className="nodrag"
      >
        <option value="GET">GET</option>
        <option value="POST">POST</option>
        <option value="PUT">PUT</option>
        <option value="PATCH">PATCH</option>
        <option value="DELETE">DELETE</option>
      </select>
      <div style={{ ...LABEL_STYLE, marginTop: 10 }}>URL</div>
      <input
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder="https://api.example.com/data?q={input}"
        className="nodrag"
      />
      <div style={{ ...LABEL_STYLE, marginTop: 10 }}>Headers JSON</div>
      <textarea
        style={{ ...INPUT_STYLE, minHeight: 64 }}
        value={headers}
        onChange={(event) => setHeaders(event.target.value)}
        placeholder='{"Accept":"application/json"}'
        className="nodrag"
      />
      <div style={{ ...LABEL_STYLE, marginTop: 10 }}>Body Template</div>
      <textarea
        style={{ ...INPUT_STYLE, minHeight: 64 }}
        value={bodyTemplate}
        onChange={(event) => setBodyTemplate(event.target.value)}
        placeholder='{"message":"{input}"}'
        className="nodrag"
      />
    </NodeShell>
  );
}

function TransformNode({ data, selected }) {
  const [key, setKey] = useState(data.key || "");
  const [template, setTemplate] = useState(data.template || "");

  useEffect(() => {
    data.key = key;
    data.template = template;
  }, [data, key, template]);

  return (
    <NodeShell selected={selected} type="transform">
      <NodeHandles color="#ffd36e" />
      <div style={LABEL_STYLE}>Extract Key</div>
      <input
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        value={key}
        onChange={(event) => setKey(event.target.value)}
        placeholder="message"
        className="nodrag"
      />
      <div style={{ ...LABEL_STYLE, marginTop: 10 }}>Template</div>
      <input
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        value={template}
        onChange={(event) => setTemplate(event.target.value)}
        placeholder="Result: {input}"
        className="nodrag"
      />
    </NodeShell>
  );
}

function ResponseNode({ selected }) {
  return (
    <NodeShell selected={selected} type="response">
      <NodeHandles color="#ff6f91" />
      <div style={{ fontSize: 11, color: "#7e90a9", lineHeight: 1.5 }}>
        Returns the latest context as the live API output.
      </div>
    </NodeShell>
  );
}

function CodeNode({ data, selected }) {
  const [language, setLanguage] = useState(data.language || "python");
  const [code, setCode] = useState(
    data.code ||
      "result = input",
  );
  const resultExample =
    language === "python"
      ? 'result = {"message": "HELLO", "count": 5}'
      : 'result = { message: "HELLO", count: 5 };';

  useEffect(() => {
    data.language = language;
    data.code = code;
  }, [code, data, language]);

  return (
    <NodeShell selected={selected} type="code">
      <NodeHandles color="#5bb6ff" />
      <div style={LABEL_STYLE}>Language</div>
      <select
        value={language}
        onChange={(event) => setLanguage(event.target.value)}
        style={{ ...INPUT_STYLE, minHeight: "unset" }}
        className="nodrag"
      >
        <option value="python">Python</option>
        <option value="javascript">JavaScript</option>
      </select>
      <div style={{ ...LABEL_STYLE, marginTop: 10 }}>Code</div>
      <textarea
        style={{ ...INPUT_STYLE, minHeight: 120 }}
        value={code}
        onChange={(event) => setCode(event.target.value)}
        placeholder={
          language === "python"
            ? "result = input"
            : "result = input;"
        }
        className="nodrag"
      />
      <div style={{ fontSize: 10, color: "#7e90a9", marginTop: 8, lineHeight: 1.5 }}>
        Use <code>input</code> for the previous block output, <code>request</code> for the API body,
        and assign the final value to <code>result</code>.
      </div>
      <div
        style={{
          marginTop: 10,
          background: "rgba(8, 17, 31, 0.92)",
          border: "1px solid rgba(91, 182, 255, 0.22)",
          borderRadius: 10,
          padding: "10px 11px",
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#5bb6ff",
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            marginBottom: 6,
          }}
        >
          Result Preview
        </div>
        <div
          style={{
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            color: "#f4f7fb",
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          {resultExample}
        </div>
        <div style={{ fontSize: 10, color: "#7e90a9", marginTop: 6, lineHeight: 1.5 }}>
          Whatever you put in <code>result</code> is sent to the next block or final response.
        </div>
      </div>
    </NodeShell>
  );
}

const nodeTypes = {
  http: HttpNode,
  ai: AiNode,
  db: DbNode,
  validate: ValidateNode,
  fetch: FetchNode,
  transform: TransformNode,
  code: CodeNode,
  response: ResponseNode,
};

const INIT_NODES = [
  {
    id: "1",
    type: "http",
    position: { x: 80, y: 190 },
    data: createNodeData("http"),
  },
  {
    id: "2",
    type: "ai",
    position: { x: 380, y: 135 },
    data: createNodeData("ai"),
  },
  {
    id: "3",
    type: "response",
    position: { x: 700, y: 190 },
    data: createNodeData("response"),
  },
];

const INIT_EDGES = [
  {
    id: "e1-2",
    source: "1",
    target: "2",
    animated: true,
    type: "smoothstep",
    pathOptions: { borderRadius: 26, offset: 20 },
    style: EDGE_STYLE,
  },
  {
    id: "e2-3",
    source: "2",
    target: "3",
    animated: true,
    type: "smoothstep",
    pathOptions: { borderRadius: 26, offset: 20 },
    style: {
      ...EDGE_STYLE,
      stroke: "#ff9b74",
    },
  },
];

let nodeIdCounter = 10;

export default function FlowBuilder({ onDeploy, workflow }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(INIT_NODES);
  const [edges, setEdges, onEdgesChange] = useEdgesState(INIT_EDGES);
  const reactFlowWrapper = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);
  const [lastDeletedSnapshot, setLastDeletedSnapshot] = useState(null);
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });

  useEffect(() => {
    if (!workflow || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
      return;
    }

    const nextNodes = workflow.nodes.map((node, index) => ({
      id: String(node.id),
      type: node.type,
      position: node.position || {
        x: 120 + index * 220,
        y: 180 + (index % 2) * 40,
      },
      data: { ...(node.data || {}) },
    }));

    const highestNodeId = nextNodes.reduce((highest, node) => {
      const numericId = Number(node.id);
      return Number.isFinite(numericId) ? Math.max(highest, numericId) : highest;
    }, nodeIdCounter);

    const nextEdges = Array.isArray(workflow.edges)
      ? workflow.edges
          .filter((edge) => edge?.from && edge?.to)
          .map((edge, index) => ({
            id: `loaded-${edge.from}-${edge.to}-${index}`,
            source: String(edge.from),
            target: String(edge.to),
            animated: true,
            type: "smoothstep",
            pathOptions: { borderRadius: 26, offset: 20 },
            style: EDGE_STYLE,
            interactionWidth: 40,
          }))
      : [];

    setNodes(nextNodes);
    setEdges(nextEdges);
    nodeIdCounter = highestNodeId;

    if (rfInstance) {
      requestAnimationFrame(() => rfInstance.fitView({ padding: 0.18 }));
    }
  }, [rfInstance, setEdges, setNodes, workflow]);

  const handleDeploy = useCallback(() => {
    const workflowNodes = nodes.map((node) => ({
      id: node.id,
      type: node.type,
      position: node.position,
      data: { ...(node.data || {}) },
    }));
    const workflowEdges = edges.map((edge) => ({
      from: edge.source,
      to: edge.target,
    }));
    onDeploy({ nodes: workflowNodes, edges: workflowEdges });
  }, [edges, nodes, onDeploy]);

  const removeEdgeById = useCallback((edgeId) => {
    const edgeToDelete = edges.find((edge) => edge.id === edgeId);
    if (!edgeToDelete) {
      return;
    }

    setLastDeletedSnapshot({
      nodes: nodes.map((node) => ({
        ...node,
        data: { ...(node.data || {}) },
        position: { ...(node.position || {}) },
      })),
      edges: edges.map((edge) => ({
        ...edge,
        style: edge.style ? { ...edge.style } : edge.style,
      })),
    });

    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.id !== edgeId),
    );
  }, [edges, nodes, setEdges]);

  const removeSelected = useCallback(() => {
    const selectedNodeIds = new Set(
      nodes.filter((node) => node.selected).map((node) => node.id),
    );
    const hasSelectedNodes = selectedNodeIds.size > 0;
    const hasSelectedEdges = edges.some((edge) => edge.selected);

    if (!hasSelectedNodes && !hasSelectedEdges) {
      return;
    }

    setLastDeletedSnapshot({
      nodes: nodes.map((node) => ({
        ...node,
        data: { ...(node.data || {}) },
        position: { ...(node.position || {}) },
      })),
      edges: edges.map((edge) => ({
        ...edge,
        style: edge.style ? { ...edge.style } : edge.style,
      })),
    });

    setNodes((currentNodes) =>
      currentNodes.filter((node) => !selectedNodeIds.has(node.id)),
    );

    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) =>
          !edge.selected &&
          !selectedNodeIds.has(edge.source) &&
          !selectedNodeIds.has(edge.target),
      ),
    );
  }, [edges, nodes, setEdges, setNodes]);

  const restoreDeleted = useCallback(() => {
    if (!lastDeletedSnapshot) {
      return;
    }

    setNodes(lastDeletedSnapshot.nodes);
    setEdges(lastDeletedSnapshot.edges);
    setLastDeletedSnapshot(null);

    if (rfInstance) {
      requestAnimationFrame(() => rfInstance.fitView({ padding: 0.18 }));
    }
  }, [lastDeletedSnapshot, rfInstance, setEdges, setNodes]);

  const dismissUndoNotice = useCallback(() => {
    setLastDeletedSnapshot(null);
  }, []);

  const selectedNode = useMemo(
    () => nodes.find((node) => node.selected),
    [nodes],
  );
  const selectedEdge = useMemo(
    () => edges.find((edge) => edge.selected),
    [edges],
  );

  const clearSelection = useCallback(() => {
    setNodes((currentNodes) =>
      currentNodes.map((node) => ({ ...node, selected: false })),
    );
    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({ ...edge, selected: false })),
    );
  }, [setEdges, setNodes]);

  const duplicateSelectedNode = useCallback(() => {
    if (!selectedNode) {
      return;
    }

    const nextId = String(++nodeIdCounter);
    const duplicatedNode = {
      ...selectedNode,
      id: nextId,
      position: {
        x: selectedNode.position.x + 48,
        y: selectedNode.position.y + 48,
      },
      data: { ...(selectedNode.data || {}) },
      selected: true,
    };

    setNodes((currentNodes) => [
      ...currentNodes.map((node) => ({ ...node, selected: false })),
      duplicatedNode,
    ]);
    setEdges((currentEdges) =>
      currentEdges.map((edge) => ({ ...edge, selected: false })),
    );
  }, [selectedNode, setEdges, setNodes]);

  const focusSelection = useCallback(() => {
    if (!rfInstance) {
      return;
    }

    if (selectedNode) {
      const width = selectedNode.width || 220;
      const height = selectedNode.height || 120;
      rfInstance.setCenter(
        selectedNode.position.x + width / 2,
        selectedNode.position.y + height / 2,
        { zoom: 1.1, duration: 400 },
      );
      return;
    }

    if (!selectedEdge) {
      return;
    }

    const sourceNode = nodes.find((node) => node.id === selectedEdge.source);
    const targetNode = nodes.find((node) => node.id === selectedEdge.target);

    if (!sourceNode || !targetNode) {
      return;
    }

    const sourceWidth = sourceNode.width || 220;
    const sourceHeight = sourceNode.height || 120;
    const targetWidth = targetNode.width || 220;
    const targetHeight = targetNode.height || 120;

    rfInstance.setCenter(
      (sourceNode.position.x + sourceWidth / 2 + targetNode.position.x + targetWidth / 2) / 2,
      (sourceNode.position.y + sourceHeight / 2 + targetNode.position.y + targetHeight / 2) / 2,
      { zoom: 1.05, duration: 400 },
    );
  }, [nodes, rfInstance, selectedEdge, selectedNode]);

  const floatingAction = useMemo(() => {
    if (!reactFlowWrapper.current) {
      return null;
    }

    const wrapperRect = reactFlowWrapper.current.getBoundingClientRect();
    const wrapperWidth = wrapperRect.width;
    const zoom = viewport.zoom || 1;

    if (selectedNode) {
      const width = selectedNode.width || 220;
      const height = selectedNode.height || 120;
      const left =
        selectedNode.position.x * zoom + viewport.x + (width * zoom) / 2;
      const top = selectedNode.position.y * zoom + viewport.y - 14;

      return {
        type: "node",
        id: selectedNode.id,
        label: "Delete Node",
        left: Math.min(Math.max(left, 80), wrapperWidth - 80),
        top: Math.max(top, 18),
      };
    }

    if (!selectedEdge) {
      return null;
    }

    const sourceNode = nodes.find((node) => node.id === selectedEdge.source);
    const targetNode = nodes.find((node) => node.id === selectedEdge.target);

    if (!sourceNode || !targetNode) {
      return null;
    }

    const sourceWidth = sourceNode.width || 220;
    const sourceHeight = sourceNode.height || 120;
    const targetWidth = targetNode.width || 220;
    const targetHeight = targetNode.height || 120;

    const sourceCenterX = sourceNode.position.x + sourceWidth / 2;
    const sourceCenterY = sourceNode.position.y + sourceHeight / 2;
    const targetCenterX = targetNode.position.x + targetWidth / 2;
    const targetCenterY = targetNode.position.y + targetHeight / 2;

    const left =
      ((sourceCenterX + targetCenterX) / 2) * zoom + viewport.x;
    const top =
      ((sourceCenterY + targetCenterY) / 2) * zoom + viewport.y - 20;

    return {
      type: "edge",
      id: selectedEdge.id,
      label: "Delete Line",
      left: Math.min(Math.max(left, 80), wrapperWidth - 80),
      top: Math.max(top, 18),
    };
  }, [edges, nodes, selectedEdge, selectedNode, viewport]);

  useEffect(() => {
    document.addEventListener("alchemist:deploy", handleDeploy);
    return () => document.removeEventListener("alchemist:deploy", handleDeploy);
  }, [handleDeploy]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (isTypingTarget(event.target)) {
        return;
      }

      const isDeleteKey =
        event.key === "Delete" || event.key === "Backspace";
      const isUndoKey =
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey;

      if (isDeleteKey) {
        event.preventDefault();
        removeSelected();
        return;
      }

      if (isUndoKey && lastDeletedSnapshot) {
        event.preventDefault();
        restoreDeleted();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [lastDeletedSnapshot, removeSelected, restoreDeleted]);

  const onConnect = useCallback(
    (params) =>
      setEdges((currentEdges) =>
        addEdge(
          {
            ...params,
            animated: true,
            type: "smoothstep",
            pathOptions: { borderRadius: 26, offset: 20 },
            style: EDGE_STYLE,
            interactionWidth: 40,
          },
          currentEdges,
        ),
      ),
    [setEdges],
  );

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const type = event.dataTransfer.getData("application/reactflow");
      if (!type || !rfInstance || !reactFlowWrapper.current) {
        return;
      }

      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.project({
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      });

      const id = String(++nodeIdCounter);
      setNodes((currentNodes) => [
        ...currentNodes,
        {
          id,
          type,
          position,
          data: createNodeData(type),
        },
      ]);
    },
    [rfInstance, setNodes],
  );

  return (
    <div ref={reactFlowWrapper} style={{ width: "100%", height: "100%", position: "relative" }}>
      <button
        type="button"
        data-deploy-btn
        onClick={handleDeploy}
        style={HIDDEN_DEPLOY_BUTTON_STYLE}
        aria-hidden="true"
        tabIndex={-1}
      >
        Deploy
      </button>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setRfInstance}
        onMove={(_, nextViewport) => setViewport(nextViewport)}
        onDrop={onDrop}
        onDragOver={onDragOver}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        connectionRadius={48}
        connectionLineType={ConnectionLineType.SmoothStep}
        connectionLineStyle={{
          ...EDGE_STYLE,
          strokeWidth: 3.5,
        }}
        deleteKeyCode={null}
        defaultEdgeOptions={{
          animated: true,
          type: "smoothstep",
          pathOptions: { borderRadius: 26, offset: 20 },
          style: EDGE_STYLE,
          interactionWidth: 40,
        }}
        fitView
        proOptions={{ hideAttribution: true }}
        defaultViewport={{ x: 0, y: 0, zoom: 1 }}
      >
        <Background color="#18314f" gap={22} size={1.2} />
        <Controls
          style={{
            background: "rgba(10, 19, 34, 0.92)",
            border: "1px solid rgba(133, 153, 184, 0.16)",
            borderRadius: 12,
            overflow: "hidden",
          }}
        />
        <MiniMap
          style={{
            background: "rgba(10, 19, 34, 0.94)",
            border: "1px solid rgba(133, 153, 184, 0.16)",
            borderRadius: 12,
          }}
          nodeColor={(node) => TYPE_META[node.type]?.color || "#7e90a9"}
          maskColor="rgba(3, 8, 16, 0.64)"
        />
        {lastDeletedSnapshot ? (
          <Panel position="bottom-left">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                background: "rgba(8, 17, 31, 0.94)",
                border: "1px solid rgba(133, 153, 184, 0.18)",
                borderRadius: 14,
                padding: "10px 12px",
                boxShadow: "0 18px 28px rgba(1, 8, 18, 0.32)",
                color: "#f4f7fb",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              <span style={{ fontSize: 12, color: "#7e90a9" }}>
                Item removed. Undo if that was a mistake.
              </span>
              <button
                type="button"
                onClick={restoreDeleted}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: "linear-gradient(135deg, #40e0d0 0%, #ff8a5b 100%)",
                  color: "#04111f",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 800,
                  padding: "8px 11px",
                }}
              >
                Undo
              </button>
              <button
                type="button"
                onClick={dismissUndoNotice}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  border: "1px solid rgba(133, 153, 184, 0.18)",
                  background: "rgba(7, 16, 28, 0.9)",
                  color: "#7e90a9",
                  cursor: "pointer",
                  fontSize: 14,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                x
              </button>
            </div>
          </Panel>
        ) : null}
      </ReactFlow>
      {floatingAction ? (
        <div
          style={{
            ...FLOATING_ACTION_STYLE,
            left: floatingAction.left,
            top: floatingAction.top,
          }}
        >
          <span style={{ fontSize: 11, color: "#7e90a9" }}>
            {floatingAction.label}
          </span>
          <button
            type="button"
            onClick={focusSelection}
            style={{
              border: "1px solid rgba(133, 153, 184, 0.18)",
              borderRadius: 10,
              background: "rgba(7, 16, 28, 0.9)",
              color: "#f4f7fb",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 800,
              padding: "8px 11px",
            }}
          >
            Focus
          </button>
          {floatingAction.type === "node" ? (
            <button
              type="button"
              onClick={duplicateSelectedNode}
              style={{
                border: "none",
                borderRadius: 10,
                background: "linear-gradient(135deg, #63f5e7 0%, #9cff8f 100%)",
                color: "#04111f",
                cursor: "pointer",
                fontSize: 11,
                fontWeight: 800,
                padding: "8px 11px",
              }}
            >
              Duplicate
            </button>
          ) : null}
          <button
            type="button"
            onClick={() =>
              floatingAction.type === "node"
                ? removeSelected()
                : removeEdgeById(floatingAction.id)
            }
            style={{
              border: "none",
              borderRadius: 10,
              background: "linear-gradient(135deg, #ff6f91 0%, #ff8a5b 100%)",
              color: "#04111f",
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 800,
              padding: "8px 11px",
            }}
          >
            Delete
          </button>
          <button
            type="button"
            onClick={clearSelection}
            style={{
              width: 28,
              height: 28,
              borderRadius: 9,
              border: "1px solid rgba(133, 153, 184, 0.18)",
              background: "rgba(7, 16, 28, 0.9)",
              color: "#7e90a9",
              cursor: "pointer",
              fontSize: 14,
              fontWeight: 700,
              lineHeight: 1,
            }}
          >
            x
          </button>
        </div>
      ) : null}
    </div>
  );
}

export { NODE_PALETTE };
