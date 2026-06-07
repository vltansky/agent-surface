import { isSafeMdxHref } from "./validate";

export type MdxMetadata = {
  title: string;
  sourcePath: string;
  sourceHash: string;
  frontmatter: Record<string, string>;
  headings: Array<{ level: number; text: string; line: number }>;
  sections: Array<{ level: number; title: string; startLine: number; endLine: number; text: string }>;
  links: Array<{ text: string; href: string }>;
  runtimeMode: "shadcn";
  components: string[];
};

function cleanMarkdownText(text: string): string {
  return text.replace(/[`*_]/g, "").trim();
}

export function extractHeadings(source: string): Array<{ level: number; text: string; line: number }> {
  return source.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (!match) return [];
    return [{
      level: match[1].length,
      text: cleanMarkdownText(match[2]),
      line: index + 1,
    }];
  });
}

export function extractSections(
  source: string,
  headings: Array<{ level: number; text: string; line: number }>
): Array<{ level: number; title: string; startLine: number; endLine: number; text: string }> {
  const lines = source.split(/\r?\n/);
  return headings.map((heading, index) => {
    const nextHeading = headings.slice(index + 1).find((candidate) => candidate.level <= heading.level);
    const endLine = (nextHeading?.line ?? lines.length + 1) - 1;
    return {
      level: heading.level,
      title: heading.text,
      startLine: heading.line,
      endLine,
      text: lines.slice(heading.line, endLine).join("\n").trim(),
    };
  });
}

export function extractLinks(source: string): Array<{ text: string; href: string }> {
  return Array.from(source.matchAll(/\[([^\]]+)\]\(([^)]+)\)/g))
    .map((match) => ({
      text: match[1],
      href: match[2],
    }))
    .filter((link) => isSafeMdxHref(link.href));
}

export function extractComponents(source: string): string[] {
  const components = new Set<string>();
  for (const match of source.matchAll(/<\/?([A-Z][A-Za-z0-9]*)\b[^>]*>/g)) {
    components.add(match[1]);
  }
  return Array.from(components).sort();
}
