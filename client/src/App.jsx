import { useEffect, useMemo, useState } from 'react';

const API_BASE = 'http://localhost:8000';

const TYPE_COLORS = {
  Party: '#0f4c75',
  Clause: '#b33939',
  Date: '#3d7c47',
  Document: '#6f42c1',
  Unknown: '#596275',
};

function StatCard({ label, value }) {
  return (
    <div className="card stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
    </div>
  );
}

export default function App() {
  const [health, setHealth] = useState('checking...');
  const [stats, setStats] = useState({ total_nodes: 0, total_edges: 0 });
  const [contradictions, setContradictions] = useState([]);
  const [entityTypes, setEntityTypes] = useState([]);
  const [selectedType, setSelectedType] = useState('');
  const [entities, setEntities] = useState([]);
  const [graph, setGraph] = useState({ nodes: [], links: [] });
  const [selectedNodeKey, setSelectedNodeKey] = useState('');
  const [loading, setLoading] = useState(false);

  const contradictionCount = useMemo(() => contradictions.length, [contradictions]);

  const positionedNodes = useMemo(() => {
    const width = 720;
    const height = 420;
    const cx = width / 2;
    const cy = height / 2;
    const radius = Math.min(width, height) * 0.36;
    const total = Math.max(graph.nodes.length, 1);

    return graph.nodes.map((node, idx) => {
      const angle = (idx / total) * Math.PI * 2;
      return {
        ...node,
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
        color: TYPE_COLORS[node.type] || TYPE_COLORS.Unknown,
      };
    });
  }, [graph.nodes]);

  const nodeIndex = useMemo(() => {
    const map = {};
    positionedNodes.forEach((n) => {
      map[n.key] = n;
    });
    return map;
  }, [positionedNodes]);

  const selectedNode = selectedNodeKey ? nodeIndex[selectedNodeKey] : null;

  const selectedLinks = useMemo(() => {
    if (!selectedNodeKey) {
      return [];
    }
    return graph.links.filter((l) => l.source === selectedNodeKey || l.target === selectedNodeKey);
  }, [graph.links, selectedNodeKey]);

  async function getJson(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
      throw new Error(`Request failed: ${res.status}`);
    }
    return res.json();
  }

  async function loadDashboard() {
    setLoading(true);
    try {
      const [healthRes, statsRes, contradictionRes, typeRes, graphRes] = await Promise.all([
        getJson('/health'),
        getJson('/stats'),
        getJson('/contradictions?limit=10'),
        getJson('/entities/types'),
        getJson('/graph/view?limit=200'),
      ]);

      setHealth(healthRes.status || 'unknown');
      setStats(statsRes);
      setContradictions(contradictionRes);
      setEntityTypes(typeRes.types || []);
      setGraph(graphRes || { nodes: [], links: [] });
    } catch (err) {
      setHealth(`error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  function exportContradictionsCsv() {
    if (!contradictions.length) {
      return;
    }
    const lines = [
      'clause_a,clause_b,relation,reason',
      ...contradictions.map((c) => {
        const safe = (v) => `"${String(v || '').replaceAll('"', '""')}"`;
        return [safe(c.clause_a), safe(c.clause_b), safe(c.relation), safe(c.reason)].join(',');
      }),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contradictions.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  async function loadEntities(type = '') {
    setLoading(true);
    try {
      const query = type ? `/entities?entity_type=${encodeURIComponent(type)}&limit=20` : '/entities?limit=20';
      const data = await getJson(query);
      setEntities(data);
    } catch (err) {
      setEntities([]);
      setHealth(`error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
    loadEntities('');
  }, []);

  return (
    <div className="page">
      <header className="hero">
        <h1>LexGraph Nexus</h1>
        <p>Legal Contradiction Intelligence Dashboard</p>
        <button className="btn" onClick={loadDashboard} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Data'}
        </button>
      </header>

      <section className="stats-grid">
        <StatCard label="API Health" value={health} />
        <StatCard label="Graph Nodes" value={stats.total_nodes} />
        <StatCard label="Graph Edges" value={stats.total_edges} />
        <StatCard label="Contradictions" value={contradictionCount} />
      </section>

      <section className="panel-grid">
        <article className="card">
          <div className="panel-head">
            <h2>Top Contradictions</h2>
            <button className="btn btn-ghost" onClick={exportContradictionsCsv} disabled={!contradictions.length}>
              Export CSV
            </button>
          </div>
          <div className="list">
            {contradictions.length === 0 ? (
              <p className="muted">No contradictions found yet.</p>
            ) : (
              contradictions.map((item, idx) => (
                <div key={`${item.clause_a}-${item.clause_b}-${idx}`} className="list-item">
                  <h3>{item.clause_a} vs {item.clause_b}</h3>
                  <p>{item.reason || 'No reason provided'}</p>
                  <span className="pill">{item.relation}</span>
                </div>
              ))
            )}
          </div>
        </article>

        <article className="card">
          <div className="panel-head">
            <h2>Entity Explorer</h2>
            <select
              value={selectedType}
              onChange={(e) => {
                const t = e.target.value;
                setSelectedType(t);
                loadEntities(t);
              }}
            >
              <option value="">All Types</option>
              {entityTypes.map((type) => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="list">
            {entities.length === 0 ? (
              <p className="muted">No entities to display.</p>
            ) : (
              entities.map((entity) => (
                <div key={entity.key} className="list-item">
                  <h3>{entity.name}</h3>
                  <p>{entity.description || 'No description'}</p>
                  <span className="pill">{entity.type}</span>
                </div>
              ))
            )}
          </div>
        </article>
      </section>

      <section className="graph-section card">
        <div className="panel-head">
          <h2>Graph View</h2>
          <p className="muted">Click a node to inspect connected relationships.</p>
        </div>

        <div className="graph-wrap">
          <svg viewBox="0 0 720 420" className="graph-svg" role="img" aria-label="Knowledge graph">
            {graph.links.map((link, idx) => {
              const source = nodeIndex[link.source];
              const target = nodeIndex[link.target];
              if (!source || !target) {
                return null;
              }
              const highlighted =
                selectedNodeKey && (link.source === selectedNodeKey || link.target === selectedNodeKey);
              return (
                <line
                  key={`${link.source}-${link.target}-${idx}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  className={highlighted ? 'graph-line active' : 'graph-line'}
                />
              );
            })}

            {positionedNodes.map((node) => {
              const active = selectedNodeKey === node.key;
              return (
                <g key={node.key}>
                  <circle
                    cx={node.x}
                    cy={node.y}
                    r={active ? 9 : 7}
                    fill={node.color}
                    className={active ? 'graph-node active' : 'graph-node'}
                    onClick={() => setSelectedNodeKey(node.key === selectedNodeKey ? '' : node.key)}
                  />
                  {active && (
                    <text x={node.x + 10} y={node.y - 10} className="graph-label">
                      {node.name}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          <aside className="graph-inspector">
            {!selectedNode ? (
              <p className="muted">Select a node in the graph to inspect details.</p>
            ) : (
              <>
                <h3>{selectedNode.name}</h3>
                <span className="pill">{selectedNode.type}</span>
                <h4>Connections</h4>
                <div className="list compact">
                  {selectedLinks.length === 0 ? (
                    <p className="muted">No links found.</p>
                  ) : (
                    selectedLinks.map((link, idx) => {
                      const other = link.source === selectedNode.key ? nodeIndex[link.target] : nodeIndex[link.source];
                      return (
                        <div className="list-item" key={`${link.relation}-${idx}`}>
                          <h3>{other ? other.name : 'Unknown'}</h3>
                          <span className="pill">{link.relation}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </aside>
        </div>
      </section>
    </div>
  );
}
