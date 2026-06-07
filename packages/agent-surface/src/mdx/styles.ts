export const MDX_RUNTIME_CSS = `
  body { margin: 0; background: #eef1f4; color: #111827; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
  #root { min-height: 100vh; }
  .au-mdx-page { max-width: 980px; margin: 0 auto; padding: clamp(22px, 4vw, 46px) clamp(14px, 3vw, 28px) 80px; }
  .au-mdx-article { background: #fff; border: 1px solid #d9dee6; border-radius: 4px; box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12); padding: clamp(34px, 5vw, 64px); }
  .au-mdx-article h1 { max-width: 780px; font-size: clamp(2rem, 4.2vw, 2.85rem); line-height: 1.08; margin: 0 0 18px; letter-spacing: 0; color: #111827; }
  .au-mdx-article h2 { font-size: 1.32rem; line-height: 1.25; margin: 38px 0 14px; border-top: 1px solid #d9dee6; padding-top: 24px; letter-spacing: 0; color: #111827; }
  .au-mdx-article h3 { font-size: 1.12rem; margin: 24px 0 10px; letter-spacing: 0; color: #111827; }
  .au-mdx-article p, .au-mdx-article li { color: #374151; font-size: 1rem; line-height: 1.72; }
  .au-mdx-article a { color: #075985; text-decoration: underline; text-underline-offset: 3px; }
  .au-mdx-article code { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 5px; padding: 0.1rem 0.32rem; font-size: 0.9em; }
  .au-mdx-article pre { overflow: auto; background: #0f172a; color: #e2e8f0; border-radius: 10px; padding: 16px; }
  .au-mdx-article pre code { background: transparent; border: 0; color: inherit; padding: 0; }
  .au-mdx-article pre.au-mdx-code-block { border: 1px solid rgba(148, 163, 184, 0.22); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04); }
  .au-mdx-code { display: block; white-space: pre; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; font-size: 0.88rem; line-height: 1.62; }
  .au-mdx-mermaid { margin: 22px 0; padding: 18px; overflow-x: auto; border: 1px solid #d9dee6; border-radius: 6px; background: #fff; }
  .au-mdx-mermaid .mermaid { min-width: min-content; text-align: center; }
  .au-mdx-token-comment { color: #94a3b8; font-style: italic; }
  .au-mdx-token-keyword { color: #93c5fd; font-weight: 650; }
  .au-mdx-token-string { color: #86efac; }
  .au-mdx-token-number, .au-mdx-token-boolean, .au-mdx-token-null { color: #fca5a5; }
  .au-mdx-token-property, .au-mdx-token-variable { color: #fde68a; }
  .au-mdx-token-punctuation, .au-mdx-token-operator, .au-mdx-token-option { color: #c4b5fd; }
  .au-mdx-article blockquote { margin: 18px 0; padding: 12px 18px; border-left: 4px solid #94a3b8; background: #f8fafc; color: #334155; }
  .au-mdx-article table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 0.94rem; }
  .au-mdx-article th, .au-mdx-article td { border: 1px solid #e2e8f0; padding: 9px 11px; text-align: left; vertical-align: top; }
  .au-mdx-article th { background: #f8fafc; color: #0f172a; }
  .au-mdx-component { border: 1px solid #e5e7eb; border-radius: 12px; margin: 20px 0; background: #fff; overflow: hidden; }
  .au-mdx-component-header { display: none; }
  .au-mdx-component-body { padding: 18px; }
  .au-mdx-component-body > :first-child { margin-top: 0; }
  .au-mdx-component-body > :last-child { margin-bottom: 0; }
  .au-mdx-callout { border-color: #bfdbfe; background: linear-gradient(135deg, #eff6ff, #f8fbff); border-left: 5px solid #2563eb; }
  .au-mdx-callout .au-mdx-component-body { padding: 18px 20px; }
  .au-mdx-callout p { color: #1e3a8a; font-weight: 520; }
  .au-mdx-compare .au-mdx-component-body { padding: 0; }
  .au-mdx-compare .au-mdx-component-body ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0; list-style: none; padding: 0; margin: 0; }
  .au-mdx-compare .au-mdx-component-body li { border-right: 1px solid #e5e7eb; background: #fff; padding: 18px; margin: 0; min-height: 92px; }
  .au-mdx-compare .au-mdx-component-body li:last-child { border-right: 0; }
  .au-mdx-timeline { border: 0; background: transparent; overflow: visible; }
  .au-mdx-timeline .au-mdx-component-body { padding: 4px 0 0; }
  .au-mdx-timeline .au-mdx-component-body ul { list-style: none; border-left: 2px solid #93c5fd; margin: 4px 0 2px 11px; padding-left: 24px; }
  .au-mdx-timeline .au-mdx-component-body li { position: relative; margin: 0 0 14px; padding: 12px 14px; border: 1px solid #e5e7eb; border-radius: 10px; background: #fff; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.05); }
  .au-mdx-timeline .au-mdx-component-body li::before { content: ""; position: absolute; left: -31px; top: 1.15em; width: 11px; height: 11px; border-radius: 999px; background: #2563eb; box-shadow: 0 0 0 5px #dbeafe; }
  .au-mdx-risk-table { border: 1px solid #fecaca; background: #fffafa; }
  .au-mdx-risk-table .au-mdx-component-body ul { display: grid; gap: 10px; list-style: none; padding: 0; margin: 0; }
  .au-mdx-risk-table .au-mdx-component-body li { margin: 0; border: 1px solid #fee2e2; border-radius: 10px; background: #fff; padding: 13px 14px; }
  .au-mdx-data-table { background: #fff; border-color: #e5e7eb; }
  .au-mdx-metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
  .au-mdx-metric-item { border: 1px solid #e5e7eb; border-radius: 12px; background: linear-gradient(180deg, #fff, #f8fafc); padding: 14px 15px; min-height: 72px; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04); }
  .au-mdx-metric-label { display: block; color: #64748b; font-size: 0.72rem; line-height: 1.2; font-weight: 750; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
  .au-mdx-metric-value { display: block; color: #111827; font-size: 1.02rem; line-height: 1.35; font-weight: 650; }
  .au-mdx-feature-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
  .au-mdx-feature-item { border: 1px solid #e5e7eb; border-radius: 12px; background: #fff; padding: 15px; box-shadow: 0 8px 20px rgba(15, 23, 42, 0.04); }
  .au-mdx-feature-title { display: block; color: #0f172a; font-weight: 750; margin-bottom: 5px; }
  .au-mdx-feature-text { display: block; color: #475569; line-height: 1.55; }
  .au-mdx-executive-summary { border: 0; border-top: 3px solid #111827; border-bottom: 1px solid #d9dee6; border-radius: 0; margin: 28px 0 30px; background: #fff; }
  .au-mdx-executive-summary .au-mdx-component-body { padding: 18px 0; }
  .au-mdx-executive-summary p { max-width: 760px; color: #111827; font-size: 1.08rem; line-height: 1.72; }
  .au-mdx-metric-strip { border: 0; border-radius: 0; margin: 24px 0 30px; background: transparent; }
  .au-mdx-metric-strip .au-mdx-component-body { padding: 0; }
  .au-mdx-metric-strip .au-mdx-metric-grid { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); border-top: 1px solid #111827; border-bottom: 1px solid #d9dee6; gap: 0; }
  .au-mdx-metric-strip .au-mdx-metric-item { border: 0; border-right: 1px solid #d9dee6; border-radius: 0; background: #fff; box-shadow: none; min-height: 78px; }
  .au-mdx-metric-strip .au-mdx-metric-item:last-child { border-right: 0; }
  .au-mdx-finding { border: 0; border-radius: 0; background: transparent; }
  .au-mdx-finding .au-mdx-component-body { padding: 0; }
  .au-mdx-finding .au-mdx-feature-grid { grid-template-columns: 1fr; gap: 8px; }
  .au-mdx-finding .au-mdx-feature-item { border: 0; border-top: 1px solid #d9dee6; border-radius: 0; box-shadow: none; padding: 14px 0; }
  .au-mdx-evidence { border-color: #d9dee6; border-radius: 2px; background: #fafafa; }
  .au-mdx-evidence .au-mdx-feature-item { background: #fff; box-shadow: none; }
  .au-mdx-figure { border: 1px solid #d9dee6; border-radius: 2px; background: #fff; }
  .au-mdx-figure .au-mdx-component-body { padding: 16px; }
  .au-mdx-decision-table { width: 100%; border-collapse: collapse; font-size: 0.95rem; }
  .au-mdx-decision-table th { color: #64748b; font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.08em; border-bottom: 1px solid #111827; padding: 12px 18px; text-align: left; }
  .au-mdx-decision-table td { border-bottom: 1px solid #e5e7eb; padding: 18px; vertical-align: top; }
  .au-mdx-decision-table td:first-child { width: 30%; color: #111827; font-weight: 700; }
  .au-mdx-decision-table th:first-child, .au-mdx-decision-table td:first-child { padding-left: 20px; }
  .au-mdx-decision-table th:last-child, .au-mdx-decision-table td:last-child { padding-right: 20px; }
  .au-mdx-source-quote { background: #fdfbf5; border-color: #fde68a; border-left: 5px solid #d97706; }
  .au-mdx-source-quote .au-mdx-component-body { font-size: 1.06rem; font-style: italic; }
  .au-mdx-card, .au-mdx-metric-card, .au-mdx-stat { background: #fff; border-color: #e5e7eb; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.07); }
  .au-mdx-alert, .au-mdx-alert-dialog, .au-mdx-toast, .au-mdx-sonner { background: #fff7ed; border-color: #fed7aa; }
  .au-mdx-badge, .au-mdx-button, .au-mdx-toggle, .au-mdx-toggle-group { display: inline-flex; align-items: center; width: fit-content; margin: 0 10px 12px 0; border-radius: 999px; background: #111827; color: #fff; border-color: #111827; vertical-align: middle; }
  .au-mdx-badge .au-mdx-component-body, .au-mdx-button .au-mdx-component-body, .au-mdx-toggle .au-mdx-component-body, .au-mdx-toggle-group .au-mdx-component-body { padding: 6px 12px; }
  .au-mdx-badge p, .au-mdx-button p, .au-mdx-toggle p, .au-mdx-toggle-group p { color: inherit; margin: 0; font-size: 0.83rem; line-height: 1.2; font-weight: 650; }
  .au-mdx-input, .au-mdx-input-otp, .au-mdx-textarea, .au-mdx-select, .au-mdx-checkbox, .au-mdx-radio-group, .au-mdx-switch, .au-mdx-slider, .au-mdx-form, .au-mdx-label, .au-mdx-date-picker { background: #fff; border-color: #cbd5e1; }
  .au-mdx-dialog, .au-mdx-drawer, .au-mdx-sheet, .au-mdx-popover, .au-mdx-hover-card, .au-mdx-dropdown-menu, .au-mdx-context-menu, .au-mdx-command, .au-mdx-menubar, .au-mdx-navigation-menu, .au-mdx-sidebar, .au-mdx-resizable { background: #f8fafc; border-color: #cbd5e1; }
  .au-mdx-breadcrumb, .au-mdx-pagination, .au-mdx-scroll-area, .au-mdx-carousel, .au-mdx-aspect-ratio, .au-mdx-avatar, .au-mdx-skeleton { background: #f8fafc; border-color: #e2e8f0; }
  .au-mdx-separator { border: 0; border-top: 1px solid #cbd5e1; margin: 24px 0; }
  .au-mdx-progress-track { height: 10px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
  .au-mdx-progress-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #2563eb, #22c55e); }
  .au-mdx-chart { background: #fff; border-color: #e5e7eb; box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06); }
  .au-mdx-chart .au-mdx-component-body { padding: 18px 20px 8px; }
  .au-mdx-chart svg { width: 100%; height: auto; display: block; overflow: visible; }
  .au-mdx-chart-label { fill: #475569; font-size: 11px; }
  .au-mdx-chart-axis { stroke: #cbd5e1; stroke-width: 1; }
  .au-mdx-chart-line { fill: none; stroke: #2563eb; stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; }
  .au-mdx-chart-area { fill: rgba(37, 99, 235, 0.16); stroke: #2563eb; stroke-width: 4; }
  .au-mdx-chart-bar { fill: #2563eb; filter: drop-shadow(0 5px 7px rgba(37, 99, 235, 0.18)); }
  .au-mdx-chart-pie { width: 180px; height: 180px; border-radius: 999px; border: 1px solid #e2e8f0; box-shadow: inset 0 0 0 34px #fff; }
  .au-mdx-chart-legend { display: grid; gap: 8px; margin-top: 14px; }
  .au-mdx-chart-legend-item { display: flex; align-items: center; gap: 8px; color: #334155; font-size: 0.92rem; }
  .au-mdx-chart-swatch { width: 10px; height: 10px; border-radius: 999px; display: inline-block; }
  @media (max-width: 720px) {
    .au-mdx-article { border-radius: 14px; }
    .au-mdx-article h2 { margin-top: 30px; padding-top: 22px; }
    .au-mdx-compare .au-mdx-component-body li { border-right: 0; border-bottom: 1px solid #e5e7eb; min-height: auto; }
    .au-mdx-compare .au-mdx-component-body li:last-child { border-bottom: 0; }
    .au-mdx-metric-strip .au-mdx-metric-grid { grid-template-columns: 1fr; }
    .au-mdx-metric-strip .au-mdx-metric-item { border-right: 0; border-bottom: 1px solid #d9dee6; }
    .au-mdx-metric-strip .au-mdx-metric-item:last-child { border-bottom: 0; }
  }
`;
