import { AGENTS_UI_MDX_IMPORT, MDX_COMPONENT_NAMES, SHADCN_COMPONENT_IMPORT_RE, isMdxComponentName } from "./components";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function escapeHtmlAttr(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

export function parseFrontmatter(source: string): { frontmatter: Record<string, string>; body: string } {
  const normalized = source.replace(/^\uFEFF/, "");
  const startMatch = normalized.match(/^---\r?\n/);
  if (!startMatch) return { frontmatter: {}, body: source };

  const closeRe = /\r?\n---(?:\r?\n|$)/g;
  closeRe.lastIndex = startMatch[0].length;
  const closeMatch = closeRe.exec(normalized);
  if (!closeMatch || closeMatch.index === undefined) return { frontmatter: {}, body: source };

  const raw = normalized.slice(startMatch[0].length, closeMatch.index).trim();
  const frontmatter: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }

  const bodyStart = closeMatch.index + closeMatch[0].length;
  return { frontmatter, body: normalized.slice(bodyStart) };
}

function removeMdxImportsOutsideCode(source: string): string {
  let inCode = false;
  let inImport = false;
  return source
    .split(/\r?\n/)
    .filter((line) => {
      if (line.match(/^```/)) {
        inCode = !inCode;
        return true;
      }
      if (inCode) return true;
      if (inImport) {
        if (/\s+from\s+['"][^'"]+['"];?\s*$/.test(line)) {
          inImport = false;
        }
        return false;
      }
      if (line.match(/^import\s+.*$/)) {
        if (!/\s+from\s+['"][^'"]+['"];?\s*$/.test(line)) {
          inImport = true;
        }
        return false;
      }
      return true;
    })
    .join("\n");
}

export function normalizeMdxSource(source: string): string {
  return removeMdxImportsOutsideCode(parseFrontmatter(source).body).trim();
}

function stripCodeForMdxValidation(source: string): string {
  let withoutFences = "";
  let inCode = false;
  for (const line of source.split(/\r?\n/)) {
    if (line.match(/^```/)) {
      inCode = !inCode;
      withoutFences += "\n";
      continue;
    }
    withoutFences += (inCode ? "" : line) + "\n";
  }
  return withoutFences.replace(/`[^`\n]*`/g, "");
}

function extractMdxImportStatements(source: string): string[] {
  const imports: string[] = [];
  let current: string[] | null = null;
  for (const line of source.split(/\r?\n/)) {
    if (!current && line.match(/^import\s+.*$/)) {
      current = [line];
      if (/\s+from\s+['"][^'"]+['"];?\s*$/.test(line)) {
        imports.push(current.join("\n"));
        current = null;
      }
      continue;
    }
    if (current) {
      current.push(line);
      if (/\s+from\s+['"][^'"]+['"];?\s*$/.test(line)) {
        imports.push(current.join("\n"));
        current = null;
      }
    }
  }
  return imports;
}

function extractImportSpecifier(statement: string): string | undefined {
  return statement.match(/\s+from\s+['"]([^'"]+)['"];?\s*$/)?.[1];
}

function isSupportedMdxImportSpecifier(specifier: string): boolean {
  return specifier === AGENTS_UI_MDX_IMPORT || SHADCN_COMPONENT_IMPORT_RE.test(specifier);
}

function parseMdxNamedImportNames(statement: string): string[] | null {
  const match = statement.match(/^import\s+\{([\s\S]+)\}\s+from\s+['"][^'"]+['"];?\s*$/);
  if (!match) return null;
  return match[1]
    .split(",")
    .map((part) => part.trim().split(/\s+as\s+/)[0].trim())
    .filter(Boolean);
}

function parseApprovedMdxImports(source: string): void {
  for (const statement of extractMdxImportStatements(source)) {
    const specifier = extractImportSpecifier(statement);
    if (!specifier) continue;
    if (!isSupportedMdxImportSpecifier(specifier)) {
      throw new Error(`Unsupported MDX import: ${specifier}. Agent Surface MDX v1 only supports host-provided components.`);
    }
    const names = parseMdxNamedImportNames(statement);
    if (!names) {
      throw new Error(`Unsupported MDX import syntax for ${specifier}. Use named component imports.`);
    }
    for (const name of names) {
      if (!isMdxComponentName(name)) {
        throw new Error(`Unknown MDX component: ${name}`);
      }
    }
  }
}

export function validateMdxSource(source: string): void {
  const validationSource = stripCodeForMdxValidation(source);
  parseApprovedMdxImports(validationSource);
  for (const statement of extractMdxImportStatements(validationSource)) {
    const specifier = extractImportSpecifier(statement);
    if (!specifier) continue;
    if (!isSupportedMdxImportSpecifier(specifier)) {
      throw new Error(`Unsupported MDX import: ${specifier}. Agent Surface MDX v1 only supports host-provided components.`);
    }
  }
  for (const match of validationSource.matchAll(/<\/?([A-Z][A-Za-z0-9]*)\b[^>]*>/g)) {
    const component = match[1];
    if (!isMdxComponentName(component)) {
      throw new Error(`Unknown MDX component: ${component}`);
    }
  }
  for (const component of MDX_COMPONENT_NAMES) {
    const open = (validationSource.match(new RegExp(`<${component}\\b(?![^>]*\\/>)`, "g")) || []).length;
    const close = (validationSource.match(new RegExp(`</${component}>`, "g")) || []).length;
    if (open !== close) {
      throw new Error(`Broken MDX syntax: <${component}> has ${open} opening tag(s) and ${close} closing tag(s).`);
    }
  }
}

export function isSafeMdxHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith("//")) return false;
  if (value.startsWith("#") || value.startsWith("/") || value.startsWith("./") || value.startsWith("../")) {
    return true;
  }
  const scheme = value.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  if (scheme) {
    return ["http", "https", "mailto"].includes(scheme[1].toLowerCase());
  }
  return !/[\u0000-\u001f\u007f]/.test(value);
}
