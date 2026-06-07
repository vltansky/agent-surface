import { createHash } from "node:crypto";
import { MDX_RUNTIME_CSS } from "./mdx/styles";
import { extractComponents, extractHeadings, extractLinks, extractSections, type MdxMetadata } from "./mdx/metadata";
import { hasMermaidCodeBlock, renderMarkdownLines, stripMdxComponentsForPlain } from "./mdx/render";
import { escapeHtml, normalizeMdxSource, parseFrontmatter, validateMdxSource } from "./mdx/validate";

export * from "./mdx/components";
export type { MdxMetadata } from "./mdx/metadata";

export type MdxArtifact = {
  source: string;
  plain: string;
  metadata: MdxMetadata;
};

export function buildMdxArtifact(source: string, sourcePath: string): MdxArtifact & { html: string } {
  validateMdxSource(source);
  const { frontmatter } = parseFrontmatter(source);
  const normalized = normalizeMdxSource(source);
  const headings = extractHeadings(normalized);
  const title = frontmatter.title || headings[0]?.text || "Agent Surface MDX Artifact";
  const components = extractComponents(normalized);
  const plain = stripMdxComponentsForPlain(normalized);
  const mermaid = hasMermaidCodeBlock(normalized);
  const metadata: MdxMetadata = {
    title,
    sourcePath,
    sourceHash: createHash("sha256").update(source).digest("hex"),
    frontmatter,
    headings,
    sections: extractSections(normalized, headings),
    links: extractLinks(normalized),
    runtimeMode: "shadcn",
    components,
  };

  const rendered = renderMarkdownLines(normalized);
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <title>${escapeHtml(title)}</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
  ${mermaid ? '<script type="module">import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs"; mermaid.initialize({ startOnLoad: true, securityLevel: "strict" });<\/script>' : ""}
  <style>${MDX_RUNTIME_CSS}</style>
</head>
<body>
  <main id="root" class="au-mdx-page">
    <article class="au-mdx-article">
${rendered}
    </article>
  </main>
</body>
</html>`;

  return { source, plain, metadata, html };
}
