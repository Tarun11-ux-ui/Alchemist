import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import FlowBuilder, { NODE_PALETTE } from "./FlowBuilder.jsx";
import { apiClient, buildPublicApiUrl } from "./api.js";

const C = {
  bg: "#04111f",
  bgGlow: "#0b1c31",
  surface: "rgba(9, 21, 38, 0.92)",
  surfaceAlt: "rgba(13, 28, 49, 0.9)",
  border: "rgba(133, 153, 184, 0.16)",
  borderStrong: "rgba(133, 153, 184, 0.28)",
  text: "#f3f7fb",
  muted: "#7f91aa",
  accent: "#40e0d0",
  accentAlt: "#ff8a5b",
  success: "#9cff8f",
  warning: "#ffd36e",
  danger: "#ff6f91",
};

const NODE_META = Object.fromEntries(
  NODE_PALETTE.map((node) => [node.type, node]),
);

const FONT_SANS = "'Plus Jakarta Sans', sans-serif";
const FONT_MONO = "'IBM Plex Mono', monospace";
const FIELD_LABELS = {
  label: "Label",
  prompt: "Prompt",
  sql: "SQL",
  key: "Key",
  template: "Template",
  language: "Language",
  code: "Code",
  required_keys: "Required Keys",
  source: "Source",
  url: "URL",
  method: "Method",
  headers: "Headers",
  body_template: "Body Template",
};
const CRUD_WORKFLOW_NAMES = {
  read: "Products Read API",
  create: "Products Create API",
  update: "Products Update API",
  delete: "Products Delete API",
};
const CRUD_WORKFLOW_IDS = {
  read: "crud-products-read",
  create: "crud-products-create",
  update: "crud-products-update",
  delete: "crud-products-delete",
};
const ECOMMERCE_CRUD_TEMPLATES = [
  {
    id: "products-read",
    workflow_id: CRUD_WORKFLOW_IDS.read,
    name: "Products Read API",
    description: "Returns the current product list from the store database.",
    nodes: [
      {
        id: "1",
        type: "http",
        position: { x: 80, y: 200 },
        data: { label: "List Products" },
      },
      {
        id: "2",
        type: "db",
        position: { x: 410, y: 200 },
        data: {
          sql: "SELECT id, name, category, price, stock FROM products ORDER BY id DESC",
        },
      },
      {
        id: "3",
        type: "response",
        position: { x: 740, y: 200 },
        data: {},
      },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
    ],
  },
  {
    id: "products-create",
    workflow_id: CRUD_WORKFLOW_IDS.create,
    name: "Products Create API",
    description: "Adds a new product and returns the created product details.",
    nodes: [
      {
        id: "1",
        type: "http",
        position: { x: 60, y: 185 },
        data: { label: "Create Product" },
      },
      {
        id: "2",
        type: "validate",
        position: { x: 300, y: 185 },
        data: { required_keys: "name,category,price,stock", source: "request" },
      },
      {
        id: "3",
        type: "code",
        position: { x: 560, y: 185 },
        data: {
          language: "python",
          code:
            'name = str(request["name"]).replace("\\\'", "\\\'\\\'")\n' +
            'category = str(request["category"]).replace("\\\'", "\\\'\\\'")\n' +
            'price = float(request["price"])\n' +
            'stock = int(request["stock"])\n' +
            'result = (\n' +
            '    f"INSERT INTO products (name, category, price, stock) "\n' +
            '    f"VALUES (\\\'{name}\\\', \\\'{category}\\\', {price}, {stock}) "\n' +
            '    f"RETURNING id, name, category, price, stock"\n' +
            ')',
        },
      },
      {
        id: "4",
        type: "db",
        position: { x: 840, y: 185 },
        data: { sql: "{input}" },
      },
      {
        id: "5",
        type: "response",
        position: { x: 1120, y: 185 },
        data: {},
      },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
      { from: "3", to: "4" },
      { from: "4", to: "5" },
    ],
  },
  {
    id: "products-update",
    workflow_id: CRUD_WORKFLOW_IDS.update,
    name: "Products Update API",
    description: "Updates an existing product and returns the changed product details.",
    nodes: [
      {
        id: "1",
        type: "http",
        position: { x: 60, y: 185 },
        data: { label: "Update Product" },
      },
      {
        id: "2",
        type: "validate",
        position: { x: 300, y: 185 },
        data: { required_keys: "id,name,category,price,stock", source: "request" },
      },
      {
        id: "3",
        type: "code",
        position: { x: 560, y: 185 },
        data: {
          language: "python",
          code:
            'product_id = int(request["id"])\n' +
            'name = str(request["name"]).replace("\\\'", "\\\'\\\'")\n' +
            'category = str(request["category"]).replace("\\\'", "\\\'\\\'")\n' +
            'price = float(request["price"])\n' +
            'stock = int(request["stock"])\n' +
            'result = (\n' +
            '    f"UPDATE products "\n' +
            '    f"SET name = \\\'{name}\\\', category = \\\'{category}\\\', price = {price}, stock = {stock} "\n' +
            '    f"WHERE id = {product_id} "\n' +
            '    f"RETURNING id, name, category, price, stock"\n' +
            ')',
        },
      },
      {
        id: "4",
        type: "db",
        position: { x: 840, y: 185 },
        data: { sql: "{input}" },
      },
      {
        id: "5",
        type: "response",
        position: { x: 1120, y: 185 },
        data: {},
      },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
      { from: "3", to: "4" },
      { from: "4", to: "5" },
    ],
  },
  {
    id: "products-delete",
    workflow_id: CRUD_WORKFLOW_IDS.delete,
    name: "Products Delete API",
    description: "Deletes a product and returns the deleted product details.",
    nodes: [
      {
        id: "1",
        type: "http",
        position: { x: 60, y: 185 },
        data: { label: "Delete Product" },
      },
      {
        id: "2",
        type: "validate",
        position: { x: 300, y: 185 },
        data: { required_keys: "id", source: "request" },
      },
      {
        id: "3",
        type: "code",
        position: { x: 560, y: 185 },
        data: {
          language: "python",
          code:
            'product_id = int(request["id"])\n' +
            'result = (\n' +
            '    f"DELETE FROM products "\n' +
            '    f"WHERE id = {product_id} "\n' +
            '    f"RETURNING id, name, category, price, stock"\n' +
            ')',
        },
      },
      {
        id: "4",
        type: "db",
        position: { x: 840, y: 185 },
        data: { sql: "{input}" },
      },
      {
        id: "5",
        type: "response",
        position: { x: 1120, y: 185 },
        data: {},
      },
    ],
    edges: [
      { from: "1", to: "2" },
      { from: "2", to: "3" },
      { from: "3", to: "4" },
      { from: "4", to: "5" },
    ],
  },
];

function getCrudApiStatus(workflows) {
  const availableIds = new Set((Array.isArray(workflows) ? workflows : []).map((workflow) => workflow.id));
  return Object.values(CRUD_WORKFLOW_IDS).every((id) => availableIds.has(id));
}

function isCrudWorkflowId(workflowId) {
  return Object.values(CRUD_WORKFLOW_IDS).includes(workflowId);
}

function cloneWorkflowNodes(nodes) {
  return (Array.isArray(nodes) ? nodes : []).map((node) => ({
    ...node,
    position: node?.position ? { ...node.position } : undefined,
    data: node?.data && typeof node.data === "object" ? { ...node.data } : {},
  }));
}

function cloneWorkflowEdges(edges) {
  return (Array.isArray(edges) ? edges : []).map((edge) => ({ ...edge }));
}

function buildCrudTemplatePayload(template) {
  return {
    workflow_id: template.workflow_id,
    name: template.name,
    nodes: cloneWorkflowNodes(template.nodes),
    edges: cloneWorkflowEdges(template.edges),
    auth_enabled: false,
  };
}

function normalizeCrudCompareNode(node) {
  const data = normalizeNodeData(node);
  const { label: _ignoredLabel, ...restData } = data;
  return {
    id: String(node?.id || ""),
    type: String(node?.type || ""),
    data: restData,
  };
}

function normalizeCrudCompareEdge(edge) {
  return {
    from: String(edge?.from || edge?.source || ""),
    to: String(edge?.to || edge?.target || ""),
  };
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function isCrudWorkflowOutdated(workflow, template) {
  if (!workflow) {
    return true;
  }

  const workflowNodes = (Array.isArray(workflow.nodes) ? workflow.nodes : [])
    .map(normalizeCrudCompareNode)
    .sort((left, right) => left.id.localeCompare(right.id));
  const templateNodes = cloneWorkflowNodes(template.nodes)
    .map(normalizeCrudCompareNode)
    .sort((left, right) => left.id.localeCompare(right.id));

  const workflowEdges = (Array.isArray(workflow.edges) ? workflow.edges : [])
    .map(normalizeCrudCompareEdge)
    .sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`));
  const templateEdges = cloneWorkflowEdges(template.edges)
    .map(normalizeCrudCompareEdge)
    .sort((left, right) => `${left.from}:${left.to}`.localeCompare(`${right.from}:${right.to}`));

  return (
    stableStringify(workflowNodes) !== stableStringify(templateNodes) ||
    stableStringify(workflowEdges) !== stableStringify(templateEdges)
  );
}

function getCrudTemplatesNeedingProvision(workflows) {
  const workflowMap = new Map((Array.isArray(workflows) ? workflows : []).map((workflow) => [workflow.id, workflow]));
  return ECOMMERCE_CRUD_TEMPLATES.filter((template) =>
    isCrudWorkflowOutdated(workflowMap.get(template.workflow_id), template),
  );
}

const SECTION_TITLE_STYLE = {
  fontSize: 10,
  fontWeight: 800,
  letterSpacing: "0.14em",
  color: C.muted,
  textTransform: "uppercase",
  marginBottom: 10,
};

const PANEL_STYLE = {
  background: C.surface,
  border: `1px solid ${C.border}`,
  borderRadius: 22,
  boxShadow: "0 20px 60px rgba(1, 8, 18, 0.38)",
  backdropFilter: "blur(22px)",
};

const CARD_STYLE = {
  background: C.surfaceAlt,
  border: `1px solid ${C.border}`,
  borderRadius: 16,
};

const FORM_INPUT_STYLE = {
  width: "100%",
  padding: "11px 12px",
  borderRadius: 12,
  border: `1px solid ${C.border}`,
  background: "#07101c",
  color: C.text,
  fontFamily: FONT_SANS,
  fontSize: 12,
};

function normalizeNodeData(node) {
  if (!node || typeof node !== "object") {
    return {};
  }

  const data = node.data && typeof node.data === "object" ? { ...node.data } : {};
  for (const [key, value] of Object.entries(node)) {
    if (!["id", "type", "data", "position"].includes(key) && !(key in data)) {
      data[key] = value;
    }
  }
  return data;
}

function buildPayloadFromText(text) {
  return JSON.stringify(
    {
      input: text,
    },
    null,
    2,
  );
}

function guessFieldValue(fieldName, text) {
  const key = String(fieldName || "").toLowerCase();

  if (key === "input") {
    return text;
  }
  if (key === "id") {
    return 1;
  }
  if (key.includes("price") || key.includes("amount") || key.includes("total")) {
    return 99;
  }
  if (key.includes("stock") || key.includes("count") || key.includes("qty") || key.includes("quantity")) {
    return 10;
  }
  if (key.includes("name")) {
    return "Sample Product";
  }
  if (key.includes("category")) {
    return "Apparel";
  }
  if (key.includes("status")) {
    return "active";
  }

  return "";
}

function extractRequestFields(nodes) {
  const requestFields = new Set();

  for (const node of Array.isArray(nodes) ? nodes : []) {
    if (node?.type !== "validate") {
      continue;
    }

    const data = normalizeNodeData(node);
    if ((data.source || "request") !== "request") {
      continue;
    }

    for (const field of String(data.required_keys || "").split(",")) {
      const trimmed = field.trim();
      if (trimmed) {
        requestFields.add(trimmed);
      }
    }
  }

  return [...requestFields];
}

function buildPayloadFromWorkflow(nodes, text) {
  const fields = extractRequestFields(nodes);

  if (fields.length === 0) {
    return buildPayloadFromText(text);
  }

  const payload = {};
  for (const field of fields) {
    payload[field] = guessFieldValue(field, text);
  }

  return JSON.stringify(payload, null, 2);
}

function formatJson(value) {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatApiError(payload, fallbackMessage = "Request failed.") {
  if (!payload || typeof payload !== "object") {
    return fallbackMessage;
  }

  const message =
    payload.message ||
    payload.error ||
    payload.detail ||
    fallbackMessage;

  return payload.node ? `${message} (node: ${payload.node})` : message;
}

function summarizeNode(node) {
  const meta = NODE_META[node.type] || {
    label: node.type || "Node",
    color: C.accent,
  };
  const data = normalizeNodeData(node);
  const fields = Object.entries(data)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .map(([key, value]) => ({
      label: FIELD_LABELS[key] || key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
      value: typeof value === "string" ? value : JSON.stringify(value, null, 2),
    }));

  return {
    color: meta.color,
    label: meta.label,
    fields,
  };
}

function describeWorkflow(nodes) {
  const types = new Set((Array.isArray(nodes) ? nodes : []).map((node) => node.type));
  const parts = [];

  parts.push("This API receives someone's input");

  if (types.has("validate")) {
    parts.push("checks that important information is filled in");
  }
  if (types.has("ai")) {
    parts.push("uses AI to generate or improve the answer");
  }
  if (types.has("db")) {
    parts.push("looks up data from the database");
  }
  if (types.has("fetch")) {
    parts.push("can call another online service");
  }
  if (types.has("code")) {
    parts.push("runs custom code to shape the result");
  }
  if (types.has("transform")) {
    parts.push("formats the output");
  }

  parts.push("and returns the final response");

  return parts.join(", ").replace(", and returns the final response", " and returns the final response.");
}

function describeResultValue(value) {
  if (value === null || value === undefined) {
    return "no visible result yet";
  }
  if (typeof value === "string") {
    return value.length > 140 ? `${value.slice(0, 137)}...` : value;
  }
  if (Array.isArray(value)) {
    return `a list with ${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (typeof value === "object") {
    const count = Object.keys(value).length;
    return `structured data with ${count} field${count === 1 ? "" : "s"}`;
  }
  return String(value);
}

function validateProductPayload(product, requireId = false) {
  if (requireId && !product.id) {
    return "Choose a product to update or delete first.";
  }
  if (!String(product.name || "").trim()) {
    return "Product name is required.";
  }
  if (!String(product.category || "").trim()) {
    return "Category is required.";
  }
  if (!Number.isFinite(Number(product.price)) || Number(product.price) < 0) {
    return "Price must be a valid number.";
  }
  if (!Number.isFinite(Number(product.stock)) || Number(product.stock) < 0) {
    return "Stock must be a valid number.";
  }
  return "";
}

function Badge({ color, children }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "5px 10px",
        borderRadius: 999,
        border: `1px solid ${color}44`,
        background: `${color}18`,
        color,
        fontFamily: FONT_MONO,
        fontSize: 10,
        letterSpacing: "0.06em",
      }}
    >
      {children}
    </span>
  );
}

function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div
        style={{
          ...SECTION_TITLE_STYLE,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <span>{title}</span>
        {action}
      </div>
      {children}
    </div>
  );
}

function SidebarTabButton({ active, children, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 14,
        border: `1px solid ${active ? `${C.accent}55` : C.border}`,
        background: active
          ? "linear-gradient(135deg, rgba(64, 224, 208, 0.14), rgba(255, 138, 91, 0.1))"
          : "rgba(7, 16, 28, 0.72)",
        color: active ? C.text : C.muted,
        cursor: "pointer",
        fontFamily: FONT_SANS,
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      <span>{children}</span>
      <span
        style={{
          padding: "3px 7px",
          borderRadius: 999,
          background: active ? `${C.accent}22` : "rgba(127, 145, 170, 0.14)",
          color: active ? C.accent : C.muted,
          fontFamily: FONT_MONO,
          fontSize: 10,
          letterSpacing: "0.06em",
        }}
      >
        {count}
      </span>
    </button>
  );
}

function PaletteCard({ node }) {
  const onDragStart = (event) => {
    event.dataTransfer.setData("application/reactflow", node.type);
    event.dataTransfer.effectAllowed = "move";
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      style={{
        ...CARD_STYLE,
        padding: "11px 12px",
        cursor: "grab",
        display: "grid",
        gap: 5,
        minHeight: 96,
        transition: "border-color 0.16s ease, transform 0.16s ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.borderColor = `${node.color}88`;
        event.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.borderColor = C.border;
        event.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            color: node.color,
            fontFamily: FONT_MONO,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.08em",
          }}
        >
          {node.icon}
        </span>
        <div style={{ fontSize: 12, fontWeight: 800, color: node.color }}>
          {node.label}
        </div>
      </div>
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.45 }}>
        {node.desc}
      </div>
    </div>
  );
}

function TemplateCard({ template, onLoad }) {
  return (
    <button
      type="button"
      onClick={() => onLoad(template)}
      style={{
        ...CARD_STYLE,
        width: "100%",
        padding: "12px 13px",
        cursor: "pointer",
        textAlign: "left",
        color: C.text,
        display: "grid",
        gap: 6,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: C.accentAlt }}>
        {template.name}
      </div>
      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.5 }}>
        {template.description}
      </div>
    </button>
  );
}

function ApiRow({ workflow, onSelect, onDelete, deleting }) {
  return (
    <div
      style={{
        ...CARD_STYLE,
        width: "100%",
        padding: "12px 13px",
        textAlign: "left",
        color: C.text,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <button
          type="button"
          onClick={() => onSelect(workflow)}
          style={{
            border: "none",
            background: "transparent",
            padding: 0,
            margin: 0,
            cursor: "pointer",
            textAlign: "left",
            color: C.text,
            flex: 1,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 800 }}>{workflow.name}</div>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Badge color={C.success}>{workflow.runs} runs</Badge>
          <button
            type="button"
            onClick={() => onDelete(workflow)}
            disabled={deleting}
            style={{
              border: `1px solid ${C.danger}44`,
              borderRadius: 10,
              background: deleting ? "rgba(255, 111, 145, 0.16)" : "rgba(255, 111, 145, 0.12)",
              color: C.danger,
              cursor: deleting ? "not-allowed" : "pointer",
              fontFamily: FONT_MONO,
              fontSize: 10,
              fontWeight: 800,
              padding: "7px 9px",
            }}
          >
            {deleting ? "..." : "Delete"}
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={() => onSelect(workflow)}
        style={{
          border: "none",
          background: "transparent",
          padding: 0,
          margin: "5px 0 0",
          cursor: "pointer",
          textAlign: "left",
          color: C.accent,
          width: "100%",
          fontFamily: FONT_MONO,
          fontSize: 10,
          wordBreak: "break-all",
        }}
      >
        {workflow.endpoint_url || buildPublicApiUrl(`/api/run/${workflow.id}`)}
      </button>
    </div>
  );
}

function RequirementCard({ node, index }) {
  const summary = summarizeNode(node);

  return (
    <div
      style={{
        ...CARD_STYLE,
        padding: 14,
        display: "grid",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: summary.color,
              boxShadow: `0 0 14px ${summary.color}`,
            }}
          />
          <span style={{ fontSize: 13, fontWeight: 800, color: C.text }}>
            {summary.label}
          </span>
        </div>
        <Badge color={summary.color}>Step {index + 1}</Badge>
      </div>

      {summary.fields.length === 0 ? (
        <div style={{ fontSize: 11, color: C.muted }}>
          No extra configuration required for this node.
        </div>
      ) : (
        summary.fields.map((field) => (
          <div key={`${field.label}-${field.value}`}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>
              {field.label}
            </div>
            <div
              style={{
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                padding: "9px 10px",
                fontSize: 11,
                lineHeight: 1.5,
                color: C.text,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}
            >
              {field.value}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function CrudDemoPage({ deployedList }) {
  const crudApis = useMemo(
    () => ({
      read: deployedList.find((workflow) => workflow.id === CRUD_WORKFLOW_IDS.read) || null,
      create: deployedList.find((workflow) => workflow.id === CRUD_WORKFLOW_IDS.create) || null,
      update: deployedList.find((workflow) => workflow.id === CRUD_WORKFLOW_IDS.update) || null,
      delete: deployedList.find((workflow) => workflow.id === CRUD_WORKFLOW_IDS.delete) || null,
    }),
    [deployedList],
  );

  const [products, setProducts] = useState([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");
  const [loadedReadApiId, setLoadedReadApiId] = useState("");
  const [createForm, setCreateForm] = useState({
    name: "",
    category: "",
    price: 99,
    stock: 10,
  });
  const [editForm, setEditForm] = useState({
    id: "",
    name: "",
    category: "",
    price: 0,
    stock: 0,
  });
  const addSectionRef = useRef(null);
  const editSectionRef = useRef(null);
  const selectedProductId = Number(editForm.id) || 0;
  const selectedProduct = products.find((product) => Number(product.id) === selectedProductId) || null;
  const scrollToAddForm = useCallback(() => {
    addSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const scrollToEditForm = useCallback(() => {
    editSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);
  const resetCreateForm = useCallback(() => {
    setCreateForm({ name: "", category: "", price: 99, stock: 10 });
  }, []);
  const clearEditSelection = useCallback(() => {
    setEditForm({ id: "", name: "", category: "", price: 0, stock: 0 });
  }, []);

  const missingApis = Object.entries(CRUD_WORKFLOW_NAMES)
    .filter(([key]) => !crudApis[key])
    .map(([, label]) => label);

  const refreshProducts = useCallback(async () => {
    if (!crudApis.read?.id) {
      setProducts([]);
      setLoadedReadApiId("");
      return;
    }

    setLoadingProducts(true);
    try {
      const { data } = await apiClient.post(`/api/run/${crudApis.read.id}`, { input: "" });
      setProducts(Array.isArray(data.data) ? data.data : []);
      setLoadedReadApiId(crudApis.read.id);
    } catch (eventualError) {
      setNotice(`Could not load products: ${formatApiError(eventualError.response?.data, eventualError.message)}`);
    } finally {
      setLoadingProducts(false);
    }
  }, [crudApis.read]);

  useEffect(() => {
    if (crudApis.read?.id && loadedReadApiId !== crudApis.read.id) {
      refreshProducts();
    }
  }, [crudApis.read?.id, loadedReadApiId, refreshProducts]);

  const handleCreate = async (event) => {
    event.preventDefault();
    if (!crudApis.create?.id) {
      setNotice("Deploy the Products Create API first.");
      return;
    }

    const validationMessage = validateProductPayload(createForm);
    if (validationMessage) {
      setNotice(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await apiClient.post(`/api/run/${crudApis.create.id}`, {
        ...createForm,
        name: String(createForm.name).trim(),
        category: String(createForm.category).trim(),
        price: Number(createForm.price),
        stock: Number(createForm.stock),
      });
      const createdProduct = Array.isArray(data.data) ? data.data[0] : null;
      if (createdProduct) {
        setProducts((current) => [createdProduct, ...current]);
      }
      resetCreateForm();
      setNotice(createdProduct ? `Created ${createdProduct.name} successfully.` : "Product created successfully.");
      await refreshProducts();
      requestAnimationFrame(() => scrollToAddForm());
    } catch (eventualError) {
      setNotice(formatApiError(eventualError.response?.data, eventualError.message));
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (product) => {
    setEditForm({
      id: Number(product.id),
      name: product.name,
      category: product.category,
      price: Number(product.price),
      stock: Number(product.stock),
    });
    setNotice(`Editing ${product.name}. Update the fields and click Save Changes.`);
    requestAnimationFrame(() => scrollToEditForm());
  };

  const handleUpdate = async (event) => {
    event.preventDefault();
    if (!crudApis.update?.id) {
      setNotice("Deploy the Products Update API first.");
      return;
    }

    const validationMessage = validateProductPayload(editForm, true);
    if (validationMessage) {
      setNotice(validationMessage);
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await apiClient.post(`/api/run/${crudApis.update.id}`, {
        ...editForm,
        id: Number(editForm.id),
        name: String(editForm.name).trim(),
        category: String(editForm.category).trim(),
        price: Number(editForm.price),
        stock: Number(editForm.stock),
      });
      const updatedProduct = Array.isArray(data.data) ? data.data[0] : null;
      if (updatedProduct) {
        setProducts((current) =>
          current.map((product) => (product.id === updatedProduct.id ? updatedProduct : product)),
        );
        setEditForm({
          id: updatedProduct.id,
          name: updatedProduct.name,
          category: updatedProduct.category,
          price: updatedProduct.price,
          stock: updatedProduct.stock,
        });
      }
      setNotice(
        updatedProduct
          ? `Updated ${updatedProduct.name} successfully.`
          : "No product was updated. Select a valid product and try again.",
      );
      await refreshProducts();
    } catch (eventualError) {
      setNotice(formatApiError(eventualError.response?.data, eventualError.message));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (product) => {
    if (!crudApis.delete?.id) {
      setNotice("Deploy the Products Delete API first.");
      return;
    }

    if (!product?.id) {
      setNotice("Choose a valid product before deleting.");
      return;
    }

    setSubmitting(true);
    try {
      const { data } = await apiClient.post(`/api/run/${crudApis.delete.id}`, { id: product.id });
      const deletedProduct = Array.isArray(data.data) ? data.data[0] : null;
      if (deletedProduct) {
        setProducts((current) => current.filter((item) => item.id !== deletedProduct.id));
      }
      setNotice(
        deletedProduct
          ? `Deleted ${deletedProduct.name} successfully.`
          : "No product was deleted. Select a valid product and try again.",
      );
      if (Number(editForm.id) === Number(product.id)) {
        clearEditSelection();
      }
      await refreshProducts();
    } catch (eventualError) {
      setNotice(formatApiError(eventualError.response?.data, eventualError.message));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "340px minmax(0, 1fr)",
        gap: 18,
        height: "100%",
        padding: 18,
      }}
    >
      <div style={{ ...PANEL_STYLE, padding: 18, overflow: "auto" }}>
        <Section title="Demo Setup">
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ ...CARD_STYLE, padding: 14, fontSize: 12, color: C.text, lineHeight: 1.7 }}>
              This page behaves like a simple e-commerce admin website powered by your deployed workflow APIs.
            </div>
            <div style={{ ...CARD_STYLE, padding: 14, fontSize: 11, color: C.muted, lineHeight: 1.7 }}>
              {missingApis.length === 0
                ? "All 4 CRUD APIs are connected automatically. Use Read, Write, Update, and Delete directly from this page."
                : `Deploy these APIs first: ${missingApis.join(", ")}`}
            </div>
          </div>
        </Section>

        <Section title="Connected APIs">
          <div style={{ display: "grid", gap: 8 }}>
            {Object.entries(CRUD_WORKFLOW_NAMES).map(([key, label]) => {
              const workflow = crudApis[key];
              return (
                <div key={label} style={{ ...CARD_STYLE, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 800, color: workflow ? C.success : C.warning }}>
                    {label}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                    {workflow ? `Connected to ${workflow.id}` : "Not deployed yet"}
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <div ref={addSectionRef}>
        <Section title="Add Product">
          <div style={{ ...CARD_STYLE, padding: 12, marginBottom: 12, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            Fill these fields to add a new product to the store. The table updates immediately after you save.
          </div>
          <form onSubmit={handleCreate} style={{ display: "grid", gap: 10 }}>
            <input
              value={createForm.name}
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Product name"
              style={FORM_INPUT_STYLE}
            />
            <input
              value={createForm.category}
              onChange={(event) => setCreateForm((current) => ({ ...current, category: event.target.value }))}
              placeholder="Category"
              style={FORM_INPUT_STYLE}
            />
            <input
              type="number"
              value={createForm.price}
              onChange={(event) => setCreateForm((current) => ({ ...current, price: Number(event.target.value) }))}
              placeholder="Price"
              style={FORM_INPUT_STYLE}
            />
            <input
              type="number"
              value={createForm.stock}
              onChange={(event) => setCreateForm((current) => ({ ...current, stock: Number(event.target.value) }))}
              placeholder="Stock"
              style={FORM_INPUT_STYLE}
            />
            <button
              type="submit"
              disabled={submitting || missingApis.length > 0}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                cursor: submitting || missingApis.length > 0 ? "not-allowed" : "pointer",
                background: "linear-gradient(135deg, #40e0d0 0%, #9cff8f 100%)",
                color: "#04111f",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              Create Product
            </button>
            <button
              type="button"
              onClick={resetCreateForm}
              disabled={submitting}
              style={{
                padding: "11px 14px",
                borderRadius: 14,
                border: `1px solid ${C.borderStrong}`,
                cursor: submitting ? "not-allowed" : "pointer",
                background: "transparent",
                color: C.text,
                fontFamily: FONT_SANS,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Clear Add Form
            </button>
          </form>
        </Section>
        </div>

        <div ref={editSectionRef}>
        <Section title="Edit Selected Product">
          <div style={{ ...CARD_STYLE, padding: 12, marginBottom: 12, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
            {selectedProduct
              ? `Selected: ${selectedProduct.name} (#${selectedProduct.id}). Change any field below, then click Save Changes.`
              : "Click any product card or the Edit button in the list to load it here."}
          </div>
          <form onSubmit={handleUpdate} style={{ display: "grid", gap: 10 }}>
            <input value={editForm.id} readOnly placeholder="Select a product from the table" style={FORM_INPUT_STYLE} />
            <input
              value={editForm.name}
              onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Product name"
              style={FORM_INPUT_STYLE}
            />
            <input
              value={editForm.category}
              onChange={(event) => setEditForm((current) => ({ ...current, category: event.target.value }))}
              placeholder="Category"
              style={FORM_INPUT_STYLE}
            />
            <input
              type="number"
              value={editForm.price}
              onChange={(event) => setEditForm((current) => ({ ...current, price: Number(event.target.value) }))}
              placeholder="Price"
              style={FORM_INPUT_STYLE}
            />
            <input
              type="number"
              value={editForm.stock}
              onChange={(event) => setEditForm((current) => ({ ...current, stock: Number(event.target.value) }))}
              placeholder="Stock"
              style={FORM_INPUT_STYLE}
            />
            <button
              type="submit"
              disabled={submitting || !editForm.id || missingApis.length > 0}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                cursor: submitting || !editForm.id || missingApis.length > 0 ? "not-allowed" : "pointer",
                background: "linear-gradient(135deg, #ffd36e 0%, #ff8a5b 100%)",
                color: "#04111f",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              Save Changes
            </button>
            <button
              type="button"
              onClick={clearEditSelection}
              disabled={submitting || !editForm.id}
              style={{
                padding: "11px 14px",
                borderRadius: 14,
                border: `1px solid ${C.borderStrong}`,
                cursor: submitting || !editForm.id ? "not-allowed" : "pointer",
                background: "transparent",
                color: C.text,
                fontFamily: FONT_SANS,
                fontSize: 12,
                fontWeight: 800,
              }}
            >
              Clear Selection
            </button>
            <button
              type="button"
              onClick={() => {
                const selectedProduct = products.find((product) => product.id === selectedProductId);
                if (!selectedProduct) {
                  setNotice("Choose a product from the table before deleting.");
                  return;
                }
                handleDelete(selectedProduct);
              }}
              disabled={submitting || !editForm.id || missingApis.length > 0}
              style={{
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                cursor: submitting || !editForm.id || missingApis.length > 0 ? "not-allowed" : "pointer",
                background: "linear-gradient(135deg, #ff6f91 0%, #ff8a5b 100%)",
                color: "#04111f",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 900,
              }}
            >
              Delete Selected Product
            </button>
          </form>
        </Section>
        </div>
      </div>

      <div style={{ ...PANEL_STYLE, padding: 18, overflow: "auto" }}>
        <Section
          title="Read Products"
          action={
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button
                type="button"
                onClick={scrollToAddForm}
                style={{
                  border: "none",
                  background: "transparent",
                  color: C.success,
                  cursor: "pointer",
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                }}
              >
                Add Product
              </button>
              <button
                type="button"
                onClick={refreshProducts}
                style={{
                  border: "none",
                  background: "transparent",
                  color: C.accent,
                  cursor: "pointer",
                  fontFamily: FONT_MONO,
                  fontSize: 10,
                  letterSpacing: "0.06em",
                }}
              >
                Refresh
              </button>
            </div>
          }
        >
          {notice ? (
            <div style={{ ...CARD_STYLE, padding: 12, marginBottom: 12, fontSize: 11, color: C.text }}>
              {notice}
            </div>
          ) : null}

          {loadingProducts ? (
            <div style={{ ...CARD_STYLE, padding: 14, fontSize: 12, color: C.muted }}>
              Loading products...
            </div>
          ) : products.length === 0 ? (
            <div style={{ ...CARD_STYLE, padding: 14, fontSize: 12, color: C.muted }}>
              No products yet. Use the add form to create one.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 10 }}>
              {products.map((product) => (
                <div
                  key={product.id}
                  onClick={() => startEdit(product)}
                  style={{
                    ...CARD_STYLE,
                    padding: 14,
                    cursor: "pointer",
                    border:
                      Number(product.id) === selectedProductId
                        ? `1px solid ${C.accent}`
                        : `1px solid ${C.border}`,
                    boxShadow:
                      Number(product.id) === selectedProductId
                        ? `0 0 0 2px ${C.accent}22`
                        : "none",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: C.text }}>
                        {product.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>
                        #{product.id} | {product.category}
                      </div>
                    </div>
                    <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
                      <Badge color={product.stock > 0 ? C.success : C.danger}>
                        {product.stock} in stock
                      </Badge>
                      {Number(product.id) === selectedProductId ? (
                        <span style={{ fontSize: 10, fontWeight: 800, color: C.accent }}>
                          Selected for edit
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
                    <div style={{ fontSize: 12, color: C.text }}>
                      ${product.price}
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          startEdit(product);
                        }}
                        style={{
                          border: "none",
                          borderRadius: 10,
                          background: "linear-gradient(135deg, #63f5e7 0%, #5bb6ff 100%)",
                          color: "#04111f",
                          cursor: "pointer",
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "8px 11px",
                        }}
                      >
                        Edit Product
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleDelete(product);
                        }}
                        disabled={submitting || missingApis.length > 0}
                        style={{
                          border: "none",
                          borderRadius: 10,
                          background: "linear-gradient(135deg, #ff6f91 0%, #ff8a5b 100%)",
                          color: "#04111f",
                          cursor: submitting || missingApis.length > 0 ? "not-allowed" : "pointer",
                          fontSize: 11,
                          fontWeight: 800,
                          padding: "8px 11px",
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function DeployPanel({ result, onClose, onDelete, deleting }) {
  const workflowRequirements = useMemo(
    () => (Array.isArray(result.nodes) ? result.nodes : []),
    [result.nodes],
  );
  const requestFields = useMemo(
    () => extractRequestFields(workflowRequirements),
    [workflowRequirements],
  );
  const [inputText, setInputText] = useState("Hello, API Alchemist!");
  const [jsonInput, setJsonInput] = useState(buildPayloadFromWorkflow(result.nodes, "Hello, API Alchemist!"));
  const [testResult, setTestResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [testApiKey, setTestApiKey] = useState(result.api_key || "");
  const [versions, setVersions] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    const nextText = "Hello, API Alchemist!";
    setInputText(nextText);
    setJsonInput(buildPayloadFromWorkflow(result.nodes, nextText));
    setTestResult(null);
    setError("");
    setTestApiKey(result.api_key || "");
  }, [result.workflow_id]);

  useEffect(() => {
    if (!result.workflow_id) {
      return;
    }

    apiClient
      .get(`/workflows/${result.workflow_id}/versions`)
      .then((response) => setVersions(response.data.versions || []))
      .catch(() => setVersions([]));

    apiClient
      .get(`/workflows/${result.workflow_id}/logs?limit=8`)
      .then((response) => setLogs(response.data.logs || []))
      .catch(() => setLogs([]));

    apiClient
      .get(`/workflows/${result.workflow_id}/stats`)
      .then((response) => setStats(response.data.stats || null))
      .catch(() => setStats(null));
  }, [result.workflow_id, testResult]);

  const endpointUrl =
    result.endpoint_url || buildPublicApiUrl(`/api/run/${result.workflow_id}`);

  const apiDocs = result.api_docs || {
    endpoint: endpointUrl,
    method: result.method || "POST",
    body: result.input_format || { input: "string" },
    headers: result.headers_format || { "Content-Type": "application/json" },
    example_response: result.example_response || {
      status: "success",
      workflow_id: result.workflow_id,
      version: result.version || 1,
      data: "result payload",
    },
  };

  const workflowStory = useMemo(
    () => describeWorkflow(workflowRequirements),
    [workflowRequirements],
  );
  const responseValue = testResult?.data ?? testResult?.result;
  const friendlyResponseStory = useMemo(() => {
    if (!testResult) {
      return "Run the API once and this area will explain the response in simple language.";
    }

    if (testResult.status === "success") {
      const description = describeResultValue(responseValue);
      return `The API ran successfully and returned ${description}.`;
    }

    return "The API responded, but something still needs attention.";
  }, [responseValue, testResult]);

  const handleTextChange = (event) => {
    const nextValue = event.target.value;
    setInputText(nextValue);
    setJsonInput(buildPayloadFromWorkflow(result.nodes, nextValue));
  };

  const runTest = async () => {
    setLoading(true);
    setError("");
    setTestResult(null);

    try {
      const body = JSON.parse(jsonInput);
      const headers = result.auth_required && testApiKey
        ? { "x-api-key": testApiKey }
        : undefined;
      const { data } = await apiClient.post(
        `/api/run/${result.workflow_id}`,
        body,
        { headers },
      );
      setTestResult(data);
    } catch (eventualError) {
      setError(formatApiError(eventualError.response?.data, eventualError.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        ...PANEL_STYLE,
        height: "100%",
        overflow: "auto",
        padding: 22,
        width: 390,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          marginBottom: 18,
        }}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <Badge color={C.success}>Live API Ready</Badge>
          <div style={{ fontSize: 20, fontWeight: 900, color: C.text }}>
            {result.name || "Deployed workflow"}
          </div>
          <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.5 }}>
            This view explains your live API in simple language, so someone can understand how to use it even without technical knowledge.
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            onClick={() => onDelete(result)}
            disabled={deleting}
            style={{
              border: `1px solid ${C.danger}44`,
              borderRadius: 12,
              background: deleting ? "rgba(255, 111, 145, 0.16)" : "rgba(255, 111, 145, 0.12)",
              color: C.danger,
              cursor: deleting ? "not-allowed" : "pointer",
              fontFamily: FONT_SANS,
              fontSize: 12,
              fontWeight: 800,
              padding: "10px 12px",
            }}
          >
            {deleting ? "Deleting..." : "Delete API"}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: `1px solid ${C.border}`,
              borderRadius: 12,
              color: C.muted,
              cursor: "pointer",
              fontSize: 18,
              width: 38,
              height: 38,
            }}
          >
            x
          </button>
        </div>
      </div>

      <Section title="What This API Does">
        <div style={{ ...CARD_STYLE, padding: 14, fontSize: 12, color: C.text, lineHeight: 1.7 }}>
          {workflowStory}
        </div>
      </Section>

      <Section title="Simple Guide">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 5 }}>1. Share This Link</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, color: C.accent, wordBreak: "break-all" }}>
              {endpointUrl}
            </div>
          </div>
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 5 }}>2. Send This Kind Of Input</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
              Send text in the <span style={{ color: C.accent, fontFamily: FONT_MONO }}>input</span> field.
            </div>
          </div>
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 5 }}>3. Get This Back</div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
              A final response after your workflow steps are completed.
            </div>
          </div>
        </div>
      </Section>

      <Section title="How To Use It">
        <div
          style={{
            ...CARD_STYLE,
            padding: 14,
            display: "grid",
            gap: 10,
          }}
        >
          <div style={{ fontSize: 11, color: C.muted }}>POST</div>
          <div
            style={{
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: C.accent,
              wordBreak: "break-all",
            }}
          >
            {endpointUrl}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, color: C.muted }}>
              Request type: <span style={{ color: C.text }}>{result.method || "POST"}</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              Version: <span style={{ color: C.text }}>v{result.version || 1}</span>
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>
              What you send
            </div>
            <pre
              style={{
                margin: 0,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                fontFamily: FONT_MONO,
                fontSize: 10,
                padding: "10px 11px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(result.input_format || { input: "string" }, null, 2)}
            </pre>
            <div style={{ fontSize: 11, color: C.muted }}>
              Access:{" "}
              <span style={{ color: result.auth_required ? C.warning : C.success }}>
                {result.auth_required ? "Protected with a secret key" : "Open for anyone to use"}
              </span>
            </div>
            {result.auth_required ? (
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                Security:{" "}
                <span style={{ color: C.text }}>
                  each workflow has its own saved key
                  {result.api_key_preview ? ` (${result.api_key_preview})` : ""}
                </span>
              </div>
            ) : null}
            {result.api_key ? (
              <div style={{ fontSize: 11, color: C.warning, lineHeight: 1.5 }}>
                One-time secret key: <span style={{ color: C.text }}>{result.api_key}</span>
              </div>
            ) : null}
          </div>
          <div
            style={{
              background: "#07101c",
              border: `1px solid ${C.border}`,
              borderRadius: 10,
              color: C.warning,
              fontFamily: FONT_MONO,
              fontSize: 10,
              padding: "10px 11px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-all",
            }}
          >
            {result.curl_example}
          </div>
        </div>
      </Section>

      <Section title="Technical Details">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...CARD_STYLE, padding: 14, display: "grid", gap: 8 }}>
            <div style={{ fontSize: 11, color: C.muted }}>Endpoint</div>
            <div
              style={{
                fontFamily: FONT_MONO,
                fontSize: 11,
                color: C.accent,
                wordBreak: "break-all",
              }}
            >
              {apiDocs.endpoint}
            </div>
            <div style={{ fontSize: 11, color: C.muted }}>Method</div>
            <div style={{ fontSize: 12, color: C.text, fontWeight: 800 }}>
              {apiDocs.method || "POST"}
            </div>
          </div>

          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Headers</div>
            <pre
              style={{
                margin: 0,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                fontFamily: FONT_MONO,
                fontSize: 10,
                padding: "10px 11px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(apiDocs.headers || { "Content-Type": "application/json" }, null, 2)}
            </pre>
          </div>

          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Body</div>
            <pre
              style={{
                margin: 0,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.text,
                fontFamily: FONT_MONO,
                fontSize: 10,
                padding: "10px 11px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(apiDocs.body || { input: "string" }, null, 2)}
            </pre>
          </div>

          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Example response</div>
            <pre
              style={{
                margin: 0,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 10,
                color: C.success,
                fontFamily: FONT_MONO,
                fontSize: 10,
                padding: "10px 11px",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {JSON.stringify(apiDocs.example_response || result.example_response || {}, null, 2)}
            </pre>
          </div>
        </div>
      </Section>

      <Section title={`What Happens Inside (${workflowRequirements.length})`}>
        <div style={{ display: "grid", gap: 10 }}>
          {workflowRequirements.length === 0 ? (
            <div style={{ ...CARD_STYLE, padding: 14, fontSize: 11, color: C.muted }}>
              No node details are available for this deployment yet.
            </div>
          ) : (
            workflowRequirements.map((node, index) => (
              <RequirementCard key={node.id || `${node.type}-${index}`} node={node} index={index} />
            ))
          )}
        </div>
      </Section>

      <Section title={`Versions (${versions.length})`}>
        <div style={{ display: "grid", gap: 8 }}>
          {versions.length === 0 ? (
            <div style={{ ...CARD_STYLE, padding: 14, fontSize: 11, color: C.muted }}>
              No version history yet.
            </div>
          ) : (
            versions.map((versionItem) => (
              <div
                key={`${versionItem.workflow_id}-${versionItem.version}`}
                style={{ ...CARD_STYLE, padding: 12, fontSize: 11, color: C.text }}
              >
                <div style={{ fontWeight: 800 }}>v{versionItem.version}</div>
                <div style={{ color: C.muted, marginTop: 4 }}>
                  {new Date(versionItem.created * 1000).toLocaleString()}
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="At A Glance">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Total Requests</div>
            <div style={{ fontSize: 22, fontWeight: 900, color: C.text }}>
              {stats?.total_requests ?? 0}
            </div>
          </div>
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Success vs Failure</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, lineHeight: 1.6 }}>
              <span style={{ color: C.success }}>{stats?.success_count ?? 0} success</span>
              {" / "}
              <span style={{ color: C.danger }}>{stats?.failure_count ?? 0} failed</span>
            </div>
          </div>
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Last Execution</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, lineHeight: 1.6 }}>
              {stats?.last_execution_time
                ? new Date(stats.last_execution_time * 1000).toLocaleString()
                : "No runs yet"}
            </div>
          </div>
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Last Result</div>
            <div style={{ fontSize: 12, fontWeight: 800, color: C.text, lineHeight: 1.6 }}>
              {stats?.last_status_code ? `HTTP ${stats.last_status_code}` : "No runs yet"}
              {stats?.last_elapsed_ms ? ` in ${stats.last_elapsed_ms} ms` : ""}
            </div>
          </div>
        </div>
      </Section>

      <Section title="Try It Yourself">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
              Input text
            </div>
            <textarea
              value={inputText}
              onChange={handleTextChange}
              style={{
                width: "100%",
                minHeight: 90,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                color: C.text,
                fontFamily: FONT_SANS,
                fontSize: 13,
                padding: "12px 13px",
                resize: "vertical",
              }}
              placeholder="Type what you want to send into the API..."
            />
            {requestFields.length > 0 ? (
              <div style={{ fontSize: 10, color: C.muted, marginTop: 8, lineHeight: 1.6 }}>
                This workflow needs these request fields:{" "}
                <span style={{ color: C.text, fontFamily: FONT_MONO }}>
                  {requestFields.join(", ")}
                </span>
              </div>
            ) : null}
          </div>

          {result.auth_required ? (
            <div style={{ ...CARD_STYLE, padding: 14 }}>
              <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
                API key
              </div>
              <input
                value={testApiKey}
                onChange={(event) => setTestApiKey(event.target.value)}
                style={{
                  width: "100%",
                  background: "#07101c",
                  border: `1px solid ${C.border}`,
                  borderRadius: 12,
                  color: C.text,
                  fontFamily: FONT_MONO,
                  fontSize: 11,
                  padding: "12px 13px",
                }}
                placeholder="x-api-key"
              />
            </div>
          ) : null}

          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
              Request JSON
            </div>
            <textarea
              value={jsonInput}
              onChange={(event) => setJsonInput(event.target.value)}
              style={{
                width: "100%",
                minHeight: 135,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                color: C.text,
                fontFamily: FONT_MONO,
                fontSize: 11,
                padding: "12px 13px",
                resize: "vertical",
              }}
            />
            <button
              type="button"
              onClick={runTest}
              disabled={loading}
              style={{
                marginTop: 12,
                width: "100%",
                padding: "12px 14px",
                borderRadius: 14,
                border: "none",
                cursor: loading ? "not-allowed" : "pointer",
                background: loading
                  ? "rgba(133, 153, 184, 0.24)"
                  : "linear-gradient(135deg, #40e0d0 0%, #ff8a5b 100%)",
                color: "#04111f",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: "0.08em",
              }}
            >
              {loading ? "Running..." : "Send Live Request"}
            </button>
          </div>
        </div>
      </Section>

      {error ? (
        <div
          style={{
            background: "rgba(255, 111, 145, 0.14)",
            border: `1px solid ${C.danger}55`,
            borderRadius: 14,
            color: C.danger,
            fontFamily: FONT_MONO,
            fontSize: 11,
            padding: "12px 14px",
            marginBottom: 18,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          Something needs attention: {error}
        </div>
      ) : null}

      <Section title="What You Get Back">
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
              Easy explanation
            </div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.7 }}>
              {friendlyResponseStory}
            </div>
          </div>

          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
              Response summary
            </div>
            <div style={{ fontSize: 12, color: C.text, lineHeight: 1.6 }}>
              {testResult
                ? `Completed in ${testResult.elapsed_ms} ms across ${testResult.runs_total} total run(s).`
                : "Run the API to see the output here."}
            </div>
          </div>

          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
              Output text
            </div>
            <textarea
              readOnly
              value={testResult ? formatJson(testResult.result) : ""}
              style={{
                width: "100%",
                minHeight: 110,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                color: C.success,
                fontFamily: FONT_MONO,
                fontSize: 11,
                padding: "12px 13px",
                resize: "vertical",
              }}
              placeholder="Live API output will appear here."
            />
          </div>

          <div style={{ ...CARD_STYLE, padding: 14 }}>
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>
              Full response JSON
            </div>
            <pre
              style={{
                margin: 0,
                background: "#07101c",
                border: `1px solid ${C.border}`,
                borderRadius: 12,
                padding: "12px 13px",
                minHeight: 120,
                color: C.text,
                fontFamily: FONT_MONO,
                fontSize: 11,
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {testResult ? JSON.stringify(testResult, null, 2) : "{}"}
            </pre>
          </div>
        </div>
      </Section>

      <Section title={`Recent Activity (${logs.length})`}>
        <div style={{ display: "grid", gap: 8 }}>
          {logs.length === 0 ? (
            <div style={{ ...CARD_STYLE, padding: 14, fontSize: 11, color: C.muted }}>
              No usage logs yet.
            </div>
          ) : (
            logs.map((log) => (
              <div key={log.id} style={{ ...CARD_STYLE, padding: 12 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    alignItems: "center",
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 800, color: C.text }}>
                    Status {log.status_code} - v{log.version}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted }}>
                    {log.elapsed_ms ?? "--"} ms
                  </div>
                </div>
                <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                  {new Date(log.created * 1000).toLocaleString()}
                </div>
                {log.error_text ? (
                  <div style={{ fontSize: 10, color: C.danger, marginTop: 6 }}>
                    {log.error_text}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Section>
    </div>
  );
}

export default function App() {
  const [deployResult, setDeployResult] = useState(null);
  const [deployedList, setDeployedList] = useState([]);
  const [deploying, setDeploying] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState("builder");
  const [workflowName, setWorkflowName] = useState("My First API");
  const [backendOk, setBackendOk] = useState(null);
  const [sidebarView, setSidebarView] = useState("components");
  const [selectedWorkflow, setSelectedWorkflow] = useState(null);
  const [authEnabled, setAuthEnabled] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [appNotice, setAppNotice] = useState(null);
  const [deletingWorkflowId, setDeletingWorkflowId] = useState("");
  const [autoProvisioning, setAutoProvisioning] = useState(false);
  const [workflowsLoaded, setWorkflowsLoaded] = useState(false);
  const [lastCrudProvisionSignature, setLastCrudProvisionSignature] = useState("");
  const hasAllCrudApis = useMemo(() => getCrudApiStatus(deployedList), [deployedList]);
  const crudTemplatesNeedingProvision = useMemo(
    () => getCrudTemplatesNeedingProvision(deployedList),
    [deployedList],
  );
  const crudProvisionSignature = useMemo(
    () => crudTemplatesNeedingProvision.map((template) => template.workflow_id).sort().join("|"),
    [crudTemplatesNeedingProvision],
  );

  const fetchWorkflows = useCallback(async () => {
    try {
      const response = await apiClient.get("/workflows");
      setDeployedList(response.data);
      setWorkflowsLoaded(true);
      return response.data;
    } catch {
      setWorkflowsLoaded(true);
      return [];
    }
  }, []);

  useEffect(() => {
    apiClient
      .get("/health")
      .then(() => {
        setBackendOk(true);
        setAppNotice(null);
      })
      .catch(() => {
        setBackendOk(false);
        setAppNotice({
          tone: "warning",
          title: "Backend offline",
          message: "The frontend cannot reach the backend right now. Start FastAPI or check the API base URL, then try deploy again.",
        });
      });
  }, []);

  useEffect(() => {
    fetchWorkflows();
    if (workspaceMode !== "builder") {
      return undefined;
    }

    const intervalId = setInterval(fetchWorkflows, 5000);
    return () => clearInterval(intervalId);
  }, [fetchWorkflows, workspaceMode]);

  useEffect(() => {
    if (!hasAllCrudApis && workspaceMode === "demo") {
      setWorkspaceMode("builder");
      setAppNotice({
        tone: "warning",
        title: "Web demo locked",
        message: "Deploy all 4 CRUD APIs first: Products Read, Create, Update, and Delete.",
      });
    }
  }, [hasAllCrudApis, workspaceMode]);

  useEffect(() => {
    if (
      !backendOk ||
      !workflowsLoaded ||
      autoProvisioning ||
      !crudProvisionSignature ||
      crudProvisionSignature === lastCrudProvisionSignature
    ) {
      return;
    }

    let cancelled = false;

    const provisionCrudApis = async () => {
      setAutoProvisioning(true);
      setLastCrudProvisionSignature(crudProvisionSignature);

      try {
        const currentList = await fetchWorkflows();
        const templatesToDeploy = getCrudTemplatesNeedingProvision(currentList);

        if (cancelled) {
          return;
        }

        if (templatesToDeploy.length > 0) {
          setAppNotice({
            tone: "warning",
            title: "Preparing web demo",
            message:
              templatesToDeploy.length === ECOMMERCE_CRUD_TEMPLATES.length
                ? "Creating the 4 CRUD APIs automatically so the web demo can open."
                : "Repairing the CRUD APIs automatically so the web demo works correctly.",
          });
        }

        for (const template of templatesToDeploy) {
          await apiClient.post("/deploy", buildCrudTemplatePayload(template));
        }

        if (cancelled) {
          return;
        }

        const nextList = await fetchWorkflows();
        setDeployedList(nextList);

        if (getCrudApiStatus(nextList)) {
          setWorkspaceMode("demo");
          if (templatesToDeploy.length > 0) {
            setAppNotice({
              tone: "warning",
              title: "Web demo ready",
              message: "All 4 CRUD APIs are ready now, so the Web Demo has opened automatically.",
            });
          }
        }
      } catch (eventualError) {
        if (!cancelled) {
          setAppNotice({
            tone: "danger",
            title: "Auto deploy warning",
            message: formatApiError(eventualError.response?.data, eventualError.message),
          });
        }
      } finally {
        if (!cancelled) {
          setAutoProvisioning(false);
        }
      }
    };

    provisionCrudApis();

    return () => {
      cancelled = true;
    };
  }, [
    autoProvisioning,
    backendOk,
    crudProvisionSignature,
    fetchWorkflows,
    hasAllCrudApis,
    lastCrudProvisionSignature,
    workflowsLoaded,
  ]);

  const handleDeploy = useCallback(
    async (workflow) => {
      setDeploying(true);

      try {
        const { data } = await apiClient.post("/deploy", {
          workflow_id: selectedWorkflow?.id || undefined,
          name: workflowName,
          auth_enabled: authEnabled,
          api_key: apiKey.trim() || undefined,
          ...workflow,
        });
        setAppNotice(null);
        setDeployResult(data);
        setSelectedWorkflow(data);
        setSidebarView("deployments");
        setDeployedList((current) => {
          const nextList = [data, ...current.filter((item) => item.id !== data.id)];
          if (isCrudWorkflowId(data.id) && getCrudApiStatus(nextList)) {
            setWorkspaceMode("demo");
            setAppNotice({
              tone: "warning",
              title: "Web demo ready",
              message: "All 4 CRUD APIs are now deployed, so the Web Demo is open and ready to use.",
            });
          }
          return nextList;
        });
      } catch (eventualError) {
        setAppNotice({
          tone: "danger",
          title: "Deploy warning",
          message: formatApiError(eventualError.response?.data, eventualError.message),
        });
      } finally {
        setDeploying(false);
      }
    },
    [apiKey, authEnabled, selectedWorkflow, workflowName],
  );

  const sidebarStyle = {
    ...PANEL_STYLE,
    borderRadius: 0,
    borderLeft: "none",
    borderTop: "none",
    borderBottom: "none",
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "hidden",
    padding: "18px 18px",
    width: 360,
    flexShrink: 0,
  };

  const openWorkflow = useCallback((workflow) => {
    setWorkspaceMode("builder");
    setAppNotice(null);
    setDeployResult(workflow);
    setSelectedWorkflow(workflow);
    setWorkflowName(workflow.name || "My First API");
    setAuthEnabled(Boolean(workflow.auth_required));
    setApiKey("");
  }, []);

  const loadTemplate = useCallback((template) => {
    setDeployResult(null);
    setSelectedWorkflow({
      id: template.workflow_id,
      name: template.name,
      nodes: cloneWorkflowNodes(template.nodes),
      edges: cloneWorkflowEdges(template.edges),
      auth_required: false,
    });
    setWorkflowName(template.name);
    setAuthEnabled(false);
    setApiKey("");
    setSidebarView("components");
    setAppNotice({
      tone: "warning",
      title: "CRUD template loaded",
      message: `${template.name} is now on the canvas. Deploy it to create a live e-commerce backend endpoint.`,
    });
  }, []);

  const handleDeleteWorkflow = useCallback(
    async (workflow) => {
      if (!workflow?.id) {
        return;
      }

      setDeletingWorkflowId(workflow.id);

      try {
        await apiClient.delete(`/workflows/${workflow.id}`);
        setDeployedList((current) => current.filter((item) => item.id !== workflow.id));

        if (selectedWorkflow?.id === workflow.id) {
          setSelectedWorkflow(null);
          setDeployResult(null);
        }

        setAppNotice({
          tone: "warning",
          title: "API deleted",
          message: `${workflow.name || "Selected workflow"} was removed from deployed APIs.`,
        });
      } catch (eventualError) {
        setAppNotice({
          tone: "danger",
          title: "Delete warning",
          message: formatApiError(eventualError.response?.data, eventualError.message),
        });
      } finally {
        setDeletingWorkflowId("");
      }
    },
    [selectedWorkflow],
  );

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        color: C.text,
        fontFamily: FONT_SANS,
        background:
          "radial-gradient(circle at top left, rgba(64, 224, 208, 0.16), transparent 28%), radial-gradient(circle at top right, rgba(255, 138, 91, 0.18), transparent 26%), linear-gradient(180deg, #04111f 0%, #071523 45%, #020812 100%)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "16px 22px",
          borderBottom: `1px solid ${C.border}`,
          background: "rgba(3, 12, 23, 0.74)",
          backdropFilter: "blur(18px)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "grid", gap: 6 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontFamily: FONT_MONO,
              fontSize: 11,
              color: C.accent,
              letterSpacing: "0.1em",
            }}
          >
            <span>API</span>
            <span style={{ color: C.accentAlt }}>ALCHEMIST</span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
            {workspaceMode === "builder"
              ? "Build, deploy, and test one live API flow."
              : "Use your deployed APIs inside a working product admin page."}
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            onClick={() => setWorkspaceMode("builder")}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${workspaceMode === "builder" ? `${C.accent}55` : C.border}`,
              background: workspaceMode === "builder" ? "rgba(64, 224, 208, 0.12)" : "rgba(7, 16, 28, 0.72)",
              color: workspaceMode === "builder" ? C.text : C.muted,
              cursor: "pointer",
              fontFamily: FONT_SANS,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Builder
          </button>
          <button
            type="button"
            onClick={() => {
              if (!hasAllCrudApis) {
                setAppNotice({
                  tone: "warning",
                  title: "Deploy CRUD APIs first",
                  message: "Web Demo opens only after you deploy Products Read, Create, Update, and Delete APIs.",
                });
                return;
              }
              setWorkspaceMode("demo");
            }}
            disabled={!hasAllCrudApis}
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${workspaceMode === "demo" ? `${C.accentAlt}55` : C.border}`,
              background: workspaceMode === "demo" ? "rgba(255, 138, 91, 0.12)" : "rgba(7, 16, 28, 0.72)",
              color: workspaceMode === "demo" ? C.text : hasAllCrudApis ? C.muted : "rgba(127, 145, 170, 0.48)",
              cursor: hasAllCrudApis ? "pointer" : "not-allowed",
              opacity: hasAllCrudApis ? 1 : 0.72,
              fontFamily: FONT_SANS,
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            Web Demo
          </button>
        </div>

        <div style={{ flex: 1 }} />

        <div
          style={{
            ...CARD_STYLE,
            padding: "10px 12px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 185,
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background:
                backendOk === null ? C.warning : backendOk ? C.success : C.danger,
              boxShadow: `0 0 14px ${
                backendOk === null ? C.warning : backendOk ? C.success : C.danger
              }`,
            }}
          />
          <div style={{ display: "grid", gap: 2 }}>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>
              Backend
            </div>
            <div style={{ fontSize: 12, fontWeight: 700 }}>
              {backendOk === null
                ? "Checking..."
                : backendOk
                  ? "Backend live"
                  : "Backend offline"}
            </div>
          </div>
        </div>

        {workspaceMode === "builder" ? (
          <>
            <input
              value={workflowName}
              onChange={(event) => setWorkflowName(event.target.value)}
              placeholder="Workflow name"
              style={{
                width: 240,
                padding: "12px 14px",
                borderRadius: 14,
                border: `1px solid ${C.borderStrong}`,
                background: "rgba(7, 16, 28, 0.88)",
                color: C.text,
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 700,
              }}
            />

            <label
              style={{
                ...CARD_STYLE,
                padding: "10px 12px",
                display: "flex",
                alignItems: "center",
                gap: 8,
                color: C.text,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              <input
                type="checkbox"
                checked={authEnabled}
                onChange={(event) => setAuthEnabled(event.target.checked)}
              />
              Secure API
            </label>

            {authEnabled ? (
              <input
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder="Optional API key"
                style={{
                  width: 180,
                  padding: "12px 14px",
                  borderRadius: 14,
                  border: `1px solid ${C.borderStrong}`,
                  background: "rgba(7, 16, 28, 0.88)",
                  color: C.text,
                  fontFamily: FONT_MONO,
                  fontSize: 12,
                  fontWeight: 700,
                }}
              />
            ) : null}

            <button
              type="button"
              disabled={deploying}
              onClick={() => document.dispatchEvent(new Event("alchemist:deploy"))}
              style={{
                padding: "12px 18px",
                borderRadius: 14,
                border: "none",
                cursor: deploying ? "not-allowed" : "pointer",
                background: deploying
                  ? "rgba(133, 153, 184, 0.22)"
                  : "linear-gradient(135deg, #40e0d0 0%, #ff8a5b 100%)",
                color: "#04111f",
                fontFamily: FONT_SANS,
                fontSize: 13,
                fontWeight: 900,
                letterSpacing: "0.08em",
                boxShadow: deploying ? "none" : "0 18px 32px rgba(64, 224, 208, 0.18)",
              }}
            >
              {deploying ? "Deploying..." : "Deploy Live API"}
            </button>
          </>
        ) : (
          <div
            style={{
              ...CARD_STYLE,
              padding: "10px 14px",
              fontSize: 12,
              color: C.muted,
              lineHeight: 1.6,
              maxWidth: 340,
            }}
          >
            Deploy the 4 CRUD templates in Builder mode, then use this Web Demo tab as a live e-commerce admin page.
          </div>
        )}
      </div>

      {appNotice ? (
        <div
          style={{
            padding: "14px 22px 0",
            flexShrink: 0,
          }}
        >
          <div
            style={{
              ...CARD_STYLE,
              borderColor:
                appNotice.tone === "danger" ? `${C.danger}55` : `${C.warning}55`,
              background:
                appNotice.tone === "danger"
                  ? "rgba(255, 111, 145, 0.14)"
                  : "rgba(255, 211, 110, 0.12)",
              padding: "14px 16px",
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 14,
            }}
          >
            <div style={{ display: "grid", gap: 5 }}>
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 900,
                  color: appNotice.tone === "danger" ? C.danger : C.warning,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {appNotice.title}
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: C.text,
                  lineHeight: 1.6,
                  maxWidth: 880,
                }}
              >
                {appNotice.message}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAppNotice(null)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 10,
                border: `1px solid ${C.border}`,
                background: "rgba(7, 16, 28, 0.74)",
                color: C.muted,
                cursor: "pointer",
                fontSize: 15,
                lineHeight: 1,
                flexShrink: 0,
              }}
            >
              x
            </button>
          </div>
        </div>
      ) : null}

      {workspaceMode === "builder" ? (
      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <div style={sidebarStyle}>
          <div
            style={{
              ...CARD_STYLE,
              padding: 14,
              marginBottom: 14,
              display: "grid",
              gap: 12,
            }}
          >
            <div style={{ display: "grid", gap: 5 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: C.text }}>
                Workspace
              </div>
              <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                Switch between building blocks and deployed APIs without losing space in the sidebar.
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <SidebarTabButton
                active={sidebarView === "components"}
                count={NODE_PALETTE.length}
                onClick={() => setSidebarView("components")}
              >
                Components
              </SidebarTabButton>
              <SidebarTabButton
                active={sidebarView === "deployments"}
                count={deployedList.length}
                onClick={() => setSidebarView("deployments")}
              >
                Deployed APIs
              </SidebarTabButton>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
              }}
            >
              <div style={{ ...CARD_STYLE, padding: "10px 11px" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Nodes</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                  {NODE_PALETTE.length}
                </div>
              </div>
              <div style={{ ...CARD_STYLE, padding: "10px 11px" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Live APIs</div>
                <div style={{ fontSize: 16, fontWeight: 900, color: C.text }}>
                  {deployedList.length}
                </div>
              </div>
              <div style={{ ...CARD_STYLE, padding: "10px 11px" }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 4 }}>Status</div>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 900,
                    color:
                      backendOk === null ? C.warning : backendOk ? C.success : C.danger,
                  }}
                >
                  {backendOk === null ? "Check" : backendOk ? "Live" : "Offline"}
                </div>
              </div>
            </div>
          </div>

          {sidebarView === "components" ? (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                minHeight: 0,
              }}
            >
              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  paddingRight: 2,
                }}
              >
                <Section title={`Node Palette (${NODE_PALETTE.length})`}>
                  <div style={{ display: "grid", gap: 8, marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: C.muted, lineHeight: 1.5 }}>
                      Starter e-commerce CRUD workflows built with your existing blocks:
                    </div>
                    {ECOMMERCE_CRUD_TEMPLATES.map((template) => (
                      <TemplateCard
                        key={template.id}
                        template={template}
                        onLoad={loadTemplate}
                      />
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
                    Drag boxes onto the canvas to define the API requirements and execution steps.
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                      gap: 8,
                    }}
                  >
                    {NODE_PALETTE.map((node) => (
                      <PaletteCard key={node.type} node={node} />
                    ))}
                  </div>
                </Section>
              </div>
              <div
                style={{
                  marginTop: 12,
                  paddingTop: 14,
                  borderTop: `1px solid ${C.border}`,
                  display: "grid",
                  gap: 8,
                }}
              >
                <div style={{ ...CARD_STYLE, padding: "12px 13px", fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                  Connect nodes by dragging between handles, then use the top-right deploy button when the flow is ready.
                </div>
                <button
                  type="button"
                  onClick={() => setSidebarView("deployments")}
                  style={{
                    width: "100%",
                    padding: "11px 12px",
                    borderRadius: 14,
                    border: `1px solid ${C.border}`,
                    background: "rgba(7, 16, 28, 0.72)",
                    color: C.text,
                    cursor: "pointer",
                    fontFamily: FONT_SANS,
                    fontSize: 12,
                    fontWeight: 800,
                  }}
                >
                  View Deployed APIs
                </button>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                flex: 1,
              }}
            >
              <Section
                title={`Deployed APIs (${deployedList.length})`}
                action={
                  <button
                    type="button"
                    onClick={() => setSidebarView("components")}
                    style={{
                      border: "none",
                      background: "transparent",
                      color: C.accent,
                      cursor: "pointer",
                      fontFamily: FONT_MONO,
                      fontSize: 10,
                      letterSpacing: "0.06em",
                    }}
                  >
                    Build Mode
                  </button>
                }
              >
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 10, lineHeight: 1.5 }}>
                  Open any deployed workflow to inspect its endpoint, requirements, live input/output, and the exact flow on the canvas.
                </div>
              </Section>

              <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflow: "auto",
                  paddingRight: 2,
                }}
              >
                {deployedList.length === 0 ? (
                  <div style={{ ...CARD_STYLE, padding: 14, fontSize: 11, color: C.muted, lineHeight: 1.6 }}>
                    No live APIs yet. Deploy the current canvas and they will appear here with more room to browse.
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: 8 }}>
                    {deployedList.map((workflow) => (
                      <ApiRow
                        key={workflow.id}
                      workflow={{
                          ...workflow,
                          workflow_id: workflow.workflow_id || workflow.id,
                          endpoint_url:
                            workflow.endpoint_url || buildPublicApiUrl(`/api/run/${workflow.id}`),
                          curl_example:
                            workflow.curl_example ||
                            `curl -X POST "${buildPublicApiUrl(`/api/run/${workflow.id}`)}" -H "Content-Type: application/json" -d "{\\"input\\":\\"hello world\\"}"`,
                        }}
                        onSelect={openWorkflow}
                        onDelete={handleDeleteWorkflow}
                        deleting={deletingWorkflowId === workflow.id}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              inset: 18,
              ...PANEL_STYLE,
              overflow: "hidden",
            }}
          >
            <FlowBuilder onDeploy={handleDeploy} workflow={selectedWorkflow} />
          </div>
        </div>

        {deployResult ? (
          <div
            style={{
              height: "100%",
              overflow: "auto",
              padding: 18,
              paddingLeft: 0,
            }}
          >
            <DeployPanel
              result={deployResult}
              onClose={() => setDeployResult(null)}
              onDelete={handleDeleteWorkflow}
              deleting={deletingWorkflowId === deployResult.id}
            />
          </div>
        ) : null}
      </div>
      ) : (
        <div style={{ flex: 1, minHeight: 0 }}>
          <CrudDemoPage deployedList={deployedList} />
        </div>
      )}
    </div>
  );
}
