import { escapeHtml, escapeHtmlAttr, isSafeMdxHref } from "./validate";

function componentCssClass(component: string): string {
  return component.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
}

function inlineMarkdownToHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/_([^_]+)_/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label: string, href: string) =>
      isSafeMdxHref(href) ? `<a href="${escapeHtmlAttr(href)}">${label}</a>` : label
    );
}

type ChartDatum = { label: string; value: number };

const CHART_COMPONENTS = new Set(["ChartArea", "ChartBar", "ChartLine", "ChartPie"]);
const CHART_COLORS = ["#2563eb", "#16a34a", "#f97316", "#9333ea", "#dc2626", "#0891b2"];

function parseChartData(source: string): ChartDatum[] {
  const data: ChartDatum[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.trim().match(/^(?:[-*]\s*)?(?:\*\*)?([^:*]+?)(?:\*\*)?\s*:\s*(-?\d+(?:\.\d+)?)(?:\s*%?)?$/);
    if (!match) continue;
    data.push({ label: match[1].replace(/[`*_]/g, "").trim(), value: Number(match[2]) });
  }
  return data;
}

function renderChartSvg(component: string, data: ChartDatum[]): string {
  if (data.length === 0) return "";
  const width = 640;
  const height = 240;
  const pad = 34;
  const values = data.map((item) => item.value);
  const min = Math.min(0, ...values);
  const max = Math.max(1, ...values);
  const range = max - min || 1;
  const plotWidth = width - pad * 2;
  const plotHeight = height - pad * 2;
  const pointFor = (item: ChartDatum, index: number) => {
    const x = pad + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth);
    const y = pad + plotHeight - ((item.value - min) / range) * plotHeight;
    return { x, y };
  };
  const points = data.map(pointFor);
  const labels = data.map((item, index) => {
    const { x } = points[index];
    return `<text class="au-mdx-chart-label" x="${x}" y="${height - 6}" text-anchor="middle">${escapeHtml(item.label)}</text>`;
  }).join("");
  const axis = `<line class="au-mdx-chart-axis" x1="${pad}" y1="${height - pad}" x2="${width - pad}" y2="${height - pad}" />`;

  if (component === "ChartBar") {
    const gap = 12;
    const barWidth = Math.max(18, (plotWidth - gap * (data.length - 1)) / data.length);
    const bars = data.map((item, index) => {
      const barHeight = ((item.value - min) / range) * plotHeight;
      const x = pad + index * (barWidth + gap);
      const y = height - pad - barHeight;
      return `<rect class="au-mdx-chart-bar" x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="7"><title>${escapeHtml(item.label)}: ${item.value}</title></rect>`;
    }).join("");
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Bar chart">${axis}${bars}${labels}</svg>`;
  }

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  if (component === "ChartArea") {
    const area = `${pad},${height - pad} ${polyline} ${width - pad},${height - pad}`;
    return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Area chart">${axis}<polygon class="au-mdx-chart-area" points="${area}" />${labels}</svg>`;
  }

  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Line chart">${axis}<polyline class="au-mdx-chart-line" points="${polyline}" />${labels}</svg>`;
}

function renderPieChart(data: ChartDatum[]): string {
  if (data.length === 0) return "";
  const total = data.reduce((sum, item) => sum + Math.max(0, item.value), 0) || 1;
  let offset = 0;
  const stops = data.map((item, index) => {
    const start = offset;
    const end = offset + (Math.max(0, item.value) / total) * 100;
    offset = end;
    const color = CHART_COLORS[index % CHART_COLORS.length];
    return `${color} ${start}% ${end}%`;
  }).join(", ");
  const legend = data.map((item, index) => {
    const color = CHART_COLORS[index % CHART_COLORS.length];
    return `<div class="au-mdx-chart-legend-item"><span class="au-mdx-chart-swatch" style="background:${color}"></span><span>${escapeHtml(item.label)}: ${item.value}</span></div>`;
  }).join("");
  return `<div class="au-mdx-chart-pie" role="img" aria-label="Pie chart" style="background: conic-gradient(${stops})"></div><div class="au-mdx-chart-legend">${legend}</div>`;
}

function parseListItems(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim().match(/^[-*]\s+(.+)$/)?.[1]?.trim())
    .filter((item): item is string => Boolean(item));
}

function splitLabelValue(item: string): { label: string; value: string } | null {
  const normalized = item.replace(/\*\*/g, "");
  const match = normalized.match(/^([^:]+):\s*(.+)$/);
  if (!match) return null;
  return { label: match[1].trim(), value: match[2].trim() };
}

function renderKeyValueGrid(source: string): string | null {
  const pairs = parseListItems(source).map(splitLabelValue);
  if (pairs.length === 0 || pairs.some((pair) => !pair)) return null;
  const items = pairs.map((pair) =>
    `<div class="au-mdx-metric-item"><span class="au-mdx-metric-label">${inlineMarkdownToHtml(pair!.label)}</span><span class="au-mdx-metric-value">${inlineMarkdownToHtml(pair!.value)}</span></div>`
  ).join("");
  return `<div class="au-mdx-metric-grid">${items}</div>`;
}

function renderFeatureGrid(source: string): string | null {
  const items = parseListItems(source);
  if (items.length === 0) return null;
  const rendered = items.map((item) => {
    const pair = splitLabelValue(item);
    if (pair) {
      return `<div class="au-mdx-feature-item"><span class="au-mdx-feature-title">${inlineMarkdownToHtml(pair.label)}</span><span class="au-mdx-feature-text">${inlineMarkdownToHtml(pair.value)}</span></div>`;
    }
    return `<div class="au-mdx-feature-item"><span class="au-mdx-feature-text">${inlineMarkdownToHtml(item)}</span></div>`;
  }).join("");
  return `<div class="au-mdx-feature-grid">${rendered}</div>`;
}

function renderDecisionTable(source: string): string | null {
  const pairs = parseListItems(source).map(splitLabelValue);
  if (pairs.length === 0 || pairs.some((pair) => !pair)) return null;
  const rows = pairs.map((pair) =>
    `<tr><td>${inlineMarkdownToHtml(pair!.label)}</td><td>${inlineMarkdownToHtml(pair!.value)}</td></tr>`
  ).join("");
  return `<table class="au-mdx-decision-table"><thead><tr><th>Area</th><th>Review note</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function parseMarkdownTableRow(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return null;
  return trimmed
    .slice(1, -1)
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = parseMarkdownTableRow(line);
  if (!cells || cells.length === 0) return false;
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderMarkdownTable(headerLine: string, rowLines: string[]): string | null {
  const header = parseMarkdownTableRow(headerLine);
  if (!header || header.length === 0 || rowLines.length === 0) return null;
  const bodyRows = rowLines
    .map(parseMarkdownTableRow)
    .filter((row): row is string[] => Boolean(row));
  if (bodyRows.length === 0) return null;

  const headers = header
    .map((cell) => `<th>${inlineMarkdownToHtml(cell)}</th>`)
    .join("");
  const rows = bodyRows
    .map((row) => {
      const cells = header
        .map((_, index) => `<td>${inlineMarkdownToHtml(row[index] ?? "")}</td>`)
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
}

type CodeLanguageKind = "bash" | "json" | "typescript" | "javascript" | "plain";
type CodeLanguage = { kind: CodeLanguageKind; className: string };
type TokenPattern = { className: string; pattern: RegExp };

function normalizeCodeLanguage(language: string): CodeLanguage {
  const raw = language.trim().toLowerCase();
  const className = raw.replace(/[^a-z0-9_+.-]/g, "") || "plaintext";

  if (["bash", "sh", "shell", "zsh"].includes(raw)) return { kind: "bash", className };
  if (raw === "json") return { kind: "json", className };
  if (["ts", "tsx", "typescript"].includes(raw)) return { kind: "typescript", className };
  if (["js", "jsx", "javascript"].includes(raw)) return { kind: "javascript", className };

  return { kind: "plain", className };
}

function spanToken(className: string, value: string): string {
  return `<span class="au-mdx-token-${className}">${escapeHtml(value)}</span>`;
}

function highlightWithPatterns(source: string, patterns: TokenPattern[]): string {
  const matcher = new RegExp(patterns.map((token) => `(${token.pattern.source})`).join("|"), "g");
  let html = "";
  let lastIndex = 0;

  for (const match of source.matchAll(matcher)) {
    const index = match.index ?? 0;
    if (index < lastIndex) continue;
    html += escapeHtml(source.slice(lastIndex, index));
    const tokenIndex = match.findIndex((value, groupIndex) => groupIndex > 0 && value !== undefined) - 1;
    const token = patterns[tokenIndex];
    html += token ? spanToken(token.className, match[0]) : escapeHtml(match[0]);
    lastIndex = index + match[0].length;
  }

  return html + escapeHtml(source.slice(lastIndex));
}

function highlightJson(source: string): string {
  return highlightWithPatterns(source, [
    { className: "property", pattern: /"(?:\\.|[^"\\])*"(?=\s*:)/ },
    { className: "string", pattern: /"(?:\\.|[^"\\])*"/ },
    { className: "number", pattern: /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/ },
    { className: "boolean", pattern: /\b(?:true|false)\b/ },
    { className: "null", pattern: /\bnull\b/ },
    { className: "punctuation", pattern: /[{}\[\]:,]/ },
  ]);
}

function highlightScript(source: string): string {
  return highlightWithPatterns(source, [
    { className: "comment", pattern: /\/\/[^\n]*|\/\*[\s\S]*?\*\// },
    { className: "string", pattern: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/ },
    { className: "keyword", pattern: /\b(?:as|async|await|break|case|catch|class|const|continue|default|do|else|export|extends|finally|for|from|function|if|import|in|instanceof|interface|let|new|of|return|satisfies|switch|throw|try|type|typeof|var|void|while|yield)\b/ },
    { className: "boolean", pattern: /\b(?:true|false)\b/ },
    { className: "null", pattern: /\b(?:null|undefined)\b/ },
    { className: "number", pattern: /\b\d+(?:\.\d+)?\b/ },
    { className: "operator", pattern: /=>|===|!==|==|!=|<=|>=|\+\+|--|\|\||&&|\?\?|\+|-|\*|\/|%|=|!|\?|:|\.{3}/ },
    { className: "punctuation", pattern: /[{}\[\]();,.<>]/ },
  ]);
}

function highlightShell(source: string): string {
  return highlightWithPatterns(source, [
    { className: "comment", pattern: /#[^\n]*/ },
    { className: "string", pattern: /"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/ },
    { className: "variable", pattern: /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/ },
    { className: "option", pattern: /--?[A-Za-z0-9][A-Za-z0-9_-]*/ },
    { className: "keyword", pattern: /\b(?:cat|cd|curl|do|done|echo|else|esac|export|fi|for|function|gh|git|grep|if|node|npm|npx|pnpm|rg|source|sudo|then|while|yarn)\b/ },
    { className: "number", pattern: /\b\d+(?:\.\d+)?\b/ },
    { className: "operator", pattern: /&&|\|\||[|&;<>()]/ },
  ]);
}

function highlightCode(source: string, language: CodeLanguage): string {
  if (language.kind === "json") return highlightJson(source);
  if (language.kind === "typescript" || language.kind === "javascript") return highlightScript(source);
  if (language.kind === "bash") return highlightShell(source);
  return escapeHtml(source);
}

function renderCodeBlock(source: string, language: string): string {
  const normalized = normalizeCodeLanguage(language);
  if (normalized.className === "mermaid") {
    return `<div class="au-mdx-mermaid"><pre class="mermaid">${escapeHtml(source)}</pre></div>`;
  }
  const highlighted = highlightCode(source, normalized);
  return `<pre class="au-mdx-code-block"><code class="au-mdx-code language-${escapeHtmlAttr(normalized.className)}" data-language="${escapeHtmlAttr(normalized.className)}">${highlighted}</code></pre>`;
}

function extractMdxClassName(attrs: string): string {
  const braced = attrs.match(/\bclassName\s*=\s*\{\s*(["'])(.*?)\1\s*\}/);
  const quoted = attrs.match(/\b(?:className|class)\s*=\s*(["'])(.*?)\1/);
  return (braced?.[2] ?? quoted?.[2] ?? "").replace(/\s+/g, " ").trim();
}

function parseMdxComponentTag(line: string, selfClosing: boolean): { component: string; className: string } | null {
  const match = line.match(selfClosing
    ? /^<([A-Z][A-Za-z0-9]*)([^>]*)\/>$/
    : /^<([A-Z][A-Za-z0-9]*)([^>]*)>$/);
  if (!match) return null;
  return {
    component: match[1],
    className: extractMdxClassName(match[2]),
  };
}

function mdxClassAttr(...classNames: string[]): string {
  const value = classNames.filter(Boolean).join(" ");
  return `class="${escapeHtmlAttr(value)}"`;
}

export function hasMermaidCodeBlock(source: string): boolean {
  return /^```\s*mermaid(?:\s|$)/im.test(source);
}

function renderMdxComponent(component: string, bodySource: string, className = ""): string {
  const cssClass = componentCssClass(component);
  if (component === "Separator") {
    return `<hr ${mdxClassAttr("au-mdx-separator", className)} data-component="${component}" />`;
  }

  if (component === "Progress") {
    const value = Math.max(0, Math.min(100, parseChartData(bodySource)[0]?.value ?? Number(bodySource.match(/-?\d+(?:\.\d+)?/)?.[0] || 0)));
    return `<section ${mdxClassAttr("au-mdx-component", `au-mdx-${cssClass}`, className)} data-component="${component}"><div class="au-mdx-component-header">${escapeHtml(component)}</div><div class="au-mdx-component-body"><div class="au-mdx-progress-track"><div class="au-mdx-progress-fill" style="width:${value}%"></div></div></div></section>`;
  }

  if (CHART_COMPONENTS.has(component)) {
    const data = parseChartData(bodySource);
    const chart = component === "ChartPie" ? renderPieChart(data) : renderChartSvg(component, data);
    const fallback = chart || renderMarkdownLines(bodySource);
    return `<section ${mdxClassAttr("au-mdx-component", "au-mdx-chart", `au-mdx-${cssClass}`, className)} data-component="${component}"><div class="au-mdx-component-header">${escapeHtml(component)}</div><div class="au-mdx-component-body">${fallback}</div></section>`;
  }

  const customBody =
    component === "DataTable" ? renderKeyValueGrid(bodySource) || renderFeatureGrid(bodySource) :
    component === "MetricStrip" ? renderKeyValueGrid(bodySource) :
    component === "DecisionTable" ? renderDecisionTable(bodySource) :
    component === "Finding" || component === "Evidence" ? renderFeatureGrid(bodySource) :
    component === "RiskTable" || component === "Compare" ? renderFeatureGrid(bodySource) :
    null;
  const renderedBody = customBody || renderMarkdownLines(bodySource);
  return `<section ${mdxClassAttr("au-mdx-component", `au-mdx-${cssClass}`, className)} data-component="${component}"><div class="au-mdx-component-header">${escapeHtml(component)}</div><div class="au-mdx-component-body">${renderedBody}</div></section>`;
}

export function renderMarkdownLines(source: string): string {
  const lines = source.split(/\r?\n/);
  const html: string[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  let code: { language: string; lines: string[] } | null = null;
  let index = 0;

  function flushParagraph(): void {
    if (paragraph.length === 0) return;
    html.push(`<p>${inlineMarkdownToHtml(paragraph.join(" "))}</p>`);
    paragraph = [];
  }

  function flushList(): void {
    if (list.length === 0) return;
    html.push(`<ul>${list.map((item) => `<li>${inlineMarkdownToHtml(item)}</li>`).join("")}</ul>`);
    list = [];
  }

  while (index < lines.length) {
    const line = lines[index++];
    const fence = line.match(/^```\s*([A-Za-z0-9_+.-]*)?.*$/);
    if (fence) {
      flushParagraph();
      flushList();
      if (code) {
        html.push(renderCodeBlock(code.lines.join("\n"), code.language));
        code = null;
      } else {
        code = { language: fence[1] || "", lines: [] };
      }
      continue;
    }
    if (code) {
      code.lines.push(line);
      continue;
    }
    const componentSelfClosing = parseMdxComponentTag(line, true);
    if (componentSelfClosing) {
      flushParagraph();
      flushList();
      html.push(renderMdxComponent(componentSelfClosing.component, "", componentSelfClosing.className));
      continue;
    }
    const componentOpen = parseMdxComponentTag(line, false);
    if (componentOpen) {
      flushParagraph();
      flushList();
      const { component, className } = componentOpen;
      const body: string[] = [];
      const closing = `</${component}>`;
      while (index < lines.length) {
        const next = lines[index++];
        if (next === closing) break;
        body.push(next);
      }
      html.push(renderMdxComponent(component, body.join("\n"), className));
      continue;
    }
    if (line.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }
    if (parseMarkdownTableRow(line) && isMarkdownTableSeparator(lines[index] ?? "")) {
      flushParagraph();
      flushList();
      index += 1;
      const rows: string[] = [];
      while (index < lines.length && parseMarkdownTableRow(lines[index])) {
        rows.push(lines[index++]);
      }
      const table = renderMarkdownTable(line, rows);
      if (table) {
        html.push(table);
        continue;
      }
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdownToHtml(heading[2])}</h${level}>`);
      continue;
    }
    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      list.push(listItem[1]);
      continue;
    }
    paragraph.push(line.trim());
  }
  flushParagraph();
  flushList();
  if (code) html.push(renderCodeBlock(code.lines.join("\n"), code.language));
  return html.join("\n");
}

export function stripMdxComponentsForPlain(source: string): string {
  return source
    .replace(/^import\s+.*$/gm, "")
    .replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*\/>/g, "[Component: $1]")
    .replace(/<([A-Z][A-Za-z0-9]*)\b[^>]*>/g, "[Component: $1]")
    .replace(/<\/[A-Z][A-Za-z0-9]*>/g, "[/Component]")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
