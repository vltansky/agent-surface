export const AGENTS_UI_MDX_IMPORT = "agent-surface/mdx";
export const SHADCN_COMPONENT_IMPORT_RE = /^@\/components\/ui\/[a-z0-9][a-z0-9-]*$/;

export const MDX_COMPONENT_NAMES = [
  "Accordion",
  "Alert",
  "AlertDialog",
  "AspectRatio",
  "ArtifactLink",
  "Avatar",
  "Badge",
  "Breadcrumb",
  "Button",
  "ButtonGroup",
  "Calendar",
  "Callout",
  "Card",
  "CardContent",
  "CardDescription",
  "CardFooter",
  "CardHeader",
  "CardTitle",
  "Carousel",
  "ChartArea",
  "ChartBar",
  "ChartLine",
  "ChartPie",
  "Checkbox",
  "Collapsible",
  "Combobox",
  "Command",
  "ContextMenu",
  "Compare",
  "DataTable",
  "DatePicker",
  "DecisionTable",
  "Dialog",
  "Direction",
  "Drawer",
  "DropdownMenu",
  "Empty",
  "Evidence",
  "ExecutiveSummary",
  "Field",
  "Figure",
  "Finding",
  "Form",
  "HoverCard",
  "Input",
  "InputGroup",
  "InputOTP",
  "Item",
  "Kbd",
  "Label",
  "Menubar",
  "MetricCard",
  "MetricStrip",
  "NativeSelect",
  "NavigationMenu",
  "Pagination",
  "Popover",
  "Progress",
  "RadioGroup",
  "Resizable",
  "RiskTable",
  "ScrollArea",
  "Select",
  "Separator",
  "Sheet",
  "Sidebar",
  "Skeleton",
  "Slider",
  "Sonner",
  "SourceQuote",
  "Spinner",
  "Stat",
  "Switch",
  "Table",
  "Tabs",
  "Textarea",
  "Timeline",
  "Toast",
  "Toggle",
  "ToggleGroup",
  "Tooltip",
  "Typography",
] as const;

export type MdxComponentName = (typeof MDX_COMPONENT_NAMES)[number];
export type MdxComponentProps = {
  children?: unknown;
  [key: string]: unknown;
};
export type MdxComponent = (props: MdxComponentProps) => null;
export type MdxComponentMap = {
  readonly [Name in MdxComponentName]: MdxComponent;
};
export type MdxComponentDictionary = Record<string, MdxComponent>;

const MDX_COMPONENT_NAME_SET = new Set<string>(MDX_COMPONENT_NAMES);

export function isMdxComponentName(name: string): name is MdxComponentName {
  return MDX_COMPONENT_NAME_SET.has(name);
}

function createMdxComponent(_name: MdxComponentName): MdxComponent {
  return () => null;
}

export const MDX_COMPONENTS = Object.freeze(
  Object.fromEntries(MDX_COMPONENT_NAMES.map((name) => [name, createMdxComponent(name)]))
) as MdxComponentMap;

export function createMdxComponents(
  overrides: MdxComponentDictionary = {}
): MdxComponentDictionary {
  return {
    ...MDX_COMPONENTS,
    ...overrides,
  };
}

export function useMDXComponents(
  components: MdxComponentDictionary = {}
): MdxComponentDictionary {
  return createMdxComponents(components);
}

export const Accordion = MDX_COMPONENTS.Accordion;
export const Alert = MDX_COMPONENTS.Alert;
export const AlertDialog = MDX_COMPONENTS.AlertDialog;
export const AspectRatio = MDX_COMPONENTS.AspectRatio;
export const ArtifactLink = MDX_COMPONENTS.ArtifactLink;
export const Avatar = MDX_COMPONENTS.Avatar;
export const Badge = MDX_COMPONENTS.Badge;
export const Breadcrumb = MDX_COMPONENTS.Breadcrumb;
export const Button = MDX_COMPONENTS.Button;
export const ButtonGroup = MDX_COMPONENTS.ButtonGroup;
export const Calendar = MDX_COMPONENTS.Calendar;
export const Callout = MDX_COMPONENTS.Callout;
export const Card = MDX_COMPONENTS.Card;
export const CardContent = MDX_COMPONENTS.CardContent;
export const CardDescription = MDX_COMPONENTS.CardDescription;
export const CardFooter = MDX_COMPONENTS.CardFooter;
export const CardHeader = MDX_COMPONENTS.CardHeader;
export const CardTitle = MDX_COMPONENTS.CardTitle;
export const Carousel = MDX_COMPONENTS.Carousel;
export const ChartArea = MDX_COMPONENTS.ChartArea;
export const ChartBar = MDX_COMPONENTS.ChartBar;
export const ChartLine = MDX_COMPONENTS.ChartLine;
export const ChartPie = MDX_COMPONENTS.ChartPie;
export const Checkbox = MDX_COMPONENTS.Checkbox;
export const Collapsible = MDX_COMPONENTS.Collapsible;
export const Combobox = MDX_COMPONENTS.Combobox;
export const Command = MDX_COMPONENTS.Command;
export const ContextMenu = MDX_COMPONENTS.ContextMenu;
export const Compare = MDX_COMPONENTS.Compare;
export const DataTable = MDX_COMPONENTS.DataTable;
export const DatePicker = MDX_COMPONENTS.DatePicker;
export const DecisionTable = MDX_COMPONENTS.DecisionTable;
export const Dialog = MDX_COMPONENTS.Dialog;
export const Direction = MDX_COMPONENTS.Direction;
export const Drawer = MDX_COMPONENTS.Drawer;
export const DropdownMenu = MDX_COMPONENTS.DropdownMenu;
export const Empty = MDX_COMPONENTS.Empty;
export const Evidence = MDX_COMPONENTS.Evidence;
export const ExecutiveSummary = MDX_COMPONENTS.ExecutiveSummary;
export const Field = MDX_COMPONENTS.Field;
export const Figure = MDX_COMPONENTS.Figure;
export const Finding = MDX_COMPONENTS.Finding;
export const Form = MDX_COMPONENTS.Form;
export const HoverCard = MDX_COMPONENTS.HoverCard;
export const Input = MDX_COMPONENTS.Input;
export const InputGroup = MDX_COMPONENTS.InputGroup;
export const InputOTP = MDX_COMPONENTS.InputOTP;
export const Item = MDX_COMPONENTS.Item;
export const Kbd = MDX_COMPONENTS.Kbd;
export const Label = MDX_COMPONENTS.Label;
export const Menubar = MDX_COMPONENTS.Menubar;
export const MetricCard = MDX_COMPONENTS.MetricCard;
export const MetricStrip = MDX_COMPONENTS.MetricStrip;
export const NativeSelect = MDX_COMPONENTS.NativeSelect;
export const NavigationMenu = MDX_COMPONENTS.NavigationMenu;
export const Pagination = MDX_COMPONENTS.Pagination;
export const Popover = MDX_COMPONENTS.Popover;
export const Progress = MDX_COMPONENTS.Progress;
export const RadioGroup = MDX_COMPONENTS.RadioGroup;
export const Resizable = MDX_COMPONENTS.Resizable;
export const RiskTable = MDX_COMPONENTS.RiskTable;
export const ScrollArea = MDX_COMPONENTS.ScrollArea;
export const Select = MDX_COMPONENTS.Select;
export const Separator = MDX_COMPONENTS.Separator;
export const Sheet = MDX_COMPONENTS.Sheet;
export const Sidebar = MDX_COMPONENTS.Sidebar;
export const Skeleton = MDX_COMPONENTS.Skeleton;
export const Slider = MDX_COMPONENTS.Slider;
export const Sonner = MDX_COMPONENTS.Sonner;
export const SourceQuote = MDX_COMPONENTS.SourceQuote;
export const Spinner = MDX_COMPONENTS.Spinner;
export const Stat = MDX_COMPONENTS.Stat;
export const Switch = MDX_COMPONENTS.Switch;
export const Table = MDX_COMPONENTS.Table;
export const Tabs = MDX_COMPONENTS.Tabs;
export const Textarea = MDX_COMPONENTS.Textarea;
export const Timeline = MDX_COMPONENTS.Timeline;
export const Toast = MDX_COMPONENTS.Toast;
export const Toggle = MDX_COMPONENTS.Toggle;
export const ToggleGroup = MDX_COMPONENTS.ToggleGroup;
export const Tooltip = MDX_COMPONENTS.Tooltip;
export const Typography = MDX_COMPONENTS.Typography;
