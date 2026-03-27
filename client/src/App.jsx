import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
  AlertCircle,
  BarChart3,
  Building2,
  CalendarDays,
  ChevronRight,
  Download,
  Filter,
  File,
  FileText,
  GitCompare,
  History,
  Link2,
  Moon,
  Pause,
  Play,
  RefreshCw,
  Route,
  Save,
  Search,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Users,
  Wand2,
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Zap,
  Eye,
  Tag,
  Expand,
  Briefcase,
  HelpCircle,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Sector,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import './styles.css';

const API_BASE = 'http://localhost:8000';

const ENTITY_COLORS = {
  Party: '#0d9488',
  Clause: '#0891b2',
  Date: '#d97706',
  Document: '#334155',
  Obligation: '#dc2626',
  Unknown: '#64748b',
};

const FILTERS = [
  { label: 'All', value: 'All' },
  { label: 'Parties', value: 'Party' },
  { label: 'Clauses', value: 'Clause' },
  { label: 'Dates', value: 'Date' },
];

function getLinkNodeId(value) {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (value && typeof value === 'object') {
    return String(value.id ?? value.key ?? value.name ?? '');
  }
  return '';
}

function normalizeNode(node, index) {
  const id = String(node?.id ?? node?.key ?? node?.name ?? `node-${index}`);
  return {
    ...node,
    id,
    name: String(node?.name ?? node?.label ?? id),
    type: String(node?.type ?? 'Unknown'),
    description: String(node?.description ?? ''),
  };
}

function normalizeLink(link, index) {
  const source = getLinkNodeId(link?.source);
  const target = getLinkNodeId(link?.target);
  return {
    ...link,
    id: String(link?.id ?? `${source}-${target}-${index}`),
    source,
    target,
    type: String(link?.type ?? link?.relation ?? 'RELATED_TO'),
    reason: String(link?.reason ?? ''),
  };
}

// === NEW: Helper function to get second-degree connections ===
function getSecondDegreeConnections(nodeId, linksWithMetadata) {
  const secondDegree = new Set();
  // Find all first-degree neighbors
  const firstDegree = new Set();
  linksWithMetadata.forEach((link) => {
    if (link.sourceId === nodeId) {
      firstDegree.add(link.targetId);
    } else if (link.targetId === nodeId) {
      firstDegree.add(link.sourceId);
    }
  });
  // Find second-degree connections
  linksWithMetadata.forEach((link) => {
    if (firstDegree.has(link.sourceId)) {
      secondDegree.add(link.targetId);
    } else if (firstDegree.has(link.targetId)) {
      secondDegree.add(link.sourceId);
    }
  });
  // Remove first-degree from second-degree
  firstDegree.forEach((id) => secondDegree.delete(id));
  secondDegree.delete(nodeId);
  return secondDegree;
}

function relationshipSeverityColor(type) {
  const rel = String(type || '').toUpperCase();
  if (rel.includes('CONTRADICT')) return '#dc2626';
  if (rel.includes('SUPERSEDE') || rel.includes('OVERRIDE')) return '#ea580c';
  if (rel.includes('OBLIGAT')) return '#0891b2';
  return '#0d9488';
}

function getEntityTypeIcon(type) {
  switch (type) {
    case 'Party':
      return Building2;
    case 'Clause':
      return FileText;
    case 'Date':
      return CalendarDays;
    case 'Document':
      return File;
    case 'Obligation':
      return Briefcase;
    default:
      return HelpCircle;
  }
}

function renderActivePieShape(props) {
  const {
    cx,
    cy,
    innerRadius,
    outerRadius,
    startAngle,
    endAngle,
    fill,
    payload,
    percent,
    value,
  } = props;

  return (
    <g>
      <text x={cx} y={cy - 4} dy={8} textAnchor="middle" fill="#0f172a" className="dark:fill-slate-100" fontSize={12} fontWeight={700}>
        {payload?.name}
      </text>
      <text x={cx} y={cy + 14} dy={8} textAnchor="middle" fill="#475569" fontSize={11}>
        {value} ({(percent * 100).toFixed(1)}%)
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    </g>
  );
}

function extractEntityTimestamp(entity) {
  const text = `${entity?.name ?? ''} ${entity?.description ?? ''}`.trim();
  if (!text) {
    return Number.NaN;
  }
  const direct = Date.parse(text);
  if (!Number.isNaN(direct)) {
    return direct;
  }
  const yearMatch = text.match(/\b(19|20)\d{2}\b/);
  if (yearMatch) {
    return Date.parse(`${yearMatch[0]}-01-01`);
  }
  return Number.NaN;
}

function extractChunkIndex(entity) {
  const directFields = [entity?.chunk, entity?.chunk_id, entity?.chunkIndex, entity?.source_chunk];
  for (const value of directFields) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const text = `${entity?.id ?? ''} ${entity?.name ?? ''} ${entity?.description ?? ''}`;
  const match = text.match(/chunk[_\s-]?(\d{1,3})/i);
  if (match) {
    return Number(match[1]);
  }
  return 1;
}

function renderHighlightedText(text, query) {
  const source = String(text ?? '');
  const q = String(query ?? '').trim();
  if (!q) {
    return source;
  }
  const lower = source.toLowerCase();
  const target = q.toLowerCase();
  const index = lower.indexOf(target);
  if (index === -1) {
    return source;
  }
  const before = source.slice(0, index);
  const match = source.slice(index, index + q.length);
  const after = source.slice(index + q.length);
  return (
    <>
      {before}
      <mark className="rounded bg-amber-100 px-0.5 text-slate-900 dark:bg-amber-400/40 dark:text-white">{match}</mark>
      {after}
    </>
  );
}

function GlassCard({ children, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-white/55 bg-white/80 shadow-[0_18px_50px_-24px_rgba(8,145,178,0.55)] backdrop-blur dark:border-slate-700/60 dark:bg-slate-900/70 ${className}`}
    >
      {children}
    </div>
  );
}

function EmptyBlock({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-xl border border-dashed border-slate-300/80 bg-slate-50/80 p-6 text-center dark:border-slate-700 dark:bg-slate-800/40">
      <Icon className="mb-2 h-7 w-7 text-slate-400 dark:text-slate-500" />
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
    </div>
  );
}

const MemoStatCard = memo(function MemoStatCard({ card, idx, pageLoadComplete, loading, pulse }) {
  return (
    <div
      className={`stat-card stat-card-${idx} rounded-xl border border-white/25 bg-white/10 px-3 py-3 backdrop-blur transition-all duration-300 ${
        pageLoadComplete ? 'animate-stat-card-enter' : ''
      }`}
    >
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100">{card.label}</p>
        <card.icon className={`h-4 w-4 text-cyan-50 ${pulse ? 'animate-icon-bounce' : ''}`} />
      </div>
      <p className="stat-card-number mt-2 text-2xl font-bold">{loading ? 0 : card.value}</p>
    </div>
  );
});

const MemoChartShell = memo(function MemoChartShell({ title, children, className = '' }) {
  return (
    <GlassCard className={`p-4 ${className}`}>
      <h3 className="mb-3 text-base font-bold">{title}</h3>
      <div className="h-72">{children}</div>
    </GlassCard>
  );
});

const MemoForceGraph2D = memo(function MemoForceGraph2D(props) {
  return <ForceGraph2D {...props} />;
});

function LazyRender({ placeholder, children }) {
  const anchorRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!anchorRef.current || isVisible) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' }
    );
    observer.observe(anchorRef.current);
    return () => observer.disconnect();
  }, [isVisible]);

  return <div ref={anchorRef} className="h-full">{isVisible ? children : placeholder}</div>;
}

// === NEW: Node Hover Tooltip Component ===
function NodeHoverTooltip({ node, mouseX, mouseY, connectionCount, connectedNames }) {
  if (!node) return null;
  return (
    <div
      className="pointer-events-none fixed z-[100] max-w-xs rounded-lg border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95"
      style={{
        left: `${mouseX + 10}px`,
        top: `${mouseY + 10}px`,
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <p className="text-sm font-bold text-slate-900 dark:text-white">{node.name}</p>
      <div className="mt-1 flex items-center gap-2">
        <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {node.type}
        </span>
        <span className="text-[11px] font-semibold text-cyan-700 dark:text-cyan-300">
          {connectionCount} connections
        </span>
      </div>
      {node.description && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">{node.description}</p>
      )}
      {connectedNames.length > 0 && (
        <div className="mt-2 text-[10px]">
          <p className="font-semibold text-slate-500">Connected to:</p>
          <p className="line-clamp-2 text-slate-600 dark:text-slate-400">{connectedNames.join(', ')}</p>
        </div>
      )}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// === NEW: Edge Hover Tooltip Component ===
function EdgeHoverTooltip({ edge, mouseX, mouseY, fromName, toName }) {
  if (!edge) return null;
  return (
    <div
      className="pointer-events-none fixed z-[100] max-w-xs rounded-lg border border-cyan-200 bg-cyan-50/95 p-3 shadow-xl backdrop-blur dark:border-cyan-900 dark:bg-cyan-950/95"
      style={{
        left: `${mouseX + 10}px`,
        top: `${mouseY + 10}px`,
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <p className="text-sm font-bold text-cyan-900 dark:text-cyan-100">{edge.type}</p>
      <div className="mt-2 space-y-1 text-xs">
        <p className="text-cyan-800 dark:text-cyan-200">
          <span className="font-semibold">From:</span> {fromName}
        </p>
        <p className="text-cyan-800 dark:text-cyan-200">
          <span className="font-semibold">To:</span> {toName}
        </p>
      </div>
      {edge.reason && (
        <div className="mt-2">
          <p className="font-semibold text-cyan-800 dark:text-cyan-200">Reason:</p>
          <p className="line-clamp-2 text-[10px] text-cyan-700 dark:text-cyan-300">{edge.reason}</p>
        </div>
      )}
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// === NEW: Skeleton Loaders (2E) ===
function SkeletonStatCard() {
  return (
    <div className="rounded-xl border border-white/25 bg-white/10 px-3 py-3 backdrop-blur">
      <div className="flex items-center justify-between">
        <div className="skeleton h-3 w-20 rounded" />
        <div className="skeleton h-4 w-4 rounded-full" />
      </div>
      <div className="mt-2 skeleton h-8 w-12 rounded" />
    </div>
  );
}

function SkeletonGraphArea() {
  return (
    <div className="h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/60">
      <div className="flex h-full items-center justify-center">
        <div className="space-y-4">
          <div className="flex gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="skeleton h-16 w-16 rounded-full" />
            ))}
          </div>
          <div className="skeleton-pulse text-center text-sm text-slate-400">Loading graph...</div>
        </div>
      </div>
    </div>
  );
}

function SkeletonChartArea() {
  return (
    <div className="h-72 space-y-3">
      <div className="skeleton-loading-bar h-full rounded-lg" />
    </div>
  );
}

// === NEW: Graph Controls Panel ===
function GraphControlsPanel({
  physicsEnabled,
  setPhysicsEnabled,
  labelsAlwaysVisible,
  setLabelsAlwaysVisible,
  edgeLabelsVisible,
  setEdgeLabelsVisible,
  nodeDraggingLocked,
  setNodeDraggingLocked,
  graphRef,
  className = '',
  showCloseButton = false,
  onClose,
}) {
  return (
    <div className={`pointer-events-auto w-full space-y-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500">Graph Controls</p>
        {showCloseButton && (
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Close controls"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2">
        <button
          onClick={() => graphRef.current?.centerAt(0, 0, 800) || null}
          title="Reset view to center"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <RotateCcw className="h-4 w-4" />
          Reset
        </button>
        <button
          onClick={() => graphRef.current?.zoom(1.2, 300) || null}
          title="Zoom in"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ZoomIn className="h-4 w-4" />
          Zoom In
        </button>
        <button
          onClick={() => graphRef.current?.zoom(0.8, 300) || null}
          title="Zoom out"
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ZoomOut className="h-4 w-4" />
          Zoom Out
        </button>
        <div className="my-2 h-px bg-slate-200 dark:bg-slate-700" />
        <button
          onClick={() => setPhysicsEnabled(!physicsEnabled)}
          title={physicsEnabled ? 'Disable physics' : 'Enable physics'}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
            physicsEnabled ? 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Zap className="h-4 w-4" />
          Physics: {physicsEnabled ? 'On' : 'Off'}
        </button>
        <button
          onClick={() => setLabelsAlwaysVisible(!labelsAlwaysVisible)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
            labelsAlwaysVisible ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Eye className="h-4 w-4" />
          Labels: {labelsAlwaysVisible ? 'Always' : 'Hover'}
        </button>
        <button
          onClick={() => setEdgeLabelsVisible(!edgeLabelsVisible)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
            edgeLabelsVisible ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Tag className="h-4 w-4" />
          Edges: {edgeLabelsVisible ? 'On' : 'Off'}
        </button>
        <button
          onClick={() => setNodeDraggingLocked(!nodeDraggingLocked)}
          className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
            nodeDraggingLocked ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Expand className="h-4 w-4" />
          {nodeDraggingLocked ? 'Locked' : 'Draggable'}
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const graphRef = useRef(null);
  const mainTouchRef = useRef(null);
  const modalTouchRef = useRef(null);

  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [entities, setEntities] = useState([]);
  const [stats, setStats] = useState({ total_nodes: 0, total_edges: 0 });
  const [contradictions, setContradictions] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [isSearchDebouncing, setIsSearchDebouncing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);
  const [autocompleteIndex, setAutocompleteIndex] = useState(-1);
  const [searchHistory, setSearchHistory] = useState([]);
  const [showAdvancedSearch, setShowAdvancedSearch] = useState(false);
  const [savedSearches, setSavedSearches] = useState([]);
  const [advancedFilters, setAdvancedFilters] = useState({
    relationshipType: '',
    connectedTo: '',
    dateFrom: '',
    dateTo: '',
  });
  const [advancedDraft, setAdvancedDraft] = useState({
    relationshipType: '',
    connectedTo: '',
    dateFrom: '',
    dateTo: '',
  });

  const [highlightedNodeIds, setHighlightedNodeIds] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedRelationship, setSelectedRelationship] = useState(null);

  const [toasts, setToasts] = useState([]);

  // === NEW: Advanced Graph Interactions ===
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);
  const [focusMode, setFocusMode] = useState(false);
  const [secondDegreeNodes, setSecondDegreeNodes] = useState(new Set());
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [showNodeTooltip, setShowNodeTooltip] = useState(false);
  const [showEdgeTooltip, setShowEdgeTooltip] = useState(false);
  
  // Graph control states
  const [physicsEnabled, setPhysicsEnabled] = useState(true);
  const [labelsAlwaysVisible, setLabelsAlwaysVisible] = useState(false);
  const [edgeLabelsVisible, setEdgeLabelsVisible] = useState(false);
  const [nodeDraggingLocked, setNodeDraggingLocked] = useState(false);

  // === NEW: Task 2 - Micro-Animations & Polish ===
  const [pageLoadComplete, setPageLoadComplete] = useState(false);
  const [displayedStats, setDisplayedStats] = useState({ total_nodes: 0, total_edges: 0, contradictions: 0, avgConnections: 0 });
  const [statsPulse, setStatsPulse] = useState({});
  const filterButtonRef = useRef(null);

  // === NEW: Task 3 - Enhanced Data Visualizations ===
  const [pieActiveIndex, setPieActiveIndex] = useState(-1);
  const [hiddenEntityTypes, setHiddenEntityTypes] = useState(new Set());
  const [selectedRelationshipType, setSelectedRelationshipType] = useState('');
  const [heatmapSelection, setHeatmapSelection] = useState(null);
  const [graphViewBounds, setGraphViewBounds] = useState({ minX: -Infinity, maxX: Infinity, minY: -Infinity, maxY: Infinity });
  const [graphZoomLevel, setGraphZoomLevel] = useState(1);
  const [isMobileView, setIsMobileView] = useState(false);
  const [mobileTab, setMobileTab] = useState('graph');
  const [showMobileControls, setShowMobileControls] = useState(false);

  // === NEW: Task 8 - Advanced Features ===
  const [timeTravelChunk, setTimeTravelChunk] = useState(40);
  const [isPlaybackRunning, setIsPlaybackRunning] = useState(false);
  const [comparisonSelection, setComparisonSelection] = useState({ a: '', b: '' });
  const [selectedContradictionPath, setSelectedContradictionPath] = useState({ aId: '', bId: '' });
  const [pathAnimationStep, setPathAnimationStep] = useState(0);
  const [highlightedPathNodeIds, setHighlightedPathNodeIds] = useState([]);
  const [nodeNotes, setNodeNotes] = useState({});
  const [savedViews, setSavedViews] = useState([]);

  const pushToast = (type, message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  };

  useEffect(() => {
    const saved = localStorage.getItem('lexgraph-theme');
    setTheme(saved || 'light');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('lexgraph-theme', theme);
  }, [theme]);

  useEffect(() => {
    const updateViewportMode = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    updateViewportMode();
    window.addEventListener('resize', updateViewportMode);
    return () => window.removeEventListener('resize', updateViewportMode);
  }, []);

  useEffect(() => {
    if (!isMobileView) {
      setShowMobileControls(false);
    }
  }, [isMobileView]);

  useEffect(() => {
    setIsSearchDebouncing(true);
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
      setIsSearchDebouncing(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    try {
      const rawHistory = localStorage.getItem('lexgraph-search-history');
      const parsedHistory = rawHistory ? JSON.parse(rawHistory) : [];
      if (Array.isArray(parsedHistory)) {
        setSearchHistory(parsedHistory.slice(0, 5));
      }
      const rawSaved = localStorage.getItem('lexgraph-saved-searches');
      const parsedSaved = rawSaved ? JSON.parse(rawSaved) : [];
      if (Array.isArray(parsedSaved)) {
        setSavedSearches(parsedSaved.slice(0, 8));
      }
    } catch {
      setSearchHistory([]);
      setSavedSearches([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lexgraph-search-history', JSON.stringify(searchHistory.slice(0, 5)));
  }, [searchHistory]);

  useEffect(() => {
    localStorage.setItem('lexgraph-saved-searches', JSON.stringify(savedSearches.slice(0, 8)));
  }, [savedSearches]);

  useEffect(() => {
    try {
      const rawNotes = localStorage.getItem('lexgraph-node-notes');
      const parsedNotes = rawNotes ? JSON.parse(rawNotes) : {};
      if (parsedNotes && typeof parsedNotes === 'object') {
        setNodeNotes(parsedNotes);
      }
      const rawViews = localStorage.getItem('lexgraph-saved-views');
      const parsedViews = rawViews ? JSON.parse(rawViews) : [];
      if (Array.isArray(parsedViews)) {
        setSavedViews(parsedViews.slice(0, 8));
      }
    } catch {
      setNodeNotes({});
      setSavedViews([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('lexgraph-node-notes', JSON.stringify(nodeNotes));
  }, [nodeNotes]);

  useEffect(() => {
    localStorage.setItem('lexgraph-saved-views', JSON.stringify(savedViews.slice(0, 8)));
  }, [savedViews]);

  const fetchJson = async (path, options) => {
    const response = await fetch(`${API_BASE}${path}`, options);
    if (!response.ok) {
      throw new Error(`${path} failed with status ${response.status}`);
    }
    return response.json();
  };

  const fetchGraphData = async () => {
    try {
      return await fetchJson('/graph/view');
    } catch {
      return fetchJson('/graph/view', { method: 'POST' });
    }
  };

  const loadDashboard = async () => {
    setLoading(true);
    setError('');

    try {
      const [statsRes, entitiesRes, graphRes, contradictionsRes] = await Promise.all([
        fetchJson('/stats'),
        fetchJson('/entities'),
        fetchGraphData(),
        fetchJson('/contradictions'),
      ]);

      const incomingNodes = (graphRes?.nodes ?? []).map(normalizeNode);
      const incomingLinks = (graphRes?.links ?? [])
        .map(normalizeLink)
        .filter((l) => l.source && l.target);

      const normalizedEntities = Array.isArray(entitiesRes)
        ? entitiesRes.map(normalizeNode)
        : Array.isArray(entitiesRes?.entities)
          ? entitiesRes.entities.map(normalizeNode)
          : [];

      setStats({
        total_nodes: Number(statsRes?.total_nodes ?? statsRes?.total_entities ?? incomingNodes.length ?? 0),
        total_edges: Number(statsRes?.total_edges ?? statsRes?.total_relationships ?? incomingLinks.length ?? 0),
      });
      setNodes(incomingNodes);
      setLinks(incomingLinks);
      setEntities(normalizedEntities.length ? normalizedEntities : incomingNodes);
      setContradictions(Array.isArray(contradictionsRes) ? contradictionsRes : []);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to load data';
      setError(msg);
      pushToast('error', msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, []);

  // === NEW: 2B - Animate stat numbers counting up ===
  useEffect(() => {
    if (!pageLoadComplete && !loading) {
      setPageLoadComplete(true);
    }

    const avgConn = stats.total_nodes ? Math.round((stats.total_edges * 2) / stats.total_nodes) : 0;
    
    // Animate numbers independently with count-up effect
    const startTime = Date.now();
    const duration = 1000; // 1 second count-up
    const targets = {
      total_nodes: stats.total_nodes,
      total_edges: stats.total_edges,
      contradictions: contradictions.length,
      avgConnections: avgConn,
    };

    const animateNumbers = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      setDisplayedStats({
        total_nodes: Math.floor(targets.total_nodes * progress),
        total_edges: Math.floor(targets.total_edges * progress),
        contradictions: Math.floor(targets.contradictions * progress),
        avgConnections: Math.floor(targets.avgConnections * progress),
      });

      if (progress < 1) {
        requestAnimationFrame(animateNumbers);
      } else {
        setDisplayedStats(targets);
      }
    };

    animateNumbers();
  }, [stats, contradictions, loading]);

  const nodeMap = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const linksWithMetadata = useMemo(
    () =>
      links.map((link) => ({
        ...link,
        sourceId: getLinkNodeId(link.source),
        targetId: getLinkNodeId(link.target),
      })),
    [links]
  );

  const degreeMap = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(n.id, 0));
    linksWithMetadata.forEach((l) => {
      map.set(l.sourceId, (map.get(l.sourceId) ?? 0) + 1);
      map.set(l.targetId, (map.get(l.targetId) ?? 0) + 1);
    });
    return map;
  }, [nodes, linksWithMetadata]);

  const baseFilteredNodes = useMemo(() => {
    const fromTs = advancedFilters.dateFrom ? Date.parse(advancedFilters.dateFrom) : Number.NaN;
    const toTs = advancedFilters.dateTo ? Date.parse(advancedFilters.dateTo) : Number.NaN;
    return nodes.filter((n) => {
      const matchesFilter = activeFilter === 'All' || n.type === activeFilter;
      const q = debouncedSearchQuery.toLowerCase();
      const matchesSearch = n.name.toLowerCase().includes(q) || n.description.toLowerCase().includes(q);
      const visibleInLegend = !hiddenEntityTypes.has(n.type);
      const chunkIndex = extractChunkIndex(n);
      const matchesChunk = chunkIndex <= timeTravelChunk;
      let matchesDateRange = true;
      if (!Number.isNaN(fromTs) || !Number.isNaN(toTs)) {
        const ts = extractEntityTimestamp(n);
        matchesDateRange = !Number.isNaN(ts);
        if (matchesDateRange && !Number.isNaN(fromTs)) {
          matchesDateRange = ts >= fromTs;
        }
        if (matchesDateRange && !Number.isNaN(toTs)) {
          matchesDateRange = ts <= toTs;
        }
      }
      return matchesFilter && matchesSearch && visibleInLegend && matchesDateRange && matchesChunk;
    });
  }, [nodes, activeFilter, debouncedSearchQuery, hiddenEntityTypes, advancedFilters.dateFrom, advancedFilters.dateTo, timeTravelChunk]);

  const baseFilteredNodeIds = useMemo(() => new Set(baseFilteredNodes.map((n) => n.id)), [baseFilteredNodes]);

  const filteredLinks = useMemo(() => {
    const hasConnectedTo = advancedFilters.connectedTo.trim().length > 0;
    const connectedSeed = new Set(
      nodes
        .filter((n) => n.name.toLowerCase().includes(advancedFilters.connectedTo.trim().toLowerCase()))
        .map((n) => n.id)
    );

    return linksWithMetadata.filter((l) => {
      if (!baseFilteredNodeIds.has(l.sourceId) || !baseFilteredNodeIds.has(l.targetId)) {
        return false;
      }

      const chartRel = selectedRelationshipType;
      const advancedRel = advancedFilters.relationshipType;
      if (chartRel && advancedRel && chartRel !== advancedRel) {
        return false;
      }
      const effectiveRelationship = chartRel || advancedRel;
      if (effectiveRelationship && l.type !== effectiveRelationship) {
        return false;
      }

      if (hasConnectedTo) {
        const touchesSeed = connectedSeed.has(l.sourceId) || connectedSeed.has(l.targetId);
        if (!touchesSeed) {
          return false;
        }
      }

      if (heatmapSelection) {
        const sourceType = nodeMap.get(l.sourceId)?.type;
        const targetType = nodeMap.get(l.targetId)?.type;
        const sameDirection = sourceType === heatmapSelection.sourceType && targetType === heatmapSelection.targetType;
        const reverseDirection = sourceType === heatmapSelection.targetType && targetType === heatmapSelection.sourceType;
        if (!sameDirection && !reverseDirection) {
          return false;
        }
      }

      return true;
    });
  }, [
    linksWithMetadata,
    baseFilteredNodeIds,
    selectedRelationshipType,
    heatmapSelection,
    nodeMap,
    advancedFilters.relationshipType,
    advancedFilters.connectedTo,
    nodes,
  ]);

  const filteredNodes = useMemo(() => {
    const hasLinkDrivenFilter = Boolean(
      selectedRelationshipType ||
      heatmapSelection ||
      advancedFilters.relationshipType ||
      advancedFilters.connectedTo.trim()
    );
    if (!hasLinkDrivenFilter) {
      return baseFilteredNodes;
    }

    const ids = new Set();
    filteredLinks.forEach((l) => {
      ids.add(l.sourceId);
      ids.add(l.targetId);
    });
    return baseFilteredNodes.filter((n) => ids.has(n.id));
  }, [
    baseFilteredNodes,
    filteredLinks,
    selectedRelationshipType,
    heatmapSelection,
    advancedFilters.relationshipType,
    advancedFilters.connectedTo,
  ]);

  const graphData = useMemo(() => ({ nodes: filteredNodes, links: filteredLinks }), [filteredNodes, filteredLinks]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) {
      return [];
    }
    return nodes
      .map((n) => {
        const inName = n.name.toLowerCase().indexOf(q);
        const inDesc = n.description.toLowerCase().indexOf(q);
        let score = Number.POSITIVE_INFINITY;
        if (inName >= 0) {
          score = inName;
        } else if (inDesc >= 0) {
          score = 100 + inDesc;
        }
        return { ...n, _score: score };
      })
      .filter((n) => Number.isFinite(n._score))
      .sort((a, b) => a._score - b._score)
      .slice(0, 5);
  }, [searchQuery, nodes]);

  useEffect(() => {
    if (!showSearchDropdown) {
      return;
    }
    if (searchResults.length === 0) {
      setAutocompleteIndex(-1);
      return;
    }
    if (autocompleteIndex >= searchResults.length) {
      setAutocompleteIndex(searchResults.length - 1);
    }
  }, [showSearchDropdown, searchResults, autocompleteIndex]);

  const entityDistribution = useMemo(() => {
    const counts = new Map();
    entities.forEach((e) => counts.set(e.type, (counts.get(e.type) ?? 0) + 1));
    return Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
  }, [entities]);

  const relationshipDistribution = useMemo(() => {
    const counts = new Map();
    linksWithMetadata.forEach((l) => counts.set(l.type, (counts.get(l.type) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }, [linksWithMetadata]);

  const pieDistribution = useMemo(() => {
    return entityDistribution.filter((entry) => !hiddenEntityTypes.has(entry.name));
  }, [entityDistribution, hiddenEntityTypes]);

  const drilldownEntities = useMemo(() => {
    if (!selectedRelationshipType) {
      return [];
    }
    const ids = new Set();
    linksWithMetadata
      .filter((l) => l.type === selectedRelationshipType)
      .forEach((l) => {
        ids.add(l.sourceId);
        ids.add(l.targetId);
      });
    return Array.from(ids)
      .map((id) => nodeMap.get(id))
      .filter(Boolean)
      .slice(0, 24);
  }, [selectedRelationshipType, linksWithMetadata, nodeMap]);

  const timelineData = useMemo(() => {
    const parseDateValue = (text) => {
      const direct = Date.parse(text);
      if (!Number.isNaN(direct)) {
        return direct;
      }
      const yearMatch = String(text).match(/\b(19|20)\d{2}\b/);
      if (yearMatch) {
        return Date.parse(`${yearMatch[0]}-01-01`);
      }
      return Number.NaN;
    };

    return entities
      .filter((e) => e.type === 'Date')
      .map((e) => {
        const sourceText = `${e.name} ${e.description}`.trim();
        const value = parseDateValue(sourceText);
        return {
          id: e.id,
          name: e.name,
          ts: value,
          display: Number.isNaN(value) ? 'Unknown' : new Date(value).toISOString().slice(0, 10),
        };
      })
      .filter((d) => !Number.isNaN(d.ts))
      .sort((a, b) => a.ts - b.ts);
  }, [entities]);

  const topConnectedEntities = useMemo(() => {
    return nodes
      .map((n) => ({ name: n.name, connections: degreeMap.get(n.id) ?? 0, id: n.id, type: n.type }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 8);
  }, [nodes, degreeMap]);

  const heatmapData = useMemo(() => {
    const types = [...new Set(nodes.map((n) => n.type))].sort();
    const map = new Map();

    linksWithMetadata.forEach((l) => {
      const sourceType = nodeMap.get(l.sourceId)?.type || 'Unknown';
      const targetType = nodeMap.get(l.targetId)?.type || 'Unknown';
      const key = `${sourceType}::${targetType}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    });

    const max = Math.max(1, ...Array.from(map.values()));
    return { types, map, max };
  }, [nodes, linksWithMetadata, nodeMap]);

  const maxChunkIndex = useMemo(() => {
    const maxDetected = Math.max(1, ...nodes.map((n) => extractChunkIndex(n)));
    return Math.max(40, maxDetected);
  }, [nodes]);

  useEffect(() => {
    setTimeTravelChunk((prev) => Math.min(prev, maxChunkIndex));
  }, [maxChunkIndex]);

  useEffect(() => {
    if (!isPlaybackRunning) {
      return;
    }
    const timer = setInterval(() => {
      setTimeTravelChunk((prev) => {
        if (prev >= maxChunkIndex) {
          setIsPlaybackRunning(false);
          return maxChunkIndex;
        }
        return prev + 1;
      });
    }, 380);
    return () => clearInterval(timer);
  }, [isPlaybackRunning, maxChunkIndex]);

  const comparisonData = useMemo(() => {
    const a = nodeMap.get(comparisonSelection.a);
    const b = nodeMap.get(comparisonSelection.b);
    if (!a || !b) {
      return null;
    }

    const neighborsFor = (id) => {
      const rels = [];
      const names = new Set();
      linksWithMetadata.forEach((l) => {
        if (l.sourceId === id) {
          names.add(nodeMap.get(l.targetId)?.name || l.targetId);
          rels.push(`${l.type}->${l.targetId}`);
        } else if (l.targetId === id) {
          names.add(nodeMap.get(l.sourceId)?.name || l.sourceId);
          rels.push(`${l.type}->${l.sourceId}`);
        }
      });
      return { names, rels: new Set(rels) };
    };

    const aN = neighborsFor(a.id);
    const bN = neighborsFor(b.id);
    const uniqueA = [...aN.names].filter((name) => !bN.names.has(name));
    const uniqueB = [...bN.names].filter((name) => !aN.names.has(name));
    return { a, b, uniqueA, uniqueB, sharedCount: [...aN.names].filter((name) => bN.names.has(name)).length };
  }, [comparisonSelection, linksWithMetadata, nodeMap]);

  const contradictionPath = useMemo(() => {
    if (!selectedContradictionPath?.aId || !selectedContradictionPath?.bId) {
      return [];
    }

    const start = selectedContradictionPath.aId;
    const goal = selectedContradictionPath.bId;
    const queue = [[start]];
    const visited = new Set([start]);
    const adjacency = new Map();

    linksWithMetadata.forEach((l) => {
      if (!adjacency.has(l.sourceId)) adjacency.set(l.sourceId, []);
      if (!adjacency.has(l.targetId)) adjacency.set(l.targetId, []);
      adjacency.get(l.sourceId).push({ next: l.targetId, link: l });
      adjacency.get(l.targetId).push({ next: l.sourceId, link: l });
    });

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];
      if (current === goal) {
        return path;
      }
      const nexts = adjacency.get(current) || [];
      nexts.forEach(({ next }) => {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      });
    }
    return [];
  }, [selectedContradictionPath, linksWithMetadata]);

  useEffect(() => {
    if (contradictionPath.length === 0) {
      setHighlightedPathNodeIds([]);
      setPathAnimationStep(0);
      return;
    }
    const timer = setInterval(() => {
      setPathAnimationStep((prev) => {
        const next = prev + 1;
        const capped = Math.min(next, contradictionPath.length);
        setHighlightedPathNodeIds(contradictionPath.slice(0, capped));
        if (capped >= contradictionPath.length) {
          clearInterval(timer);
        }
        return capped;
      });
    }, 500);
    return () => clearInterval(timer);
  }, [contradictionPath]);

  const smartSuggestions = useMemo(() => {
    if (nodes.length === 0) {
      return [];
    }
    const entries = nodes.map((n) => ({ node: n, degree: degreeMap.get(n.id) ?? 0 }));
    const isolated = entries.reduce((min, cur) => (cur.degree < min.degree ? cur : min), entries[0]);
    const avg = entries.reduce((sum, e) => sum + e.degree, 0) / Math.max(1, entries.length);
    const unusual = entries.filter((e) => e.degree >= avg * 2.5).slice(0, 3);
    const possibleMissing = linksWithMetadata.length > 0
      ? nodes
          .filter((n) => (degreeMap.get(n.id) ?? 0) === 1)
          .slice(0, 3)
      : [];

    return [
      `Most isolated entity: ${isolated.node.name} (${isolated.degree} links)`,
      possibleMissing.length
        ? `Possible missing relationships near: ${possibleMissing.map((n) => n.name).join(', ')}`
        : 'Possible missing relationships: insufficient signal yet',
      unusual.length
        ? `Unusual connection patterns: ${unusual.map((e) => `${e.node.name} (${e.degree})`).join(', ')}`
        : 'No unusual connection patterns detected yet',
    ];
  }, [nodes, degreeMap, linksWithMetadata]);

  const selectableNodesForControls = useMemo(() => {
    return [...filteredNodes]
      .sort((a, b) => (degreeMap.get(b.id) ?? 0) - (degreeMap.get(a.id) ?? 0))
      .slice(0, 180);
  }, [filteredNodes, degreeMap]);

  const selectedEntityConnections = useMemo(() => {
    if (!selectedEntity) {
      return [];
    }
    return linksWithMetadata
      .filter((l) => l.sourceId === selectedEntity.id || l.targetId === selectedEntity.id)
      .map((l) => {
        const otherId = l.sourceId === selectedEntity.id ? l.targetId : l.sourceId;
        return { ...l, other: nodeMap.get(otherId) };
      });
  }, [selectedEntity, linksWithMetadata, nodeMap]);

  const selectedEntityMetadata = useMemo(() => {
    if (!selectedEntity) {
      return [];
    }
    const ignored = new Set(['id', 'key', 'name', 'type', 'description', 'x', 'y', 'vx', 'vy', 'index']);
    return Object.entries(selectedEntity)
      .filter(([key, value]) => !ignored.has(key) && value !== null && value !== undefined && value !== '')
      .map(([key, value]) => ({
        key,
        value: typeof value === 'object' ? JSON.stringify(value) : String(value),
      }));
  }, [selectedEntity]);

  const groupedSelectedEntityConnections = useMemo(() => {
    const map = new Map();
    selectedEntityConnections.forEach((conn) => {
      if (!conn.other) {
        return;
      }
      const key = conn.type || 'RELATED_TO';
      if (!map.has(key)) {
        map.set(key, []);
      }
      map.get(key).push(conn);
    });
    return Array.from(map.entries())
      .map(([relation, items]) => ({ relation, items }))
      .sort((a, b) => b.items.length - a.items.length);
  }, [selectedEntityConnections]);

  const selectedEntityMiniGraph = useMemo(() => {
    if (!selectedEntity) {
      return { nodes: [], links: [] };
    }
    const centerNode = { ...selectedEntity, id: selectedEntity.id, isCenter: true };
    const miniNodes = [centerNode];
    const seen = new Set([selectedEntity.id]);
    const miniLinks = [];

    selectedEntityConnections.forEach((conn) => {
      if (!conn.other || seen.has(conn.other.id)) {
        return;
      }
      seen.add(conn.other.id);
      miniNodes.push({ ...conn.other, isCenter: false });
      miniLinks.push({
        id: conn.id,
        source: selectedEntity.id,
        target: conn.other.id,
        type: conn.type,
      });
    });

    return { nodes: miniNodes, links: miniLinks };
  }, [selectedEntity, selectedEntityConnections]);

  const selectedRelationNodes = useMemo(() => {
    if (!selectedRelationship) {
      return { source: null, target: null };
    }
    const source = nodeMap.get(selectedRelationship.sourceId ?? getLinkNodeId(selectedRelationship.source));
    const target = nodeMap.get(selectedRelationship.targetId ?? getLinkNodeId(selectedRelationship.target));
    return { source, target };
  }, [selectedRelationship, nodeMap]);

  const updateGraphBounds = useCallback(() => {
    const graph = graphRef.current;
    if (!graph || !graph.screen2GraphCoords) {
      return;
    }
    const width = graph.width?.() ?? 1200;
    const height = graph.height?.() ?? 520;
    const topLeft = graph.screen2GraphCoords(0, 0);
    const bottomRight = graph.screen2GraphCoords(width, height);
    if (!topLeft || !bottomRight) {
      return;
    }
    const marginX = Math.abs(bottomRight.x - topLeft.x) * 0.25;
    const marginY = Math.abs(bottomRight.y - topLeft.y) * 0.25;
    setGraphViewBounds({
      minX: Math.min(topLeft.x, bottomRight.x) - marginX,
      maxX: Math.max(topLeft.x, bottomRight.x) + marginX,
      minY: Math.min(topLeft.y, bottomRight.y) - marginY,
      maxY: Math.max(topLeft.y, bottomRight.y) + marginY,
    });
  }, []);

  const isNodeVisible = useCallback(
    (node) => {
      if (filteredNodes.length < 450) {
        return true;
      }
      if (!Number.isFinite(node?.x) || !Number.isFinite(node?.y)) {
        return true;
      }
      return (
        node.x >= graphViewBounds.minX &&
        node.x <= graphViewBounds.maxX &&
        node.y >= graphViewBounds.minY &&
        node.y <= graphViewBounds.maxY
      );
    },
    [filteredNodes.length, graphViewBounds]
  );

  const isLinkVisible = useCallback(
    (link) => {
      if (filteredLinks.length < 700) {
        return true;
      }
      const s = typeof link.source === 'object' ? link.source : nodeMap.get(getLinkNodeId(link.source));
      const t = typeof link.target === 'object' ? link.target : nodeMap.get(getLinkNodeId(link.target));
      if (!s || !t) {
        return false;
      }
      return isNodeVisible(s) || isNodeVisible(t);
    },
    [filteredLinks.length, nodeMap, isNodeVisible]
  );

  const highlightNodeInGraph = (nodeId) => {
    const target = nodes.find((n) => n.id === nodeId);
    if (!target) {
      return;
    }
    setHighlightedNodeIds([nodeId]);
    setSelectedRelationship(null);
    setSelectedEntity(target);
    if (graphRef.current) {
      graphRef.current.centerAt(target.x || 0, target.y || 0, 700);
      graphRef.current.zoom(2.25, 700);
    }
  };

  const onNodeClick = (node) => {
    if (!node?.id) {
      return;
    }
    
    // === 1B: Click-to-Focus Mode ===
    if (focusMode) {
      // In focus mode, show 2nd-degree connections
      const secondDegree = getSecondDegreeConnections(node.id, linksWithMetadata);
      setSecondDegreeNodes(secondDegree);
    }
    
    setHighlightedNodeIds([node.id]);
    setSelectedRelationship(null);
    setSelectedEntity(nodeMap.get(node.id) ?? node);
  };

  const onLinkClick = (link) => {
    const sourceId = getLinkNodeId(link.source);
    const targetId = getLinkNodeId(link.target);
    setSelectedRelationship({ ...link, sourceId, targetId });
    setSelectedEntity(null);
    setHighlightedNodeIds([sourceId, targetId]);
  };

  const onPieSliceClick = (entry) => {
    if (!entry?.name) {
      return;
    }
    setActiveFilter(entry.name);
    setSelectedRelationshipType('');
    setHeatmapSelection(null);
    pushToast('success', `Filtered graph to ${entry.name}`);
  };

  const togglePieLegendType = (type) => {
    setHiddenEntityTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const onRelationshipBarClick = (data) => {
    const relationshipType = data?.type || data?.payload?.type;
    if (!relationshipType) {
      return;
    }
    setSelectedRelationshipType((prev) => (prev === relationshipType ? '' : relationshipType));
    setHeatmapSelection(null);
  };

  const onHeatmapCellClick = (sourceType, targetType) => {
    const next = { sourceType, targetType };
    const sameSelection =
      heatmapSelection?.sourceType === sourceType && heatmapSelection?.targetType === targetType;
    setHeatmapSelection(sameSelection ? null : next);
    if (!sameSelection) {
      setSelectedRelationshipType('');
      pushToast('success', `Showing ${sourceType} ↔ ${targetType} connections`);
    }
  };

  const mobileTabs = ['graph', 'stats', 'export', 'search'];

  const handleMainTouchStart = (event) => {
    if (!isMobileView || !event.touches?.[0]) {
      return;
    }
    const t = event.touches[0];
    mainTouchRef.current = { x: t.clientX, y: t.clientY };
  };

  const handleMainTouchEnd = (event) => {
    if (!isMobileView || !mainTouchRef.current || !event.changedTouches?.[0]) {
      return;
    }
    const t = event.changedTouches[0];
    const dx = t.clientX - mainTouchRef.current.x;
    const dy = t.clientY - mainTouchRef.current.y;
    mainTouchRef.current = null;
    if (Math.abs(dx) < 70 || Math.abs(dy) > 50) {
      return;
    }
    const index = mobileTabs.indexOf(mobileTab);
    if (index === -1) {
      return;
    }
    if (dx < 0 && index < mobileTabs.length - 1) {
      setMobileTab(mobileTabs[index + 1]);
    }
    if (dx > 0 && index > 0) {
      setMobileTab(mobileTabs[index - 1]);
    }
  };

  const handleModalTouchStart = (event) => {
    if (!event.touches?.[0]) {
      return;
    }
    modalTouchRef.current = { y: event.touches[0].clientY };
  };

  const handleModalTouchEnd = (event) => {
    if (!modalTouchRef.current || !event.changedTouches?.[0]) {
      return;
    }
    const dy = event.changedTouches[0].clientY - modalTouchRef.current.y;
    modalTouchRef.current = null;
    if (dy > 90) {
      setSelectedEntity(null);
    }
  };

  const addSearchHistory = (text) => {
    const value = String(text || '').trim();
    if (!value) {
      return;
    }
    setSearchHistory((prev) => [value, ...prev.filter((item) => item !== value)].slice(0, 5));
  };

  const selectSearchEntity = (entity) => {
    if (!entity?.id) {
      return;
    }
    setSearchQuery(entity.name);
    setShowSearchDropdown(false);
    setAutocompleteIndex(-1);
    addSearchHistory(entity.name);
    highlightNodeInGraph(entity.id);
  };

  const runSearchText = (text) => {
    const value = String(text || '').trim();
    if (!value) {
      return;
    }
    setSearchQuery(value);
    setShowSearchDropdown(false);
    setAutocompleteIndex(-1);
    addSearchHistory(value);
  };

  const onSearchKeyDown = (event) => {
    if (!showSearchDropdown) {
      if (event.key === 'ArrowDown' && searchResults.length > 0) {
        setShowSearchDropdown(true);
        setAutocompleteIndex(0);
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setAutocompleteIndex((prev) => {
        const max = searchResults.length - 1;
        if (max < 0) return -1;
        return prev >= max ? 0 : prev + 1;
      });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setAutocompleteIndex((prev) => {
        const max = searchResults.length - 1;
        if (max < 0) return -1;
        return prev <= 0 ? max : prev - 1;
      });
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (autocompleteIndex >= 0 && searchResults[autocompleteIndex]) {
        selectSearchEntity(searchResults[autocompleteIndex]);
      } else if (searchResults[0]) {
        selectSearchEntity(searchResults[0]);
      } else if (searchQuery.trim()) {
        runSearchText(searchQuery);
      }
      return;
    }

    if (event.key === 'Escape') {
      setShowSearchDropdown(false);
      setAutocompleteIndex(-1);
    }
  };

  const openAdvancedSearch = () => {
    setAdvancedDraft(advancedFilters);
    setShowAdvancedSearch(true);
  };

  const applyAdvancedSearch = () => {
    setAdvancedFilters(advancedDraft);
    setSelectedRelationshipType(advancedDraft.relationshipType || '');
    setShowAdvancedSearch(false);
    pushToast('success', 'Advanced filters applied');
  };

  const saveAdvancedSearch = () => {
    const payload = {
      id: `${Date.now()}`,
      criteria: { ...advancedDraft },
      label: [advancedDraft.relationshipType, advancedDraft.connectedTo, advancedDraft.dateFrom, advancedDraft.dateTo]
        .filter(Boolean)
        .join(' | ') || 'Saved search',
    };
    setSavedSearches((prev) => [payload, ...prev].slice(0, 8));
    pushToast('success', 'Search query saved');
  };

  const clearAllFilters = () => {
    setSearchQuery('');
    setActiveFilter('All');
    setSelectedRelationshipType('');
    setHeatmapSelection(null);
    setAdvancedFilters({ relationshipType: '', connectedTo: '', dateFrom: '', dateTo: '' });
    setHiddenEntityTypes(new Set());
  };

  // === NEW: Node Hover Handler (1A) ===
  const onNodeHover = (node) => {
    setHoveredNode(node);
    if (node) {
      setShowNodeTooltip(true);
    } else {
      setShowNodeTooltip(false);
    }
  };

  // === NEW: Link Hover Handler (1C) ===
  const onLinkHover = (link) => {
    setHoveredEdge(link);
    if (link) {
      setShowEdgeTooltip(true);
    } else {
      setShowEdgeTooltip(false);
    }
  };

  // === NEW: Track mouse position for tooltips ===
  const handleGraphMouseMove = (event) => {
    if (event && typeof event === 'object') {
      setMousePos({
        x: event.clientX || event.x || 0,
        y: event.clientY || event.y || 0,
      });
    }
  };

  // === NEW: 2D - Ripple effect on button click ===
  const createRipple = (event) => {
    if (!event.currentTarget) return;

    const button = event.currentTarget;
    const rect = button.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = event.clientX - rect.left - size / 2;
    const y = event.clientY - rect.top - size / 2;

    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;

    button.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
  };

  const downloadBlob = (filename, blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCsv = () => {
    const rows = [
      ['id', 'name', 'type', 'description', 'connections'].join(','),
      ...filteredNodes.map((n) => {
        const safe = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`;
        return [safe(n.id), safe(n.name), safe(n.type), safe(n.description ?? ''), safe(degreeMap.get(n.id) ?? 0)].join(',');
      }),
    ];
    downloadBlob('entities.csv', new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' }));
    pushToast('success', 'CSV exported');
  };

  const exportJson = () => {
    const payload = {
      generatedAt: new Date().toISOString(),
      filter: activeFilter,
      query: searchQuery,
      graph: graphData,
      entities: filteredNodes,
    };
    downloadBlob('entities.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    pushToast('success', 'JSON exported');
  };

  const exportGraphPng = () => {
    const canvas = graphRef.current?.canvas?.() || document.querySelector('canvas');
    if (!canvas) {
      pushToast('error', 'Graph canvas not available');
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        pushToast('error', 'Could not generate PNG');
        return;
      }
      downloadBlob('graph.png', blob);
      pushToast('success', 'Graph PNG exported');
    });
  };

  const shareCurrentView = async () => {
    const params = new URLSearchParams();
    if (activeFilter !== 'All') {
      params.set('filter', activeFilter);
    }
    if (searchQuery) {
      params.set('q', searchQuery);
    }
    if (highlightedNodeIds[0]) {
      params.set('node', highlightedNodeIds[0]);
    }
    const url = `${window.location.origin}${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`;
    try {
      await navigator.clipboard.writeText(url);
      pushToast('success', 'Share link copied');
    } catch {
      pushToast('error', 'Clipboard permission denied');
    }
  };

  const saveCurrentView = () => {
    const payload = {
      id: `${Date.now()}`,
      label: `View ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
      data: {
        activeFilter,
        searchQuery,
        selectedRelationshipType,
        highlightedNodeId: highlightedNodeIds[0] || '',
        timeTravelChunk,
      },
    };
    setSavedViews((prev) => [payload, ...prev].slice(0, 10));
    pushToast('success', 'View saved');
  };

  const applySavedView = (view) => {
    const data = view?.data;
    if (!data) {
      return;
    }
    setActiveFilter(data.activeFilter || 'All');
    setSearchQuery(data.searchQuery || '');
    setSelectedRelationshipType(data.selectedRelationshipType || '');
    setTimeTravelChunk(data.timeTravelChunk || 1);
    if (data.highlightedNodeId) {
      highlightNodeInGraph(data.highlightedNodeId);
    }
    pushToast('success', 'View applied');
  };

  const deleteSavedView = (id) => {
    setSavedViews((prev) => prev.filter((v) => v.id !== id));
  };

  const exportSelectedSubgraph = () => {
    const anchorId = highlightedNodeIds[0] || selectedEntity?.id;
    if (!anchorId) {
      pushToast('error', 'Select or highlight an entity first');
      return;
    }
    const nodeIds = new Set([anchorId]);
    const localLinks = linksWithMetadata.filter((l) => {
      if (l.sourceId === anchorId || l.targetId === anchorId) {
        nodeIds.add(l.sourceId);
        nodeIds.add(l.targetId);
        return true;
      }
      return false;
    });
    const localNodes = [...nodeIds].map((id) => nodeMap.get(id)).filter(Boolean);

    const payload = {
      exportedAt: new Date().toISOString(),
      anchor: anchorId,
      nodes: localNodes,
      links: localLinks,
    };
    downloadBlob('subgraph.json', new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    pushToast('success', 'Subgraph exported');
  };

  const updateNodeNote = (nodeId, note) => {
    setNodeNotes((prev) => ({ ...prev, [nodeId]: note }));
  };

  const statCards = [
    { label: 'Entities', value: displayedStats.total_nodes, icon: Users },
    { label: 'Relationships', value: displayedStats.total_edges, icon: Link2 },
    { label: 'Contradictions', value: displayedStats.contradictions, icon: AlertCircle },
    {
      label: 'Avg Connections',
      value: displayedStats.avgConnections,
      icon: BarChart3,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none absolute -left-28 top-20 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl dark:bg-cyan-700/20" />
      <div className="pointer-events-none absolute -right-32 top-44 h-80 w-80 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/10" />

      <header className={`relative border-b border-white/60 bg-gradient-to-r from-cyan-700 via-teal-700 to-sky-700 text-white shadow-lg dark:border-slate-800 ${
        pageLoadComplete ? 'animate-header-enter' : ''
      }`}>
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-7 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="mb-1 inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]">
                <Sparkles className="h-3.5 w-3.5" />
                Knowledge Intelligence
              </p>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">LexGraph Nexus</h1>
              <p className="mt-1 text-sm text-cyan-100/90">Legal contradiction mapping with interactive graph analytics</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
                className="rounded-xl border border-white/35 bg-white/10 p-2 transition hover:bg-white/20"
                title="Toggle dark mode"
              >
                {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button
                onClick={loadDashboard}
                className="inline-flex items-center gap-2 rounded-xl border border-white/35 bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {loading && nodes.length === 0
              ? [...Array(4)].map((_, i) => <SkeletonStatCard key={i} />)
              : statCards.map((card, idx) => (
                  <MemoStatCard
                    key={card.label}
                    card={card}
                    idx={idx}
                    pageLoadComplete={pageLoadComplete}
                    loading={loading}
                    pulse={statsPulse[card.label]}
                  />
                ))}
          </div>
        </div>
      </header>

      <main
        className="relative mx-auto w-full max-w-7xl px-4 py-6 pb-24 sm:px-6 lg:px-8 md:pb-6"
        onTouchStart={handleMainTouchStart}
        onTouchEnd={handleMainTouchEnd}
      >
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 2xl:grid-cols-3">
          <GlassCard className={`p-4 md:col-span-2 2xl:col-span-2 ${pageLoadComplete ? 'animate-graph-enter' : ''} ${isMobileView && mobileTab !== 'graph' && mobileTab !== 'search' ? 'hidden' : ''}`}>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Interactive Graph Explorer</h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">Zoom, pan, select nodes, and inspect relationship edges.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={exportGraphPng}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  Graph PNG
                </button>
                <button
                  onClick={shareCurrentView}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <Share2 className="h-3.5 w-3.5" />
                  Share
                </button>
              </div>
            </div>

            <div className="mb-3 grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="relative md:col-span-2">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onFocus={() => setShowSearchDropdown(true)}
                  onBlur={() => setTimeout(() => setShowSearchDropdown(false), 120)}
                  onKeyDown={onSearchKeyDown}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setShowSearchDropdown(true);
                    setAutocompleteIndex(-1);
                  }}
                  placeholder="Search entities by name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2 text-sm outline-none ring-cyan-600 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                />
                <button
                  onClick={openAdvancedSearch}
                  className="absolute right-2 top-1.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  {isSearchDebouncing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  Advanced
                </button>
                {showSearchDropdown && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    {searchQuery.trim() ? (
                      searchResults.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-slate-500">No matches</p>
                      ) : (
                        searchResults.map((n, idx) => (
                          <button
                            key={n.id}
                            onMouseDown={() => selectSearchEntity(n)}
                            className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                              autocompleteIndex === idx ? 'bg-cyan-50 dark:bg-cyan-900/30' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span className="truncate">{renderHighlightedText(n.name, searchQuery)}</span>
                            <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-[10px] dark:bg-slate-700">{n.type}</span>
                          </button>
                        ))
                      )
                    ) : (
                      <div>
                        <div className="flex items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                          <span className="inline-flex items-center gap-1"><History className="h-3.5 w-3.5" /> Recent Searches</span>
                          {searchHistory.length > 0 && (
                            <button onMouseDown={() => setSearchHistory([])} className="text-rose-600 hover:underline dark:text-rose-300">
                              Clear
                            </button>
                          )}
                        </div>
                        {searchHistory.length === 0 ? (
                          <p className="px-3 pb-3 text-xs text-slate-500">No recent searches</p>
                        ) : (
                          searchHistory.map((item) => (
                            <button
                              key={item}
                              onMouseDown={() => runSearchText(item)}
                              className="block w-full px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                            >
                              {item}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {FILTERS.map((filter) => {
                  const active = activeFilter === filter.value;
                  return (
                    <button
                      key={filter.value}
                      onClick={(e) => {
                        createRipple(e);
                        setActiveFilter(filter.value);
                      }}
                      className={`ripple-effect inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? 'filter-button-active text-white'
                          : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'
                      }`}
                    >
                      <Filter className="h-3.5 w-3.5" />
                      {filter.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {(searchQuery ||
              activeFilter !== 'All' ||
              selectedRelationshipType ||
              advancedFilters.connectedTo ||
              advancedFilters.dateFrom ||
              advancedFilters.dateTo ||
              hiddenEntityTypes.size > 0 ||
              heatmapSelection) && (
              <div className="mb-3 rounded-xl border border-slate-200 bg-white/70 p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                <div className="mb-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
                  <span>Showing {filteredNodes.length} of {nodes.length} entities</span>
                  <button onClick={clearAllFilters} className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300">
                    Clear all
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="inline-flex items-center gap-1 rounded-full bg-cyan-100 px-2 py-1 text-[11px] font-semibold text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-200">
                      Query: {searchQuery}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {activeFilter !== 'All' && (
                    <button onClick={() => setActiveFilter('All')} className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
                      Type: {activeFilter}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {(selectedRelationshipType || advancedFilters.relationshipType) && (
                    <button onClick={() => { setSelectedRelationshipType(''); setAdvancedFilters((prev) => ({ ...prev, relationshipType: '' })); }} className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2 py-1 text-[11px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">
                      Relationship: {selectedRelationshipType || advancedFilters.relationshipType}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {advancedFilters.connectedTo && (
                    <button onClick={() => setAdvancedFilters((prev) => ({ ...prev, connectedTo: '' }))} className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
                      Connected to: {advancedFilters.connectedTo}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {(advancedFilters.dateFrom || advancedFilters.dateTo) && (
                    <button onClick={() => setAdvancedFilters((prev) => ({ ...prev, dateFrom: '', dateTo: '' }))} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200">
                      Date: {advancedFilters.dateFrom || 'Any'} to {advancedFilters.dateTo || 'Any'}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                  {heatmapSelection && (
                    <button onClick={() => setHeatmapSelection(null)} className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200">
                      Heatmap: {heatmapSelection.sourceType} ↔ {heatmapSelection.targetType}
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
              <div className="h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/60">
                {loading && nodes.length === 0 ? (
                  <SkeletonGraphArea />
                ) : graphData.nodes.length === 0 ? (
                  <EmptyBlock icon={Link2} title="No graph data available" subtitle="Try refreshing data or changing filters." />
                ) : (
                  <div onMouseMove={handleGraphMouseMove}>
                    <MemoForceGraph2D
                    ref={graphRef}
                    graphData={graphData}
                    nodeLabel={labelsAlwaysVisible || graphZoomLevel > 1.6 ? (node) => `${node.name} (${node.type})` : () => ''}
                    linkLabel={edgeLabelsVisible || (graphZoomLevel > 2.2 && filteredLinks.length < 600) ? (link) => `${link.type}${link.reason ? `: ${link.reason}` : ''}` : () => ''}
                    onNodeClick={onNodeClick}
                    onLinkClick={onLinkClick}
                    onNodeHover={onNodeHover}
                    onLinkHover={onLinkHover}
                    onZoomEnd={({ k }) => {
                      setGraphZoomLevel(k ?? 1);
                      updateGraphBounds();
                    }}
                    onEngineStop={updateGraphBounds}
                    onNodeDragEnd={updateGraphBounds}
                    nodeVisibility={isNodeVisible}
                    linkVisibility={isLinkVisible}
                    nodeColor={(node) => {
                      const isComparisonNode =
                        node.id && (node.id === comparisonSelection.a || node.id === comparisonSelection.b);
                      const isPathNode = highlightedPathNodeIds.includes(node.id);

                      if (isComparisonNode) {
                        return '#7c3aed';
                      }
                      if (isPathNode) {
                        return '#dc2626';
                      }

                      // === 1B: Click-to-Focus Mode - dim other nodes ===
                      if (focusMode && highlightedNodeIds.length > 0) {
                        if (highlightedNodeIds.includes(node.id)) {
                          return '#f59e0b'; // Selected node - bright amber
                        }
                        if (secondDegreeNodes.has(node.id)) {
                          return 'rgba(156, 163, 175, 0.6)'; // Second degree - semi-dim
                        }
                        // Check if it's a first-degree connection
                        const isFirstDegree = linksWithMetadata.some(
                          (l) =>
                            (l.sourceId === highlightedNodeIds[0] && l.targetId === node.id) ||
                            (l.targetId === highlightedNodeIds[0] && l.sourceId === node.id)
                        );
                        if (isFirstDegree) {
                          return ENTITY_COLORS[node.type] || ENTITY_COLORS.Unknown; // First degree - full opacity
                        }
                        return 'rgba(100, 116, 139, 0.3)'; // Others - very dim (30% opacity)
                      }

                      // Normal mode highlighting
                      if (highlightedNodeIds.includes(node.id)) {
                        return '#f59e0b';
                      }
                      return ENTITY_COLORS[node.type] || ENTITY_COLORS.Unknown;
                    }}
                    // === 1E: Enhanced Node Sizing by Importance ===
                    nodeVal={(node) => {
                      const degree = degreeMap.get(node.id) ?? 0;
                      const maxDegree = Math.max(...Array.from(degreeMap.values()));
                      // Size range: 5 to 15 based on degree proportion
                      const size = 5 + (degree / (maxDegree || 1)) * 10;
                      return size;
                    }}
                    nodeCanvasObject={(node, ctx) => {
                      // === 1B: Pulsing glow for selected node ===
                      if (highlightedNodeIds.includes(node.id) && focusMode) {
                        const pulse = Math.sin(Date.now() / 200) * 0.5 + 1.5;
                        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
                        ctx.beginPath();
                        ctx.arc(node.x, node.y, node.val * pulse, 0, 2 * Math.PI);
                        ctx.fill();
                      }
                      // Draw the node
                      ctx.fillStyle = node.color;
                      ctx.beginPath();
                      ctx.arc(node.x, node.y, node.val, 0, 2 * Math.PI);
                      ctx.fill();
                    }}
                    linkColor={(link) => {
                      const source = getLinkNodeId(link.source);
                      const target = getLinkNodeId(link.target);
                      const inPath = highlightedPathNodeIds.includes(source) && highlightedPathNodeIds.includes(target);
                      const inComparison =
                        (source === comparisonSelection.a || source === comparisonSelection.b) &&
                        (target === comparisonSelection.a || target === comparisonSelection.b);

                      if (inPath) {
                        return '#dc2626';
                      }
                      if (inComparison) {
                        return '#7c3aed';
                      }

                      if (focusMode && highlightedNodeIds.length > 0) {
                        const isHighlighted =
                          highlightedNodeIds.includes(source) || highlightedNodeIds.includes(target);
                        if (isHighlighted) {
                          return '#0d9488';
                        }
                        return 'rgba(148, 163, 184, 0.2)'; // Very dim in focus mode
                      }

                      return highlightedNodeIds.includes(source) || highlightedNodeIds.includes(target)
                        ? '#0d9488'
                        : '#94a3b8';
                    }}
                    linkWidth={(link) => {
                      const source = getLinkNodeId(link.source);
                      const target = getLinkNodeId(link.target);
                      if (highlightedPathNodeIds.includes(source) && highlightedPathNodeIds.includes(target)) {
                        return 3.2;
                      }
                      if (
                        (source === comparisonSelection.a || source === comparisonSelection.b) &&
                        (target === comparisonSelection.a || target === comparisonSelection.b)
                      ) {
                        return 2.8;
                      }
                      return highlightedNodeIds.includes(source) || highlightedNodeIds.includes(target) ? 2.4 : 1;
                    }}
                    linkDirectionalParticles={(link) => {
                      const source = getLinkNodeId(link.source);
                      const target = getLinkNodeId(link.target);
                      if (highlightedPathNodeIds.includes(source) && highlightedPathNodeIds.includes(target)) {
                        return 4;
                      }
                      return highlightedNodeIds.includes(source) || highlightedNodeIds.includes(target) ? 2 : 0;
                    }}
                    linkDirectionalParticleWidth={2}
                    cooldownTicks={physicsEnabled ? 100 : 0}
                    d3VelocityDecay={0.26}
                    dagMode={null}
                    enableNodeDrag={!nodeDraggingLocked}
                    />
                  </div>
                )}
              </div>

              <div className="hidden xl:block">
                <GraphControlsPanel
                  physicsEnabled={physicsEnabled}
                  setPhysicsEnabled={setPhysicsEnabled}
                  labelsAlwaysVisible={labelsAlwaysVisible}
                  setLabelsAlwaysVisible={setLabelsAlwaysVisible}
                  edgeLabelsVisible={edgeLabelsVisible}
                  setEdgeLabelsVisible={setEdgeLabelsVisible}
                  nodeDraggingLocked={nodeDraggingLocked}
                  setNodeDraggingLocked={setNodeDraggingLocked}
                  graphRef={graphRef}
                  className="h-[520px]"
                />
              </div>
            </div>

            {isMobileView && showMobileControls && (
              <div className="mt-3 xl:hidden">
                <GraphControlsPanel
                  physicsEnabled={physicsEnabled}
                  setPhysicsEnabled={setPhysicsEnabled}
                  labelsAlwaysVisible={labelsAlwaysVisible}
                  setLabelsAlwaysVisible={setLabelsAlwaysVisible}
                  edgeLabelsVisible={edgeLabelsVisible}
                  setEdgeLabelsVisible={setEdgeLabelsVisible}
                  nodeDraggingLocked={nodeDraggingLocked}
                  setNodeDraggingLocked={setNodeDraggingLocked}
                  graphRef={graphRef}
                  showCloseButton
                  onClose={() => setShowMobileControls(false)}
                />
              </div>
            )}
            <button
              onClick={() => setFocusMode(!focusMode)}
              title={focusMode ? 'Exit focus mode' : 'Enter focus mode - click nodes to explore'}
              className={`absolute bottom-4 right-4 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                focusMode
                  ? 'bg-cyan-700 text-white shadow-lg'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200'
              }`}
            >
              {focusMode ? '✓ Focus Mode' : 'Focus Mode'}
            </button>
          </GlassCard>

          <div className={`grid grid-cols-1 gap-5 sm:grid-cols-2 md:col-span-2 2xl:col-span-1 2xl:grid-cols-1 ${pageLoadComplete ? 'animate-sidebar-enter' : ''} ${isMobileView && mobileTab !== 'export' ? 'hidden' : ''}`}>
            <GlassCard className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Relationship Explorer</h3>
                <Link2 className="h-4 w-4 text-slate-400" />
              </div>
              {!selectedRelationship ? (
                <EmptyBlock icon={Link2} title="Select a relationship" subtitle="Click any edge in the graph to inspect details." />
              ) : (
                <div className="space-y-2 text-sm">
                  <p className="font-semibold text-cyan-700 dark:text-cyan-300">{selectedRelationship.type}</p>
                  <p><span className="text-slate-500">From:</span> {selectedRelationNodes.source?.name ?? 'Unknown'}</p>
                  <p><span className="text-slate-500">To:</span> {selectedRelationNodes.target?.name ?? 'Unknown'}</p>
                  <p><span className="text-slate-500">Reason:</span> {selectedRelationship.reason || 'Not provided'}</p>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Export Center</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
                <button
                  onClick={exportCsv}
                  className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  <Download className="h-4 w-4" /> CSV
                </button>
                <button
                  onClick={exportJson}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  JSON
                </button>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Contradictions</h3>
              {contradictions.length === 0 ? (
                <EmptyBlock icon={AlertCircle} title="No contradictions yet" subtitle="Detected contradictions appear here." />
              ) : (
                <div className="max-h-72 space-y-2 overflow-auto pr-1">
                  {contradictions.map((c, idx) => {
                    const a = c.clause_a || c.clause1 || c.source || 'Unknown';
                    const b = c.clause_b || c.clause2 || c.target || 'Unknown';
                    return (
                      <button
                        key={`${a}-${b}-${idx}`}
                        onClick={() => {
                          const hit = nodes.find((n) => n.name === a || n.id === a) || nodes.find((n) => n.name === b || n.id === b);
                          if (hit) {
                            highlightNodeInGraph(hit.id);
                          }
                        }}
                        className="w-full rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-left transition hover:shadow dark:border-rose-900/60 dark:bg-rose-950/30"
                      >
                        <p className="text-xs font-semibold text-rose-800 dark:text-rose-200">{a} vs {b}</p>
                        <p className="mt-1 text-[11px] text-rose-700 dark:text-rose-300">{c.reason || 'No reason provided'}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Time Travel Playback</h3>
                <button
                  onClick={() => setIsPlaybackRunning((prev) => !prev)}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                >
                  {isPlaybackRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                  {isPlaybackRunning ? 'Pause' : 'Play'}
                </button>
              </div>
              <input
                type="range"
                min={1}
                max={maxChunkIndex}
                value={timeTravelChunk}
                onChange={(e) => setTimeTravelChunk(Number(e.target.value))}
                className="w-full"
              />
              <div className="mt-2 flex items-center justify-between text-xs text-slate-500 dark:text-slate-300">
                <span>Chunk {timeTravelChunk}</span>
                <button
                  onClick={() => {
                    setTimeTravelChunk(1);
                    setIsPlaybackRunning(false);
                  }}
                  className="font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
                >
                  Reset
                </button>
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Comparison Mode</h3>
              <div className="space-y-2">
                <select
                  value={comparisonSelection.a}
                  onChange={(e) => setComparisonSelection((prev) => ({ ...prev, a: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Select Entity A</option>
                  {selectableNodesForControls.map((n) => (
                    <option key={`cmp-a-${n.id}`} value={n.id}>{n.name}</option>
                  ))}
                </select>
                <select
                  value={comparisonSelection.b}
                  onChange={(e) => setComparisonSelection((prev) => ({ ...prev, b: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Select Entity B</option>
                  {selectableNodesForControls.map((n) => (
                    <option key={`cmp-b-${n.id}`} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              {comparisonData && (
                <div className="mt-3 space-y-2 text-xs">
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                    <p className="font-semibold text-slate-700 dark:text-slate-100">Shared neighbors: {comparisonData.sharedCount}</p>
                    <p className="mt-1 text-slate-500 dark:text-slate-300">{comparisonData.a.name} unique: {comparisonData.uniqueA.length}</p>
                    <p className="text-slate-500 dark:text-slate-300">{comparisonData.b.name} unique: {comparisonData.uniqueB.length}</p>
                  </div>
                  <button
                    onClick={() => {
                      highlightNodeInGraph(comparisonData.a.id);
                      setSelectedEntity(comparisonData.a);
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    <GitCompare className="h-3.5 w-3.5" /> Jump to A
                  </button>
                </div>
              )}
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Contradiction Path Finder</h3>
              <div className="space-y-2">
                <select
                  value={selectedContradictionPath.aId}
                  onChange={(e) => setSelectedContradictionPath((prev) => ({ ...prev, aId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Start entity</option>
                  {selectableNodesForControls.map((n) => (
                    <option key={`path-a-${n.id}`} value={n.id}>{n.name}</option>
                  ))}
                </select>
                <select
                  value={selectedContradictionPath.bId}
                  onChange={(e) => setSelectedContradictionPath((prev) => ({ ...prev, bId: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">End entity</option>
                  {selectableNodesForControls.map((n) => (
                    <option key={`path-b-${n.id}`} value={n.id}>{n.name}</option>
                  ))}
                </select>
              </div>
              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-700 dark:bg-slate-800/60">
                {contradictionPath.length === 0 ? (
                  <p className="text-slate-500 dark:text-slate-300">Select two entities to compute the shortest contradiction path.</p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-700 dark:text-slate-100">Path length: {contradictionPath.length - 1} hops</p>
                    <p className="text-slate-500 dark:text-slate-300">Animated steps: {Math.min(pathAnimationStep, contradictionPath.length)}/{contradictionPath.length}</p>
                    <p className="flex items-center gap-1 text-cyan-700 dark:text-cyan-300">
                      <Route className="h-3.5 w-3.5" /> {contradictionPath.map((id) => nodeMap.get(id)?.name || id).join(' → ')}
                    </p>
                  </div>
                )}
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Smart Suggestions</h3>
              <div className="space-y-2 text-xs">
                {smartSuggestions.map((item) => (
                  <div key={item} className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300">
                    <p className="flex items-start gap-1.5"><Wand2 className="mt-0.5 h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" /> {item}</p>
                  </div>
                ))}
              </div>
            </GlassCard>

            <GlassCard className="p-4">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Collaboration Tools</h3>
              <div className="space-y-2">
                <select
                  value={selectedEntity?.id || ''}
                  onChange={(e) => {
                    const next = nodeMap.get(e.target.value);
                    if (next) setSelectedEntity(next);
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                >
                  <option value="">Pick entity for note</option>
                  {selectableNodesForControls.map((n) => (
                    <option key={`note-${n.id}`} value={n.id}>{n.name}</option>
                  ))}
                </select>

                <textarea
                  value={selectedEntity ? nodeNotes[selectedEntity.id] || '' : ''}
                  onChange={(e) => selectedEntity && updateNodeNote(selectedEntity.id, e.target.value)}
                  placeholder="Add sticky note for selected entity"
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                />

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    onClick={saveCurrentView}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    <Save className="h-3.5 w-3.5" /> Save View
                  </button>
                  <button
                    onClick={exportSelectedSubgraph}
                    className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                  >
                    <Download className="h-3.5 w-3.5" /> Export Subgraph
                  </button>
                </div>

                {savedViews.length > 0 && (
                  <div className="max-h-28 space-y-1 overflow-auto pr-1">
                    {savedViews.map((view) => (
                      <div key={view.id} className="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 dark:border-slate-700">
                        <button
                          onClick={() => applySavedView(view)}
                          className="flex-1 truncate text-left text-[11px] font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
                        >
                          {view.label}
                        </button>
                        <button
                          onClick={() => deleteSavedView(view.id)}
                          className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200"
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </GlassCard>
          </div>
        </div>

        <div className={`mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-6 ${isMobileView && mobileTab !== 'stats' ? 'hidden' : ''}`}>
          <MemoChartShell title="Entity Type Distribution" className="lg:col-span-1 2xl:col-span-2">
            <LazyRender placeholder={<SkeletonChartArea />}>
              {loading && nodes.length === 0 ? (
                <SkeletonChartArea />
              ) : pieDistribution.length === 0 ? (
                <EmptyBlock icon={Users} title="No entity distribution" subtitle="This chart appears once entity data is loaded." />
              ) : (
                <div className="h-72 space-y-3">
                  <div className="h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieDistribution}
                          dataKey="value"
                          nameKey="name"
                          outerRadius={84}
                          activeIndex={pieActiveIndex}
                          activeShape={renderActivePieShape}
                          onMouseEnter={(_, index) => setPieActiveIndex(index)}
                          onMouseLeave={() => setPieActiveIndex(-1)}
                          onClick={onPieSliceClick}
                          cursor="pointer"
                        >
                          {pieDistribution.map((entry) => (
                            <Cell key={entry.name} fill={ENTITY_COLORS[entry.name] || ENTITY_COLORS.Unknown} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value, _name, payload) => {
                            const total = pieDistribution.reduce((sum, item) => sum + item.value, 0);
                            const pct = total ? ((Number(value) / total) * 100).toFixed(1) : '0.0';
                            return [`${value} (${pct}%)`, payload?.payload?.name || 'Type'];
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {entityDistribution.map((entry) => {
                      const hidden = hiddenEntityTypes.has(entry.name);
                      return (
                        <button
                          key={entry.name}
                          onClick={() => togglePieLegendType(entry.name)}
                          className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-semibold transition ${
                            hidden
                              ? 'border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400'
                              : 'border-slate-200 bg-white text-slate-700 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200'
                          }`}
                        >
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ENTITY_COLORS[entry.name] || ENTITY_COLORS.Unknown }} />
                          {entry.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </LazyRender>
          </MemoChartShell>

          <MemoChartShell title="Relationship Type Bar Chart" className="lg:col-span-1 2xl:col-span-2">
            <LazyRender placeholder={<SkeletonChartArea />}>
              {loading && nodes.length === 0 ? (
                <SkeletonChartArea />
              ) : relationshipDistribution.length === 0 ? (
                <EmptyBlock icon={BarChart3} title="No relationships found" subtitle="Relationship bars will appear when links exist." />
              ) : (
                <div className="h-72 space-y-3">
                  <div className="h-44 overflow-x-auto">
                    <div style={{ minWidth: `${Math.max(560, relationshipDistribution.length * 90)}px`, height: '100%' }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={relationshipDistribution} margin={{ left: 0, right: 16 }}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="type" tick={{ fontSize: 11 }} interval={0} angle={-15} height={54} textAnchor="end" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="count" radius={[8, 8, 0, 0]} onClick={onRelationshipBarClick} cursor="pointer">
                            {relationshipDistribution.map((entry) => (
                              <Cell
                                key={entry.type}
                                fill={selectedRelationshipType && selectedRelationshipType !== entry.type ? '#94a3b8' : relationshipSeverityColor(entry.type)}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  {selectedRelationshipType && (
                    <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {selectedRelationshipType} Entities ({drilldownEntities.length})
                        </p>
                        <button
                          onClick={() => setSelectedRelationshipType('')}
                          className="text-[11px] font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
                        >
                          Clear
                        </button>
                      </div>
                      <div className="max-h-20 overflow-auto pr-1 text-xs text-slate-600 dark:text-slate-300">
                        {drilldownEntities.map((entity) => (
                          <button
                            key={entity.id}
                            onClick={() => highlightNodeInGraph(entity.id)}
                            className="mr-1 mb-1 rounded bg-slate-100 px-2 py-1 transition hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
                          >
                            {entity.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </LazyRender>
          </MemoChartShell>

          <MemoChartShell title="Timeline View (Date Entities)" className="lg:col-span-1 2xl:col-span-2">
            <LazyRender placeholder={<SkeletonChartArea />}>
              {loading && nodes.length === 0 ? (
                <SkeletonChartArea />
              ) : timelineData.length === 0 ? (
                <EmptyBlock icon={AlertCircle} title="No date entities detected" subtitle="Timeline needs entities of type Date." />
              ) : (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 20, right: 20, bottom: 10, left: 10 }}>
                      <CartesianGrid />
                      <XAxis type="number" dataKey="ts" domain={['dataMin', 'dataMax']} tickFormatter={(v) => new Date(v).getFullYear()} />
                      <YAxis type="number" dataKey="index" hide domain={[0, timelineData.length + 1]} />
                      <Tooltip
                        formatter={(value, name) => (name === 'ts' ? [new Date(value).toISOString().slice(0, 10), 'Date'] : [value, name])}
                        labelFormatter={(_, payload) => payload?.[0]?.payload?.name || ''}
                      />
                      <Scatter data={timelineData.map((d, idx) => ({ ...d, index: idx + 1 }))} fill="#d97706" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </LazyRender>
          </MemoChartShell>

          <MemoChartShell title="Top Connected Entities" className="lg:col-span-1 2xl:col-span-2">
            <LazyRender placeholder={<SkeletonChartArea />}>
              {loading && nodes.length === 0 ? (
                <SkeletonChartArea />
              ) : topConnectedEntities.length === 0 ? (
                <EmptyBlock icon={Users} title="No connectivity data" subtitle="Top nodes appear when graph links are available." />
              ) : (
                <div className="h-72 space-y-3">
                  <div className="h-36">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topConnectedEntities} layout="vertical" margin={{ left: 20, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" />
                        <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="connections" fill="#0d9488" radius={[0, 8, 8, 0]} onClick={(payload) => payload?.id && highlightNodeInGraph(payload.id)} cursor="pointer" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="max-h-28 space-y-1 overflow-auto pr-1">
                    {topConnectedEntities.map((entity) => {
                      const Icon = getEntityTypeIcon(entity.type);
                      return (
                        <div
                          key={entity.id}
                          className="group flex items-center justify-between rounded-lg border border-slate-200 px-2 py-1.5 text-xs transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                        >
                          <button onClick={() => highlightNodeInGraph(entity.id)} className="flex items-center gap-2 text-left">
                            <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-700">
                              <Icon className="h-3.5 w-3.5 text-slate-600 dark:text-slate-200" />
                            </span>
                            <span className="truncate font-semibold text-slate-700 dark:text-slate-100">{entity.name}</span>
                          </button>
                          <button
                            onClick={() => {
                              highlightNodeInGraph(entity.id);
                              const fullEntity = nodeMap.get(entity.id);
                              if (fullEntity) {
                                setSelectedEntity(fullEntity);
                              }
                            }}
                            className="rounded px-2 py-1 text-[10px] font-semibold text-cyan-700 opacity-0 transition group-hover:opacity-100 dark:text-cyan-300"
                          >
                            View Details
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </LazyRender>
          </MemoChartShell>

          <GlassCard className="p-4 lg:col-span-2 2xl:col-span-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold">Network Density Heatmap</h3>
              {heatmapSelection && (
                <button
                  onClick={() => setHeatmapSelection(null)}
                  className="text-[11px] font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
                >
                  Clear Filter
                </button>
              )}
            </div>
            <div className="overflow-auto">
              <LazyRender placeholder={<SkeletonChartArea />}>
                {heatmapData.types.length === 0 ? (
                  <EmptyBlock icon={BarChart3} title="No connectivity matrix" subtitle="Heatmap appears when entities and links are loaded." />
                ) : (
                  <div
                    className="grid gap-1"
                    style={{
                      gridTemplateColumns: `110px repeat(${heatmapData.types.length}, minmax(92px, 1fr))`,
                    }}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">From \ To</div>
                    {heatmapData.types.map((type) => (
                      <div key={`col-${type}`} className="px-1 text-center text-[10px] font-semibold text-slate-500">
                        {type}
                      </div>
                    ))}

                    {heatmapData.types.map((rowType) => (
                      <div key={`row-${rowType}`} className="contents">
                        <div key={`row-label-${rowType}`} className="px-1 py-2 text-[10px] font-semibold text-slate-500">
                          {rowType}
                        </div>
                        {heatmapData.types.map((colType) => {
                          const key = `${rowType}::${colType}`;
                          const value = heatmapData.map.get(key) ?? 0;
                          const intensity = value / heatmapData.max;
                          const active =
                            heatmapSelection?.sourceType === rowType && heatmapSelection?.targetType === colType;
                          return (
                            <button
                              key={key}
                              onClick={() => onHeatmapCellClick(rowType, colType)}
                              className={`h-10 rounded border text-xs font-semibold transition ${
                                active
                                  ? 'border-cyan-700 ring-2 ring-cyan-300 dark:ring-cyan-700'
                                  : 'border-slate-200 dark:border-slate-700'
                              }`}
                              style={{
                                backgroundColor: `rgba(8,145,178,${0.12 + intensity * 0.78})`,
                                color:
                                  theme === 'dark'
                                    ? intensity > 0.28
                                      ? '#f8fafc'
                                      : '#e2e8f0'
                                    : intensity > 0.5
                                      ? '#ffffff'
                                      : '#0f172a',
                              }}
                              title={`${rowType} -> ${colType}: ${value} connections`}
                            >
                              {value}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </LazyRender>
            </div>
          </GlassCard>
        </div>

        {isMobileView && mobileTab === 'search' && (
          <div className="mt-5">
            <GlassCard className="p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-base font-bold">Search & Filters</h3>
                <button
                  onClick={openAdvancedSearch}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" /> Advanced
                </button>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search entities"
                  className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2 text-sm outline-none ring-cyan-600 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="mt-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</p>
                <div className="flex flex-wrap gap-2">
                  {searchHistory.length === 0 ? (
                    <span className="text-xs text-slate-500">No recent searches</span>
                  ) : (
                    searchHistory.map((item) => (
                      <button
                        key={item}
                        onClick={() => runSearchText(item)}
                        className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-semibold dark:border-slate-700 dark:bg-slate-900"
                      >
                        {item}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </GlassCard>
          </div>
        )}
      </main>

      {selectedEntity && (
        <div
          className="fixed inset-0 z-[65] bg-slate-950/65 p-3 backdrop-blur-sm sm:p-5"
          onClick={() => setSelectedEntity(null)}
          onTouchStart={handleModalTouchStart}
          onTouchEnd={handleModalTouchEnd}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="entity-modal-enter mx-auto h-full w-full max-w-7xl overflow-hidden rounded-3xl border border-slate-200/70 bg-white/95 shadow-2xl dark:border-slate-700 dark:bg-slate-900/95"
          >
            <div className="grid h-full grid-cols-1 lg:grid-cols-12">
              <div className="flex h-full flex-col border-b border-slate-200 p-4 dark:border-slate-700 lg:col-span-5 lg:border-b-0 lg:border-r">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">{selectedEntity.name}</p>
                    <p className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold dark:bg-slate-800">
                      {selectedEntity.type}
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Description</p>
                  <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">
                    {selectedEntity.description || 'No description available.'}
                  </p>
                </div>

                <div className="mb-4 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500">Connections</p>
                    <p className="mt-1 text-xl font-bold text-cyan-700 dark:text-cyan-300">{selectedEntityConnections.length}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900/60">
                    <p className="text-slate-500">Relation Types</p>
                    <p className="mt-1 text-xl font-bold text-cyan-700 dark:text-cyan-300">{groupedSelectedEntityConnections.length}</p>
                  </div>
                </div>

                <div className="mb-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Metadata</p>
                    <button
                      onClick={() => highlightNodeInGraph(selectedEntity.id)}
                      className="text-xs font-semibold text-cyan-700 hover:underline dark:text-cyan-300"
                    >
                      View in Main Graph
                    </button>
                  </div>
                  {selectedEntityMetadata.length === 0 ? (
                    <p className="text-xs text-slate-500">No additional metadata.</p>
                  ) : (
                    <div className="max-h-36 space-y-1 overflow-auto pr-1 text-xs">
                      {selectedEntityMetadata.map((meta) => (
                        <div key={meta.key} className="rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/70">
                          <span className="font-semibold text-slate-600 dark:text-slate-200">{meta.key}: </span>
                          <span className="text-slate-500 dark:text-slate-300">{meta.value}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="min-h-0 flex-1 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Connected Entities by Relationship</p>
                  <div className="max-h-full space-y-3 overflow-auto pr-1">
                    {groupedSelectedEntityConnections.length === 0 ? (
                      <p className="text-xs text-slate-500">No connections found.</p>
                    ) : (
                      groupedSelectedEntityConnections.map((group) => (
                        <div key={group.relation} className="rounded-xl border border-slate-200 p-2.5 dark:border-slate-700">
                          <p className="mb-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300">
                            {group.relation} ({group.items.length})
                          </p>
                          <div className="space-y-1.5">
                            {group.items.map((conn) => (
                              <div key={conn.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1.5 text-xs dark:bg-slate-800/60">
                                <span className="truncate pr-2 font-semibold text-slate-700 dark:text-slate-100">{conn.other?.name ?? 'Unknown'}</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => conn.other && setSelectedEntity(conn.other)}
                                    className="rounded bg-white px-2 py-0.5 font-semibold text-cyan-700 transition hover:bg-cyan-50 dark:bg-slate-700 dark:text-cyan-300 dark:hover:bg-slate-600"
                                  >
                                    View
                                  </button>
                                  <button
                                    onClick={() => conn.other && highlightNodeInGraph(conn.other.id)}
                                    className="rounded bg-white px-2 py-0.5 font-semibold text-emerald-700 transition hover:bg-emerald-50 dark:bg-slate-700 dark:text-emerald-300 dark:hover:bg-slate-600"
                                  >
                                    Focus
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div className="flex h-full flex-col p-4 lg:col-span-7">
                <div className="mb-3 flex items-center justify-between">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Relationship Network View</h4>
                  <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {selectedEntityMiniGraph.nodes.length} nodes
                  </span>
                </div>

                <div className="h-full min-h-[300px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/60">
                  {selectedEntityMiniGraph.nodes.length <= 1 ? (
                    <EmptyBlock icon={Link2} title="No local network" subtitle="This entity has no connected neighbors in the graph." />
                  ) : (
                    <MemoForceGraph2D
                      graphData={selectedEntityMiniGraph}
                      cooldownTicks={120}
                      nodeVal={(node) => (node.isCenter ? 16 : 9)}
                      nodeColor={(node) => (node.isCenter ? '#f59e0b' : ENTITY_COLORS[node.type] || ENTITY_COLORS.Unknown)}
                      linkColor={() => '#0d9488'}
                      linkWidth={1.8}
                      nodeLabel={(node) => `${node.name} (${node.type})`}
                      onNodeClick={(node) => {
                        if (!node?.id || node.id === selectedEntity.id) {
                          return;
                        }
                        const next = nodeMap.get(node.id);
                        if (next) {
                          setSelectedEntity(next);
                        }
                      }}
                      linkCanvasObjectMode={() => 'after'}
                      linkCanvasObject={(link, ctx) => {
                        const start = link.source;
                        const end = link.target;
                        if (!start || !end || typeof start !== 'object' || typeof end !== 'object') {
                          return;
                        }
                        const label = link.type || '';
                        if (!label) {
                          return;
                        }
                        const mx = start.x + (end.x - start.x) * 0.5;
                        const my = start.y + (end.y - start.y) * 0.5;
                        ctx.save();
                        ctx.font = '10px sans-serif';
                        ctx.fillStyle = '#0f766e';
                        ctx.textAlign = 'center';
                        ctx.fillText(label, mx, my - 4);
                        ctx.restore();
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {isMobileView && (
        <button
          onClick={() => setShowMobileControls((prev) => !prev)}
          className="fixed bottom-24 right-4 z-[56] inline-flex h-12 w-12 items-center justify-center rounded-full bg-cyan-700 text-white shadow-lg transition hover:bg-cyan-800 md:hidden"
          title="Toggle graph controls"
        >
          <SlidersHorizontal className="h-5 w-5" />
        </button>
      )}

      {isMobileView && (
        <div className="fixed bottom-0 left-0 right-0 z-[55] border-t border-slate-200 bg-white/95 px-2 py-1.5 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 md:hidden">
          <div className="grid grid-cols-4 gap-1">
            {[
              { key: 'graph', label: 'Graph', icon: Link2 },
              { key: 'stats', label: 'Stats', icon: BarChart3 },
              { key: 'export', label: 'Export', icon: Download },
              { key: 'search', label: 'Search', icon: Search },
            ].map((tab) => {
              const active = mobileTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setMobileTab(tab.key)}
                  className={`flex flex-col items-center justify-center rounded-lg px-1 py-1 text-[10px] font-semibold transition ${
                    active
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-200'
                      : 'text-slate-500 dark:text-slate-300'
                  }`}
                >
                  <tab.icon className="mb-0.5 h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {showAdvancedSearch && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold">Advanced Search</h3>
              <button
                onClick={() => setShowAdvancedSearch(false)}
                className="rounded-lg border border-slate-200 p-1.5 transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Has relationship type</span>
                <input
                  value={advancedDraft.relationshipType}
                  onChange={(e) => setAdvancedDraft((prev) => ({ ...prev, relationshipType: e.target.value }))}
                  placeholder="e.g. CONTRADICTS"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Connected to</span>
                <input
                  value={advancedDraft.connectedTo}
                  onChange={(e) => setAdvancedDraft((prev) => ({ ...prev, connectedTo: e.target.value }))}
                  placeholder="Entity name"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Created between (from)</span>
                <input
                  type="date"
                  value={advancedDraft.dateFrom}
                  onChange={(e) => setAdvancedDraft((prev) => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>

              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Created between (to)</span>
                <input
                  type="date"
                  value={advancedDraft.dateTo}
                  onChange={(e) => setAdvancedDraft((prev) => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
                />
              </label>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Saved Search Queries</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveAdvancedSearch}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700"
                  >
                    <Save className="h-3.5 w-3.5" /> Save current
                  </button>
                  <button
                    onClick={() => setSavedSearches([])}
                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-700 transition hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Clear
                  </button>
                </div>
              </div>
              {savedSearches.length === 0 ? (
                <p className="text-xs text-slate-500">No saved queries yet.</p>
              ) : (
                <div className="max-h-24 space-y-1 overflow-auto pr-1">
                  {savedSearches.map((saved) => (
                    <button
                      key={saved.id}
                      onClick={() => setAdvancedDraft(saved.criteria)}
                      className="block w-full rounded-lg border border-slate-200 px-2 py-1 text-left text-xs transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      {saved.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setAdvancedDraft({ relationshipType: '', connectedTo: '', dateFrom: '', dateTo: '' });
                }}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold transition hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Reset
              </button>
              <button
                onClick={applyAdvancedSearch}
                className="rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-cyan-800"
              >
                Apply Search
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="pointer-events-none fixed right-4 top-4 z-[60] flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-xl px-3 py-2 text-sm shadow-xl transition-all duration-300 ${
              toast.type === 'error' ? 'bg-rose-600 text-white' : 'bg-emerald-600 text-white'
            }`}
          >
            {toast.message}
          </div>
        ))}
      </div>

      {error && (
        <div className="fixed bottom-4 left-4 z-50 rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-800 shadow-lg dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        </div>
      )}

      {/* === NEW: Node Hover Tooltip (1A) === */}
      {showNodeTooltip && hoveredNode && (
        <NodeHoverTooltip
          node={hoveredNode}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
          connectionCount={degreeMap.get(hoveredNode.id) ?? 0}
          connectedNames={
            linksWithMetadata
              .filter((l) => l.sourceId === hoveredNode.id || l.targetId === hoveredNode.id)
              .map((l) => (l.sourceId === hoveredNode.id ? nodeMap.get(l.targetId)?.name : nodeMap.get(l.sourceId)?.name))
              .filter(Boolean)
              .slice(0, 3)
          }
        />
      )}

      {/* === NEW: Edge Hover Tooltip (1C) === */}
      {showEdgeTooltip && hoveredEdge && (
        <EdgeHoverTooltip
          edge={hoveredEdge}
          mouseX={mousePos.x}
          mouseY={mousePos.y}
          fromName={nodeMap.get(getLinkNodeId(hoveredEdge.source))?.name ?? 'Unknown'}
          toName={nodeMap.get(getLinkNodeId(hoveredEdge.target))?.name ?? 'Unknown'}
        />
      )}

    </div>
  );
}
