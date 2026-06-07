/*
 * Concept Picker — Grid + Full View
 *
 * Two view modes: Grid (all concepts visible) and Full (one at a time, iframe).
 * Per-concept: select toggle, 5-star rating, text comment.
 * Inspired by gstack design-shotgun comparison board.
 *
 * Expected __as.data shape:
 * {
 *   title: "Pick your favorite concepts",
 *   items: [
 *     { id: "concept-1-tabs", name: "Tabbed Navigation", description: "...", src: "concept-1-tabs/index.html" },
 *   ]
 * }
 *
 * Returns via __as.done():
 * {
 *   selected: { id: "concept-1-tabs", rating: 4, notes: "love the tab switching UX" },
 *   ratings: { "concept-1-tabs": 4, "concept-2-sidebar": 2 },
 *   overall: "Use A's layout with C's nav"
 * }
 *
 * Or via __as.regenerate():
 * {
 *   action: "different" | "refine" | "more_like_{id}" | "custom",
 *   ratings: {...}, notes: {...}, overall: "..."
 * }
 */

function Stars({ value, onChange, hover, onHover, onLeave }) {
  return (
    <div className="inline-flex items-center gap-0.5" onMouseLeave={onLeave}>
      {[1,2,3,4,5].map((s) => (
        <button
          key={s}
          className={`w-6 h-6 flex items-center justify-center transition-colors ${
            s <= (hover || value) ? "text-yellow-400" : "text-gray-300 hover:text-gray-400"
          }`}
          onMouseEnter={() => onHover(s)}
          onClick={() => onChange(s === value ? 0 : s)}
        >
          <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function App() {
  const { title = "Select concepts", items = [] } = window.__as.data;
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

  const [view, setView] = React.useState("grid");
  const [current, setCurrent] = React.useState(0);
  const [selected, setSelected] = React.useState(null);
  const [ratings, setRatings] = React.useState({});
  const [hoverStars, setHoverStars] = React.useState({});
  const [notes, setNotes] = React.useState({});
  const [overall, setOverall] = React.useState("");

  const hasSelection = selected !== null;

  const pick = (id) => setSelected(selected === id ? null : id);
  const rate = (id, v) => setRatings((p) => ({ ...p, [id]: v }));

  const submit = () => {
    const picked = selected ? items.find((it) => it.id === selected) : null;
    const allRatings = {};
    items.forEach((it) => { if (ratings[it.id]) allRatings[it.id] = ratings[it.id]; });
    window.__as.done({
      selected: picked ? { id: picked.id, rating: ratings[picked.id] || 0, notes: notes[picked.id] || "" } : null,
      ratings: allRatings,
      overall,
    });
  };

  // Register auto-submit so timeout captures current state
  React.useEffect(() => {
    window.__as._autoSubmit = submit;
  });

  const regenerate = (action, extra = {}) => {
    const allRatings = {};
    items.forEach((it) => { if (ratings[it.id]) allRatings[it.id] = ratings[it.id]; });
    const allNotes = {};
    items.forEach((it) => { if (notes[it.id]) allNotes[it.id] = notes[it.id]; });
    window.__as.regenerate({ action, ratings: allRatings, notes: allNotes, overall, ...extra });
  };

  // --- Full view (one at a time with iframe) ---
  if (view === "full") {
    if (items.length === 0) return null;
    const it = items[current];
    return (
      <div className="h-screen flex flex-col bg-gray-900">
        {/* Header — same toggle UI as grid mode */}
        <div className="flex items-center justify-between px-4 py-2 bg-gray-900/95 border-b border-gray-700 z-10">
          <div className="flex items-center gap-4">
            <span className="text-white text-sm font-semibold">{title}</span>
            <div className="flex bg-gray-800 rounded-lg p-0.5">
              <button
                className="px-3 py-1 rounded-md text-xs font-medium text-gray-400 hover:text-gray-200"
                onClick={() => setView("grid")}
              >Grid</button>
              <button
                className="px-3 py-1 rounded-md text-xs font-medium bg-gray-600 text-white shadow-sm"
              >Full</button>
            </div>
            <span className="text-gray-500 text-xs">{it.name} &middot; {current + 1}/{items.length}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">
              {hasSelection ? `Picked: ${items.find(x => x.id === selected)?.name}` : "None picked"}
            </span>
            <button
              className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                hasSelection ? "bg-white text-gray-900 hover:bg-gray-100" : "bg-gray-700 text-gray-400 cursor-not-allowed"
              }`}
              disabled={!hasSelection}
              onClick={submit}
            >
              Submit
            </button>
          </div>
        </div>

        {/* Iframe */}
        <div className="flex-1 relative">
          <iframe
            key={it.id}
            src={it.src}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts"
          />

          {/* Bottom controls */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2">
            <input
              type="text"
              className="w-80 px-4 py-2 text-sm rounded-full bg-gray-800/90 backdrop-blur-sm border border-gray-600 text-gray-200 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              placeholder={`Notes for ${it.name}...`}
              value={notes[it.id] || ""}
              onChange={(e) => setNotes((p) => ({ ...p, [it.id]: e.target.value }))}
            />
            <div className="flex items-center gap-3 bg-gray-900/90 backdrop-blur-sm rounded-full px-3 py-2 shadow-2xl border border-gray-700">
              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center ${current > 0 ? "text-gray-300 hover:bg-gray-700" : "text-gray-600"}`}
                disabled={current === 0}
                onClick={() => setCurrent(current - 1)}
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16"><path d="M10 12L6 8l4-4" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
              </button>
              <button
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
                  selected === it.id ? "bg-blue-600 text-white" : "bg-white text-gray-900 hover:bg-blue-50"
                }`}
                onClick={() => pick(it.id)}
              >
                {selected === it.id ? "\u2713 Picked" : "Pick this"}
              </button>
              <Stars
                value={ratings[it.id] || 0}
                hover={hoverStars[it.id] || 0}
                onChange={(v) => rate(it.id, v)}
                onHover={(v) => setHoverStars((p) => ({ ...p, [it.id]: v }))}
                onLeave={() => setHoverStars((p) => ({ ...p, [it.id]: 0 }))}
              />
              <button
                className={`w-8 h-8 rounded-full flex items-center justify-center ${current < items.length - 1 ? "text-gray-300 hover:bg-gray-700" : "text-gray-600"}`}
                disabled={current >= items.length - 1}
                onClick={() => setCurrent(current + 1)}
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16"><path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="2" fill="none" /></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Grid view (all concepts visible) ---
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            {/* View toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "grid" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setView("grid")}
              >Grid</button>
              <button
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  view === "full" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                }`}
                onClick={() => setView("full")}
              >Full</button>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              {hasSelection ? `Picked: ${items.find(x => x.id === selected)?.name}` : "None picked"}
            </span>
            <button
              className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                hasSelection ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
              disabled={!hasSelection}
              onClick={submit}
            >
              Submit
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className={`grid gap-6 ${items.length <= 2 ? "grid-cols-2" : "grid-cols-3"}`}>
          {items.map((it, i) => (
            <div
              key={it.id}
              className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${
                selected === it.id ? "border-blue-500 ring-2 ring-blue-100" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              {/* Iframe preview — zoomed out to show full page */}
              <div className="relative group overflow-hidden" style={{ height: 280 }}>
                <iframe
                  src={it.src}
                  className="bg-white pointer-events-none"
                  sandbox="allow-scripts"
                  style={{
                    width: "200%",
                    height: "200%",
                    transform: "scale(0.5)",
                    transformOrigin: "top left",
                    border: "none",
                  }}
                  tabIndex={-1}
                />
                {/* Overlay to open full view */}
                <button
                  className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center"
                  onClick={() => { setCurrent(i); setView("full"); }}
                >
                  <span className="opacity-0 group-hover:opacity-100 bg-white/90 backdrop-blur-sm text-gray-900 text-xs font-medium px-3 py-1.5 rounded-full shadow transition-opacity">
                    View full
                  </span>
                </button>
              </div>

              {/* Card content */}
              <div className="p-4 border-t border-gray-100">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-gray-900 text-white text-xs font-medium flex items-center justify-center">
                        {labels[i] || i + 1}
                      </span>
                      <span className="font-medium text-sm text-gray-900">{it.name}</span>
                    </div>
                    {it.description && (
                      <p className="text-xs text-gray-500 mt-1 ml-8">{it.description}</p>
                    )}
                  </div>
                  <button
                    className={`flex-shrink-0 w-7 h-7 rounded-full border-2 flex items-center justify-center transition-all ${
                      selected === it.id ? "border-blue-500 bg-blue-500 text-white" : "border-gray-300 hover:border-gray-400"
                    }`}
                    onClick={() => pick(it.id)}
                  >
                    {selected === it.id && (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none">
                        <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                </div>

                {/* Rating + comment row */}
                <div className="flex items-center gap-2 mt-3">
                  <Stars
                    value={ratings[it.id] || 0}
                    hover={hoverStars[it.id] || 0}
                    onChange={(v) => rate(it.id, v)}
                    onHover={(v) => setHoverStars((p) => ({ ...p, [it.id]: v }))}
                    onLeave={() => setHoverStars((p) => ({ ...p, [it.id]: 0 }))}
                  />
                  <input
                    type="text"
                    className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-200 placeholder-gray-400"
                    placeholder="Notes..."
                    value={notes[it.id] || ""}
                    onChange={(e) => setNotes((p) => ({ ...p, [it.id]: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Bottom: Submit + Regenerate */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-[1fr_340px] gap-6">
          {/* Left: Overall direction + submit */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-1">Overall direction</h3>
            <p className="text-xs text-gray-500 mb-3">e.g. "Use A's layout with C's navigation pattern"</p>
            <textarea
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none"
              rows={2}
              placeholder="Describe the direction you want to go..."
              value={overall}
              onChange={(e) => setOverall(e.target.value)}
            />
            {hasSelection && (
              <p className="text-xs text-blue-600 mt-2">
                {"\u2192"} We'll move forward with Option {labels[items.findIndex(x => x.id === selected)]}
              </p>
            )}
            <button
              className={`mt-3 w-full py-2 rounded-lg text-sm font-medium transition-colors ${
                hasSelection ? "bg-gray-900 text-white hover:bg-gray-800" : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
              disabled={!hasSelection}
              onClick={submit}
            >
              Take my feedback and continue {"\u2192"}
            </button>
          </div>

          {/* Right: Regenerate panel */}
          <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-900 mb-1">Want to explore more?</h3>
            <p className="text-xs text-gray-500 mb-3">Generate new concepts based on your feedback</p>
            <div className="flex gap-2 mb-3">
              <button
                className="flex-1 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-full hover:bg-white transition-colors"
                onClick={() => regenerate("different")}
              >
                Totally different
              </button>
              <button
                className="flex-1 px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-full hover:bg-white transition-colors"
                onClick={() => regenerate("refine")}
              >
                Refine these
              </button>
            </div>
            {hasSelection && (
              <button
                className="w-full px-3 py-1.5 text-xs font-medium border border-gray-300 rounded-full hover:bg-white transition-colors mb-3"
                onClick={() => regenerate("more_like_" + selected)}
              >
                More like Option {labels[items.findIndex(x => x.id === selected)]}
              </button>
            )}
            <textarea
              className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-1 focus:ring-gray-300 resize-none"
              rows={2}
              placeholder="Custom instructions for regeneration..."
              id="regen-custom"
            />
            <button
              className="w-full py-2 rounded-lg text-sm font-medium bg-gray-200 text-gray-700 hover:bg-gray-300 transition-colors"
              onClick={() => {
                var el = document.getElementById("regen-custom");
                regenerate("custom", { customPrompt: el && el.value ? el.value : "" });
              }}
            >
              Regenerate {"\u2192"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
