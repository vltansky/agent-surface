import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, posix, relative, resolve } from "node:path";
import { build, type BuildFailure, type Loader, type Plugin } from "esbuild";

export type JsxVirtualFiles = Record<string, string>;
export type JsxHostModuleRegistry = Record<string, string>;

export interface BuildJsxBundleOptions {
  entryPath: string;
  rootDir: string;
  hostModules?: JsxHostModuleRegistry;
}

export interface BuildJsxBundleFromFilesOptions {
  files: JsxVirtualFiles;
  entryFile: string;
  rootDir?: string;
  hostModules?: JsxHostModuleRegistry;
}

interface NormalizedBuildJsxBundleOptions {
  rootDir: string;
  hostModules: JsxHostModuleRegistry;
  virtualFiles: Map<string, string>;
  entryRealPath?: string;
  entryVirtualPath?: string;
}

const RESOLVE_EXTENSIONS = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"];
const VIRTUAL_FILE_NAMESPACE = "agent-surface-virtual";

const BUILTIN_HOST_IMPORTS = [
  "@/components/ui/button",
  "@/components/ui/card",
  "@/components/ui/input",
  "@/components/ui/textarea",
  "@/components/ui/badge",
  "@/lib/utils",
];

const BUILTIN_HOST_MODULES: JsxHostModuleRegistry = {
  "@/lib/utils": `
function normalizeClass(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap(normalizeClass);
  if (typeof value === "object") {
    return Object.keys(value).filter(function(key) { return value[key]; });
  }
  return [String(value)];
}
export function cn() {
  return Array.prototype.slice.call(arguments).flatMap(normalizeClass).join(" ");
}
`,
  "@/components/ui/button": `
import React from "react";
import { cn } from "@/lib/utils";
export function Button({ children, variant = "default", size = "default", className = "", disabled, ...props }) {
  const variants = {
    default: "bg-gray-900 text-white hover:bg-gray-800",
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
    destructive: "bg-red-600 text-white hover:bg-red-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
    outline: "border border-gray-200 bg-white hover:bg-gray-50",
    ghost: "hover:bg-gray-100 text-gray-700",
    success: "bg-green-600 text-white hover:bg-green-700",
  };
  const sizes = {
    default: "h-10 px-4 py-2 text-sm",
    sm: "h-8 px-3 text-xs",
    md: "h-10 px-4 py-2 text-sm",
    lg: "h-11 px-6 text-base",
    icon: "h-10 w-10",
  };
  return React.createElement("button", {
    className: cn("inline-flex items-center justify-center rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2 disabled:pointer-events-none disabled:opacity-50", variants[variant] || variants.default, sizes[size] || sizes.default, className),
    disabled,
    ...props,
  }, children);
}
export default Button;
`,
  "@/components/ui/card": `
import React from "react";
import { cn } from "@/lib/utils";
export function Card({ className = "", ...props }) {
  return React.createElement("div", { className: cn("rounded-lg border border-gray-200 bg-white text-gray-950 shadow-sm", className), ...props });
}
export function CardHeader({ className = "", ...props }) {
  return React.createElement("div", { className: cn("flex flex-col space-y-1.5 p-6", className), ...props });
}
export function CardTitle({ className = "", ...props }) {
  return React.createElement("h3", { className: cn("text-lg font-semibold leading-none tracking-normal", className), ...props });
}
export function CardDescription({ className = "", ...props }) {
  return React.createElement("p", { className: cn("text-sm text-gray-500", className), ...props });
}
export function CardContent({ className = "", ...props }) {
  return React.createElement("div", { className: cn("p-6 pt-0", className), ...props });
}
export function CardFooter({ className = "", ...props }) {
  return React.createElement("div", { className: cn("flex items-center p-6 pt-0", className), ...props });
}
export default Card;
`,
  "@/components/ui/input": `
import React from "react";
import { cn } from "@/lib/utils";
export function Input({ className = "", ...props }) {
  return React.createElement("input", { className: cn("flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50", className), ...props });
}
export default Input;
`,
  "@/components/ui/textarea": `
import React from "react";
import { cn } from "@/lib/utils";
export function Textarea({ className = "", ...props }) {
  return React.createElement("textarea", { className: cn("flex min-h-20 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gray-400 disabled:cursor-not-allowed disabled:opacity-50", className), ...props });
}
export default Textarea;
`,
  "@/components/ui/badge": `
import React from "react";
import { cn } from "@/lib/utils";
export function Badge({ children, variant = "default", className = "", ...props }) {
  const variants = {
    default: "bg-gray-900 text-white",
    secondary: "bg-gray-100 text-gray-900",
    destructive: "bg-red-600 text-white",
    outline: "border border-gray-200 text-gray-950",
    blue: "bg-blue-100 text-blue-700",
    green: "bg-green-100 text-green-700",
    yellow: "bg-yellow-100 text-yellow-800",
    red: "bg-red-100 text-red-700",
    dark: "bg-gray-900 text-white",
  };
  return React.createElement("span", { className: cn("inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium", variants[variant] || variants.default, className), ...props }, children);
}
export default Badge;
`,
};

const REACT_MODULE = `
const ReactGlobal = window.React;
export default ReactGlobal;
export const Children = ReactGlobal.Children;
export const Component = ReactGlobal.Component;
export const Fragment = ReactGlobal.Fragment;
export const Profiler = ReactGlobal.Profiler;
export const PureComponent = ReactGlobal.PureComponent;
export const StrictMode = ReactGlobal.StrictMode;
export const Suspense = ReactGlobal.Suspense;
export const cloneElement = ReactGlobal.cloneElement;
export const createContext = ReactGlobal.createContext;
export const createElement = ReactGlobal.createElement;
export const createFactory = ReactGlobal.createFactory;
export const createRef = ReactGlobal.createRef;
export const forwardRef = ReactGlobal.forwardRef;
export const isValidElement = ReactGlobal.isValidElement;
export const lazy = ReactGlobal.lazy;
export const memo = ReactGlobal.memo;
export const startTransition = ReactGlobal.startTransition;
export const useCallback = ReactGlobal.useCallback;
export const useContext = ReactGlobal.useContext;
export const useDebugValue = ReactGlobal.useDebugValue;
export const useDeferredValue = ReactGlobal.useDeferredValue;
export const useEffect = ReactGlobal.useEffect;
export const useId = ReactGlobal.useId;
export const useImperativeHandle = ReactGlobal.useImperativeHandle;
export const useInsertionEffect = ReactGlobal.useInsertionEffect;
export const useLayoutEffect = ReactGlobal.useLayoutEffect;
export const useMemo = ReactGlobal.useMemo;
export const useReducer = ReactGlobal.useReducer;
export const useRef = ReactGlobal.useRef;
export const useState = ReactGlobal.useState;
export const useSyncExternalStore = ReactGlobal.useSyncExternalStore;
export const useTransition = ReactGlobal.useTransition;
`;

const REACT_DOM_CLIENT_MODULE = `
export const createRoot = window.ReactDOM.createRoot;
export const hydrateRoot = window.ReactDOM.hydrateRoot;
export default { createRoot, hydrateRoot };
`;

export async function buildJsxBundle(options: BuildJsxBundleOptions): Promise<string> {
  const entryPath = resolve(options.entryPath);
  const rootDir = resolve(options.rootDir);
  const entryImport = "./" + basename(entryPath);
  const plugin = createAgentUiJsxPlugin({
    hostModules: options.hostModules ?? {},
    virtualFiles: new Map(),
    rootDir,
    entryRealPath: realpathSync(entryPath),
  });

  try {
    const result = await build({
      stdin: {
        contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import App from ${JSON.stringify(entryImport)};

const root = createRoot(document.getElementById("root"));
root.render(React.createElement(App));
`,
        loader: "jsx",
        resolveDir: dirname(entryPath),
        sourcefile: "agent-surface-renderer.jsx",
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2018",
      write: false,
      logLevel: "silent",
      plugins: [plugin],
    });

    return result.outputFiles[0]?.text ?? "";
  } catch (error) {
    throw new Error(formatBuildError(error));
  }
}

export async function buildJsxBundleFromFiles(options: BuildJsxBundleFromFilesOptions): Promise<string> {
  const rootDir = resolve(options.rootDir ?? process.cwd());
  const virtualFiles = normalizeVirtualFiles(options.files);
  const entryFile = normalizeVirtualFilePath(options.entryFile, "entryFile");
  const entryVirtualPath = resolveExistingVirtualModulePath(entryFile, virtualFiles);
  if (!entryVirtualPath) {
    throw new Error(`Entry file not found in virtual files: ${options.entryFile}`);
  }

  const plugin = createAgentUiJsxPlugin({
    rootDir,
    hostModules: options.hostModules ?? {},
    virtualFiles,
    entryVirtualPath,
  });

  try {
    const result = await build({
      stdin: {
        contents: `
import React from "react";
import { createRoot } from "react-dom/client";
import App from ${JSON.stringify("@/" + entryFile)};

const root = createRoot(document.getElementById("root"));
root.render(React.createElement(App));
`,
        loader: "jsx",
        resolveDir: rootDir,
        sourcefile: "agent-surface-renderer.jsx",
      },
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2018",
      write: false,
      logLevel: "silent",
      plugins: [plugin],
    });

    return result.outputFiles[0]?.text ?? "";
  } catch (error) {
    throw new Error(formatBuildError(error));
  }
}

function createAgentUiJsxPlugin(options: NormalizedBuildJsxBundleOptions): Plugin {
  return {
    name: "agent-surface-jsx-runtime",
    setup(buildApi) {
      buildApi.onResolve({ filter: /^react$/ }, () => ({
        path: "react",
        namespace: "agent-surface-runtime",
      }));

      buildApi.onResolve({ filter: /^react-dom\/client$/ }, () => ({
        path: "react-dom/client",
        namespace: "agent-surface-runtime",
      }));

      buildApi.onResolve({ filter: /^@\/.+/ }, (args) => {
        const virtualPath = resolveAliasToVirtualFile(args.path, options.virtualFiles);
        if (virtualPath) return { path: virtualPath, namespace: VIRTUAL_FILE_NAMESPACE };

        const localPath = resolveAliasToLocalFile(args.path, options.rootDir);
        if (localPath) return { path: localPath };

        const hostModule = getHostModuleSource(args.path, options.hostModules);
        if (hostModule) {
          return { path: args.path, namespace: "agent-surface-host" };
        }

        return unsupportedImport(args.path, options.hostModules);
      });

      buildApi.onResolve({ filter: /^\.\.?\// }, (args) => {
        const virtualPath = resolveRelativeToVirtualFile(args, options);
        if (virtualPath) return { path: virtualPath, namespace: VIRTUAL_FILE_NAMESPACE };
        if (args.namespace === VIRTUAL_FILE_NAMESPACE) {
          return missingVirtualImport(args.path, args.importer);
        }
        return undefined;
      });

      buildApi.onResolve({ filter: /^[^./]|^\.[^./]|^\.\.[^/]/ }, (args) => {
        if (args.path.startsWith("@/")) return undefined;
        if (args.path === "react" || args.path === "react-dom/client") return undefined;
        return unsupportedImport(args.path, options.hostModules);
      });

      buildApi.onLoad({ filter: /.*/, namespace: "agent-surface-runtime" }, (args) => {
        if (args.path === "react") return { contents: REACT_MODULE, loader: "js" };
        return { contents: REACT_DOM_CLIENT_MODULE, loader: "js" };
      });

      buildApi.onLoad({ filter: /.*/, namespace: "agent-surface-host" }, (args) => ({
        contents: getHostModuleSource(args.path, options.hostModules),
        loader: "tsx",
        resolveDir: options.rootDir,
      }));

      buildApi.onLoad({ filter: /.*/, namespace: VIRTUAL_FILE_NAMESPACE }, (args) => {
        const raw = options.virtualFiles.get(args.path);
        if (raw === undefined) {
          throw new Error(`Virtual file not found: ${args.path}`);
        }
        let contents = raw;
        if (args.path === options.entryVirtualPath && !/\bexport\s+default\b/.test(contents)) {
          contents += "\nexport default App;\n";
        }
        return {
          contents,
          loader: loaderForPath(args.path),
          resolveDir: posix.dirname("/" + args.path),
        };
      });

      buildApi.onLoad({ filter: /\.[cm]?[jt]sx?$/ }, (args) => {
        const raw = readFileSync(args.path, "utf-8");
        let contents = raw;
        if (options.entryRealPath && realpathSync(args.path) === options.entryRealPath && !/\bexport\s+default\b/.test(contents)) {
          contents += "\nexport default App;\n";
        }
        return {
          contents,
          loader: loaderForPath(args.path),
          resolveDir: dirname(args.path),
        };
      });
    },
  };
}

function normalizeVirtualFiles(files: JsxVirtualFiles): Map<string, string> {
  const normalized = new Map<string, string>();
  for (const [path, contents] of Object.entries(files)) {
    normalized.set(normalizeVirtualFilePath(path, "virtual file"), contents);
  }
  return normalized;
}

function normalizeVirtualFilePath(path: string, label: string): string {
  const unixPath = path.replace(/\\/g, "/").replace(/^\/+/, "");
  const normalized = posix.normalize(unixPath);
  if (!normalized || normalized === "." || normalized.startsWith("../") || normalized === "..") {
    throw new Error(`Invalid ${label} path: ${path}`);
  }
  return normalized.replace(/^\.\//, "");
}

function resolveAliasToVirtualFile(specifier: string, virtualFiles: Map<string, string>): string | undefined {
  return resolveExistingVirtualModulePath(specifier.slice(2), virtualFiles);
}

function resolveRelativeToVirtualFile(
  args: { path: string; importer?: string; namespace?: string },
  options: NormalizedBuildJsxBundleOptions
): string | undefined {
  if (!args.importer) return undefined;

  if (args.namespace === VIRTUAL_FILE_NAMESPACE) {
    return resolveExistingVirtualModulePath(posix.join(posix.dirname(args.importer), args.path), options.virtualFiles);
  }

  const importerDir = dirname(args.importer);
  const diskCandidate = resolve(importerDir, args.path);
  const relativeToRoot = toRootRelativePath(diskCandidate, options.rootDir);
  return relativeToRoot ? resolveExistingVirtualModulePath(relativeToRoot, options.virtualFiles) : undefined;
}

function resolveExistingVirtualModulePath(basePath: string, virtualFiles: Map<string, string>): string | undefined {
  const normalizedBase = normalizeVirtualFilePath(basePath, "import");
  for (const extension of RESOLVE_EXTENSIONS) {
    const candidate = normalizedBase + extension;
    if (virtualFiles.has(candidate)) return candidate;
  }
  for (const extension of RESOLVE_EXTENSIONS.filter(Boolean)) {
    const candidate = posix.join(normalizedBase, "index" + extension);
    if (virtualFiles.has(candidate)) return candidate;
  }
  return undefined;
}

function toRootRelativePath(path: string, rootDir: string): string | undefined {
  if (!isSubPath(path, rootDir)) return undefined;
  return relative(rootDir, resolve(path)).replace(/\\/g, "/");
}

function getHostModuleSource(specifier: string, hostModules: JsxHostModuleRegistry): string | undefined {
  return hostModules[specifier] ?? BUILTIN_HOST_MODULES[specifier];
}

function supportedHostImports(hostModules: JsxHostModuleRegistry): string[] {
  return Array.from(new Set([...BUILTIN_HOST_IMPORTS, ...Object.keys(hostModules)])).sort();
}

function resolveAliasToLocalFile(specifier: string, rootDir: string): string | undefined {
  const relativePath = specifier.slice(2);
  const basePath = resolve(rootDir, relativePath);
  if (!isSubPath(basePath, rootDir)) return undefined;
  return resolveExistingModulePath(basePath);
}

function resolveExistingModulePath(basePath: string): string | undefined {
  for (const extension of RESOLVE_EXTENSIONS) {
    const candidate = basePath + extension;
    if (isFile(candidate)) return candidate;
  }
  for (const extension of RESOLVE_EXTENSIONS.filter(Boolean)) {
    const candidate = resolve(basePath, "index" + extension);
    if (isFile(candidate)) return candidate;
  }
  return undefined;
}

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

function isSubPath(path: string, rootDir: string): boolean {
  const normalizedPath = resolve(path);
  const normalizedRoot = resolve(rootDir);
  const relativePath = relative(normalizedRoot, normalizedPath);
  return relativePath === "" || (!!relativePath && !relativePath.startsWith("..") && !isAbsolute(relativePath));
}


function toObjectPattern(specifiers: string): string {
  return specifiers
    .split(",")
    .map((specifier) => specifier.trim())
    .filter(Boolean)
    .map((specifier) => {
      const aliasMatch = specifier.match(/^([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)$/);
      return aliasMatch ? `${aliasMatch[1]}: ${aliasMatch[2]}` : specifier;
    })
    .join(", ");
}

function loaderForPath(path: string): Loader {
  const extension = extname(path).toLowerCase();
  if (extension === ".json") return "json";
  if (extension === ".tsx") return "tsx";
  if (extension === ".ts") return "ts";
  if (extension === ".jsx") return "jsx";
  return "js";
}

function missingVirtualImport(path: string, importer: string) {
  return {
    errors: [{ text: `Could not resolve virtual import "${path}" from "${importer}"` }],
  };
}

function unsupportedImport(path: string, hostModules: JsxHostModuleRegistry) {
  return {
    errors: [{
      text: `Unsupported import "${path}". Use local relative/@ files, supported shadcn paths (${supportedHostImports(hostModules).join(", ")}), react, react-dom/client.`,
    }],
  };
}

function formatBuildError(error: unknown): string {
  const failure = error as Partial<BuildFailure>;
  if (Array.isArray(failure.errors) && failure.errors.length > 0) {
    return failure.errors.map((item) => item.text).join("\n");
  }
  return error instanceof Error ? error.message : String(error);
}
