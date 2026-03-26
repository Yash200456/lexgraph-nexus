import { useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
  AlertCircle,
  BarChart3,
  Download,
  Filter,
  Link2,
  Moon,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  Sun,
  Users,
  X,
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

export default function App() {
  const graphRef = useRef(null);

  const [theme, setTheme] = useState('light');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [nodes, setNodes] = useState([]);
  const [links, setLinks] = useState([]);
  const [entities, setEntities] = useState([]);
  const [stats, setStats] = useState({ total_nodes: 0, total_edges: 0 });
  const [contradictions, setContradictions] = useState([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const [highlightedNodeIds, setHighlightedNodeIds] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedRelationship, setSelectedRelationship] = useState(null);

  const [toasts, setToasts] = useState([]);

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

  const filteredNodes = useMemo(() => {
    return nodes.filter((n) => {
      const matchesFilter = activeFilter === 'All' || n.type === activeFilter;
      const matchesSearch = n.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [nodes, activeFilter, searchQuery]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  const filteredLinks = useMemo(() => {
    return linksWithMetadata.filter((l) => filteredNodeIds.has(l.sourceId) && filteredNodeIds.has(l.targetId));
  }, [linksWithMetadata, filteredNodeIds]);

  const graphData = useMemo(() => ({ nodes: filteredNodes, links: filteredLinks }), [filteredNodes, filteredLinks]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }
    return filteredNodes.slice(0, 7);
  }, [searchQuery, filteredNodes]);

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
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [linksWithMetadata]);

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
      .map((n) => ({ name: n.name, connections: degreeMap.get(n.id) ?? 0, id: n.id }))
      .sort((a, b) => b.connections - a.connections)
      .slice(0, 8);
  }, [nodes, degreeMap]);

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

  const selectedRelationNodes = useMemo(() => {
    if (!selectedRelationship) {
      return { source: null, target: null };
    }
    const source = nodeMap.get(selectedRelationship.sourceId ?? getLinkNodeId(selectedRelationship.source));
    const target = nodeMap.get(selectedRelationship.targetId ?? getLinkNodeId(selectedRelationship.target));
    return { source, target };
  }, [selectedRelationship, nodeMap]);

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

  const statCards = [
    { label: 'Entities', value: stats.total_nodes, icon: Users },
    { label: 'Relationships', value: stats.total_edges, icon: Link2 },
    { label: 'Contradictions', value: contradictions.length, icon: AlertCircle },
    {
      label: 'Avg Connections',
      value: stats.total_nodes ? Math.round((stats.total_edges * 2) / stats.total_nodes) : 0,
      icon: BarChart3,
    },
  ];

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-slate-100 text-slate-900 transition-colors duration-300 dark:bg-slate-950 dark:text-slate-100">
      <div className="pointer-events-none absolute -left-28 top-20 h-72 w-72 rounded-full bg-cyan-300/30 blur-3xl dark:bg-cyan-700/20" />
      <div className="pointer-events-none absolute -right-32 top-44 h-80 w-80 rounded-full bg-amber-300/25 blur-3xl dark:bg-amber-500/10" />

      <header className="relative border-b border-white/60 bg-gradient-to-r from-cyan-700 via-teal-700 to-sky-700 text-white shadow-lg dark:border-slate-800">
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
            {statCards.map((card) => (
              <div key={card.label} className="rounded-xl border border-white/25 bg-white/10 px-3 py-3 backdrop-blur">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-cyan-100">{card.label}</p>
                  <card.icon className="h-4 w-4 text-cyan-50" />
                </div>
                <p className="mt-2 text-2xl font-bold">{card.value}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
          <GlassCard className="p-4 xl:col-span-8">
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
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search entities by name"
                  className="w-full rounded-xl border border-slate-200 bg-white px-9 py-2 text-sm outline-none ring-cyan-600 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-900"
                />
                {searchQuery && (
                  <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    {searchResults.length === 0 ? (
                      <p className="px-3 py-2 text-xs text-slate-500">No matches</p>
                    ) : (
                      searchResults.map((n) => (
                        <button
                          key={n.id}
                          onClick={() => {
                            highlightNodeInGraph(n.id);
                            setSearchQuery('');
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm transition hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          <span className="truncate">{n.name}</span>
                          <span className="ml-2 rounded bg-slate-100 px-2 py-0.5 text-[10px] dark:bg-slate-700">{n.type}</span>
                        </button>
                      ))
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
                      onClick={() => setActiveFilter(filter.value)}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                        active
                          ? 'bg-cyan-700 text-white'
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

            <div className="h-[520px] overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-slate-100 dark:border-slate-700 dark:from-slate-900 dark:to-slate-900/60">
              {loading && nodes.length === 0 ? (
                <div className="h-full animate-pulse bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800" />
              ) : graphData.nodes.length === 0 ? (
                <EmptyBlock icon={Link2} title="No graph data available" subtitle="Try refreshing data or changing filters." />
              ) : (
                <ForceGraph2D
                  ref={graphRef}
                  graphData={graphData}
                  nodeLabel={(node) => `${node.name} (${node.type})`}
                  linkLabel={(link) => `${link.type}${link.reason ? `: ${link.reason}` : ''}`}
                  onNodeClick={onNodeClick}
                  onLinkClick={onLinkClick}
                  nodeColor={(node) => {
                    if (highlightedNodeIds.includes(node.id)) {
                      return '#f59e0b';
                    }
                    return ENTITY_COLORS[node.type] || ENTITY_COLORS.Unknown;
                  }}
                  nodeVal={(node) => 4 + (degreeMap.get(node.id) ?? 0) * 0.8}
                  linkColor={(link) => {
                    const source = getLinkNodeId(link.source);
                    const target = getLinkNodeId(link.target);
                    return highlightedNodeIds.includes(source) || highlightedNodeIds.includes(target) ? '#0d9488' : '#94a3b8';
                  }}
                  linkWidth={(link) => {
                    const source = getLinkNodeId(link.source);
                    const target = getLinkNodeId(link.target);
                    return highlightedNodeIds.includes(source) || highlightedNodeIds.includes(target) ? 2.4 : 1;
                  }}
                  linkDirectionalParticles={(link) => {
                    const source = getLinkNodeId(link.source);
                    const target = getLinkNodeId(link.target);
                    return highlightedNodeIds.includes(source) || highlightedNodeIds.includes(target) ? 2 : 0;
                  }}
                  linkDirectionalParticleWidth={2}
                  cooldownTicks={100}
                  d3VelocityDecay={0.26}
                />
              )}
            </div>
          </GlassCard>

          <div className="space-y-5 xl:col-span-4">
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
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
          <GlassCard className="p-4">
            <h3 className="mb-3 text-base font-bold">Entity Type Distribution</h3>
            <div className="h-72">
              {entityDistribution.length === 0 ? (
                <EmptyBlock icon={Users} title="No entity distribution" subtitle="This chart appears once entity data is loaded." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={entityDistribution} dataKey="value" nameKey="name" outerRadius={88} label>
                      {entityDistribution.map((entry) => (
                        <Cell key={entry.name} fill={ENTITY_COLORS[entry.name] || ENTITY_COLORS.Unknown} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="mb-3 text-base font-bold">Relationship Type Bar Chart</h3>
            <div className="h-72">
              {relationshipDistribution.length === 0 ? (
                <EmptyBlock icon={BarChart3} title="No relationships found" subtitle="Relationship bars will appear when links exist." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={relationshipDistribution} margin={{ left: 0, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="type" tick={{ fontSize: 11 }} interval={0} angle={-15} height={54} textAnchor="end" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="count" fill="#0891b2" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="mb-3 text-base font-bold">Timeline View (Date Entities)</h3>
            <div className="h-72">
              {timelineData.length === 0 ? (
                <EmptyBlock icon={AlertCircle} title="No date entities detected" subtitle="Timeline needs entities of type Date." />
              ) : (
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
              )}
            </div>
          </GlassCard>

          <GlassCard className="p-4">
            <h3 className="mb-3 text-base font-bold">Top Connected Entities</h3>
            <div className="h-72">
              {topConnectedEntities.length === 0 ? (
                <EmptyBlock icon={Users} title="No connectivity data" subtitle="Top nodes appear when graph links are available." />
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={topConnectedEntities} layout="vertical" margin={{ left: 20, right: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={140} tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="connections" fill="#0d9488" radius={[0, 8, 8, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </GlassCard>
        </div>
      </main>

      {selectedEntity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xl font-bold">{selectedEntity.name}</p>
                <p className="mt-1 inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold dark:bg-slate-800">
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

            <p className="text-sm text-slate-600 dark:text-slate-300">{selectedEntity.description || 'No description available.'}</p>

            <div className="mt-4 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Connected Entities</p>
                <button onClick={() => highlightNodeInGraph(selectedEntity.id)} className="text-xs font-semibold text-cyan-700 hover:underline dark:text-cyan-300">
                  View In Graph
                </button>
              </div>
              <div className="max-h-52 space-y-2 overflow-auto pr-1">
                {selectedEntityConnections.length === 0 ? (
                  <p className="text-xs text-slate-500">No connections found.</p>
                ) : (
                  selectedEntityConnections.map((conn) => (
                    <button
                      key={conn.id}
                      onClick={() => conn.other && highlightNodeInGraph(conn.other.id)}
                      className="w-full rounded-lg border border-slate-200 p-2 text-left text-xs transition hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <p className="truncate font-semibold">{conn.other?.name ?? 'Unknown'}</p>
                      <p className="text-slate-500">{conn.type}</p>
                    </button>
                  ))
                )}
              </div>
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
    </div>
  );
}
