/*
 * Tractor Feedback Template
 *
 * Use case: agent-surface form — collect per-screen structured feedback
 * on a generated tractor wireframe.
 *
 * Expected __as.data shape:
 * {
 *   title: "Review Tractor: Booking Flow",
 *   screens: [
 *     { id: "settings-panel", name: "Settings Panel", phase: 1 },
 *     { id: "payment-modal", name: "Payment Modal", phase: 1 },
 *     { id: "confirmation", name: "Confirmation Screen", phase: 2 }
 *   ]
 * }
 *
 * Returns via __as.done():
 * {
 *   feedback: [
 *     { screen: "settings-panel", note: "move to left sidebar", priority: "high" },
 *     { screen: "payment-modal", note: "add error state", priority: "medium" }
 *   ],
 *   approved: false
 * }
 *
 * Usage in SKILL.md:
 *   RESULT=$(npx --registry "https://registry.npmjs.org" -y agent-surface serve assets/form.jsx --data-file /tmp/tractor-screens.json)
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

function Layout({ title, subtitle, children, footer }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {(title || subtitle) && (
        <div className="px-8 pt-8 pb-4 max-w-3xl mx-auto w-full">
          {title && <h1 className="text-xl font-bold text-gray-900">{title}</h1>}
          {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
        </div>
      )}
      <div className="flex-1 px-8 pb-8 max-w-3xl mx-auto w-full">{children}</div>
      {footer && (
        <div className="border-t bg-white px-8 py-4">
          <div className="max-w-3xl mx-auto w-full">{footer}</div>
        </div>
      )}
    </div>
  );
}

function App() {
  const { title = "Review", screens = [] } = window.__as.data;
  const [feedback, setFeedback] = React.useState({});
  const [priorities, setPriorities] = React.useState({});
  const [expandedId, setExpandedId] = React.useState(null);

  const addNote = (screenId, note) => {
    setFeedback((prev) => ({ ...prev, [screenId]: note }));
  };

  const setPriority = (screenId, priority) => {
    setPriorities((prev) => ({ ...prev, [screenId]: priority }));
  };

  const feedbackEntries = screens
    .filter((s) => feedback[s.id]?.trim())
    .map((s) => ({
      screen: s.id,
      note: feedback[s.id].trim(),
      priority: priorities[s.id] || "medium",
    }));

  const submit = (approved) => {
    window.__as.done({ feedback: feedbackEntries, approved });
  };

  React.useEffect(() => {
    window.__as._autoSubmit = () => submit(feedbackEntries.length === 0);
  });

  const phaseColors = {
    1: "bg-gray-900 text-white",
    2: "bg-yellow-300 text-gray-900",
  };

  return (
    <Layout
      title={title}
      subtitle="Click a screen to add feedback. Submit with no notes to approve as-is."
      footer={
        <div className="flex items-center justify-between">
          <Button variant="ghost" onClick={() => window.__as.cancel()}>
            Cancel
          </Button>
          <div className="flex gap-3">
            {feedbackEntries.length === 0 ? (
              <Button variant="success" onClick={() => submit(true)}>
                Approve as-is
              </Button>
            ) : (
              <Button onClick={() => submit(false)}>
                Submit {feedbackEntries.length} note
                {feedbackEntries.length !== 1 ? "s" : ""}
              </Button>
            )}
          </div>
        </div>
      }
    >
        <div className="space-y-3">
          {screens.map((screen) => (
            <Card
              key={screen.id}
              className="overflow-hidden"
            >
              <button
                className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 transition-colors"
                onClick={() =>
                  setExpandedId(expandedId === screen.id ? null : screen.id)
                }
              >
                <div className="flex items-center gap-3">
                  <span className="font-medium text-gray-900">
                    {screen.name}
                  </span>
                  {screen.phase && (
                    <Badge variant={screen.phase === 2 ? "yellow" : "dark"}>
                      Phase {screen.phase}
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {feedback[screen.id]?.trim() && (
                    <span className="w-2 h-2 rounded-full bg-orange-400" />
                  )}
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform ${
                      expandedId === screen.id ? "rotate-180" : ""
                    }`}
                    viewBox="0 0 16 16"
                  >
                    <path
                      d="M4 6l4 4 4-4"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="none"
                    />
                  </svg>
                </div>
              </button>

              {expandedId === screen.id && (
                <div className="px-4 pb-4 border-t border-gray-100">
                  <Textarea
                    className="mt-3"
                    placeholder="What needs changing on this screen?"
                    rows={3}
                    value={feedback[screen.id] || ""}
                    onChange={(e) => addNote(screen.id, e.target.value)}
                    autoFocus
                  />
                  {feedback[screen.id]?.trim() && (
                    <div className="flex gap-2 mt-2">
                      {["low", "medium", "high"].map((p) => (
                        <button
                          key={p}
                          className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                            (priorities[screen.id] || "medium") === p
                              ? p === "high"
                                ? "bg-red-50 border-red-300 text-red-700"
                                : p === "medium"
                                ? "bg-yellow-50 border-yellow-300 text-yellow-700"
                                : "bg-green-50 border-green-300 text-green-700"
                              : "border-gray-200 text-gray-400 hover:border-gray-300"
                          }`}
                          onClick={() => setPriority(screen.id, p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
    </Layout>
  );
}
