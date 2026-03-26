import React, { useState, useEffect, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import {
  Search, Filter, BarChart3, Link2, AlertCircle, Download,
  X, ChevronRight, Clock, Users, FileText, Zap
} from 'lucide-react';
import './styles.css';

export default function App() {
  // State Management
  const [graphData, setGraphData] = useState({ nodes: [], links: [] });
  const [entities, setEntities] = useState([]);
  const [stats, setStats] = useState({ total_entities: 0, total_relationships: 0 });
  const [contradictions, setContradictions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // UI State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [selectedRelationship, setSelectedRelationship] = useState(null);
  const [highlightedNode, setHighlightedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  
  const graphRef = useRef();

  // Entity type colors
  const entityColors = {
    Party: '#0d9488',
    Clause: '#0891b2',
    Date: '#d97706',
    Document: '#7c3aed',
    Obligation: '#dc2626',
  };

  // Filter options
  const filters = ['All', 'Party', 'Clause', 'Date', 'Document', 'Obligation'];

  // API Integration
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsRes, entitiesRes, graphRes, contradictionsRes] = await Promise.all([
        fetch('http://localhost:8000/stats'),
        fetch('http://localhost:8000/entities'),
        fetch('http://localhost:8000/graph/view', { method: 'POST' }),
        fetch('http://localhost:8000/contradictions'),
      ]);

      if (!statsRes.ok || !entitiesRes.ok || !graphRes.ok || !contradictionsRes.ok) {
        throw new Error('Backend not responding. Make sure FastAPI server is running on http://localhost:8000');
      }

      const statsData = await statsRes.json();
      const entitiesData = await entitiesRes.json();
      const graphJSONData = await graphRes.json();
      const contradictionsData = await contradictionsRes.json();

      setStats(statsData);
      setEntities(entitiesData);
      setGraphData(graphJSONData);
      setContradictions(contradictionsData);
      setError('');
    } catch (err) {
      setError(err.message);
      console.error('Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Filtered Data
  const filteredEntities = entities.filter(e => {
    const matchesFilter = activeFilter === 'All' || e.type === activeFilter;
    const matchesSearch = e.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const filteredGraph = {
    nodes: graphData.nodes?.filter(n => 
      activeFilter === 'All' ? true : n.type === activeFilter
    ) || [],
    links: graphData.links?.filter(l => {
      const sourceNode = graphData.nodes?.find(n => n.id === l.source);
      const targetNode = graphData.nodes?.find(n => n.id === l.target);
      return activeFilter === 'All' || 
        sourceNode?.type === activeFilter || 
        targetNode?.type === activeFilter;
    }) || [],
  };

  // Graph interaction handlers
  const handleNodeClick = (node) => {
    setSelectedEntity(node);
    setHighlightedNode(node.id);
    // Zoom to node
    if (graphRef.current) {
      graphRef.current.centerAt(node.x, node.y, 500);
      graphRef.current.zoom(2, 500);
    }
  };

  const handleLinkClick = (link) => {
    const source = filteredGraph.nodes.find(n => n.id === link.source);
    const target = filteredGraph.nodes.find(n => n.id === link.target);
    setSelectedRelationship({ ...link, sourceNode: source, targetNode: target });
  };

  const handleNodeHover = (node) => {
    setHoveredNode(node?.id || null);
  };

  // Export functionality
  const exportToCSV = () => {
    const csv = [
      ['Entity Name', 'Type', 'Description', 'Connected To'].join(','),
      ...filteredEntities.map(e => 
        [e.name, e.type, '"' + (e.description || '') + '"', 
         filteredGraph.links.filter(l => l.source === e.id || l.target === e.id).length].join(',')
      )
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'entities.csv';
    a.click();
  };

  if (loading && !graphData.nodes?.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-slate-600">Loading knowledge graph...</p>
          {error && <p className="text-red-600 mt-2 text-sm">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="bg-gradient-to-r from-primary to-secondary text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Zap className="w-8 h-8" />
                LexGraph Nexus
              </h1>
              <p className="text-teal-100 mt-1">Legal Document Contradiction Detector</p>
            </div>
            <button
              onClick={fetchData}
              className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition"
              title="Refresh data"
            >
              ↻ Refresh
            </button>
          </div>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mx-6 mt-6 rounded">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-900">Connection Error</h3>
              <p className="text-red-700 text-sm">{error}</p>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-primary">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Total Entities</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total_entities || 0}</p>
              </div>
              <Users className="w-10 h-10 text-primary opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-secondary">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Relationships</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{stats.total_relationships || 0}</p>
              </div>
              <Link2 className="w-10 h-10 text-secondary opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-red-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Contradictions</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">{contradictions.length || 0}</p>
              </div>
              <AlertCircle className="w-10 h-10 text-red-500 opacity-20" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6 border-l-4 border-amber-500">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-slate-500 text-sm font-medium">Avg Connections</p>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {stats.total_entities ? Math.round(stats.total_relationships * 2 / stats.total_entities) : 0}
                </p>
              </div>
              <BarChart3 className="w-10 h-10 text-amber-500 opacity-20" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left: Graph Visualization */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
              <div className="h-[600px] border-b border-slate-200">
                {filteredGraph.nodes.length > 0 ? (
                  <ForceGraph2D
                    ref={graphRef}
                    graphData={filteredGraph}
                    nodeRelSize={6}
                    linkWidth={link => link.source === highlightedNode || link.target === highlightedNode ? 2 : 1}
                    nodeColor={node => 
                      highlightedNode === node.id ? '#fff000' : entityColors[node.type] || '#0d9488'
                    }
                    nodeVal={node => {
                      const connections = filteredGraph.links.filter(
                        l => l.source === node.id || l.target === node.id
                      ).length;
                      return 4 + connections * 0.5;
                    }}
                    linkColor={link => 
                      link.source === highlightedNode || link.target === highlightedNode
                        ? '#0d9488'
                        : '#d1d5db'
                    }
                    onNodeClick={handleNodeClick}
                    onNodeHover={handleNodeHover}
                    onLinkClick={handleLinkClick}
                    linkDirectionalParticles={2}
                    linkDirectionalParticleWidth={link => 
                      link.source === highlightedNode || link.target === highlightedNode ? 2 : 0
                    }
                    d3VelocityDecay={0.3}
                    warmupTicks={100}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-400">
                    No entities to display
                  </div>
                )}
              </div>

              {/* Legend */}
              <div className="p-4 bg-slate-50 border-t border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-3">Entity Types</p>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {Object.entries(entityColors).map(([type, color]) => (
                    <div key={type} className="flex items-center gap-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: color }}
                      ></div>
                      <span className="text-xs text-slate-600">{type}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right: Controls & Details */}
          <div className="lg:col-span-1 space-y-6">
            {/* Search */}
            <div className="bg-white rounded-lg shadow p-4">
              <label className="block text-sm font-semibold text-slate-900 mb-3">
                Search Entities
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Search Results Dropdown */}
              {searchQuery && filteredEntities.length > 0 && (
                <div className="mt-2 border border-slate-200 rounded-lg max-h-48 overflow-y-auto">
                  {filteredEntities.slice(0, 5).map(entity => (
                    <button
                      key={entity.id}
                      onClick={() => {
                        setSelectedEntity(entity);
                        setHighlightedNode(entity.id);
                        setSearchQuery('');
                      }}
                      className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0 text-sm"
                    >
                      <span className="font-medium">{entity.name}</span>
                      <span className="text-slate-400 ml-2 text-xs">
                        ({entity.type})
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow p-4">
              <label className="block text-sm font-semibold text-slate-900 mb-3">
                Filter by Type
              </label>
              <div className="space-y-2">
                {filters.map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition text-left ${
                      activeFilter === filter
                        ? 'bg-primary text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    <Filter className="w-4 h-4 inline mr-2" />
                    {filter}
                  </button>
                ))}
              </div>
            </div>

            {/* Entity Details */}
            {selectedEntity && (
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-primary">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="font-bold text-slate-900">{selectedEntity.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">
                      <span className="inline-block px-2 py-1 bg-slate-100 rounded mt-1">
                        {selectedEntity.type}
                      </span>
                    </p>
                  </div>
                  <button
                    onClick={() => setSelectedEntity(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {selectedEntity.description && (
                  <p className="text-sm text-slate-600 mb-4">{selectedEntity.description}</p>
                )}

                {/* Connected Entities */}
                <div className="border-t border-slate-200 pt-4">
                  <h4 className="text-xs font-semibold text-slate-600 uppercase mb-3">
                    Connected Entities
                  </h4>
                  <div className="space-y-2 max-h-32 overflow-y-auto">
                    {filteredGraph.links
                      .filter(l => l.source === selectedEntity.id || l.target === selectedEntity.id)
                      .map((link, i) => {
                        const related = link.source === selectedEntity.id 
                          ? filteredGraph.nodes.find(n => n.id === link.target)
                          : filteredGraph.nodes.find(n => n.id === link.source);
                        return related ? (
                          <button
                            key={i}
                            onClick={() => setSelectedEntity(related)}
                            className="w-full text-left px-2 py-2 bg-slate-50 rounded hover:bg-slate-100 text-xs transition"
                          >
                            <div className="font-medium text-slate-700">{related.name}</div>
                            <div className="text-slate-500">{link.type}</div>
                          </button>
                        ) : null;
                      })}
                  </div>
                </div>
              </div>
            )}

            {/* Relationship Details */}
            {selectedRelationship && (
              <div className="bg-white rounded-lg shadow p-4 border-l-4 border-secondary">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="font-bold text-slate-900">Relationship</h3>
                  <button
                    onClick={() => setSelectedRelationship(null)}
                    className="text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-slate-500">From</p>
                    <p className="font-medium text-slate-900">
                      {selectedRelationship.sourceNode?.name}
                    </p>
                  </div>
                  <div className="flex items-center justify-center">
                    <ChevronRight className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-slate-500">Relationship</p>
                    <p className="font-semibold text-secondary">
                      {selectedRelationship.type}
                    </p>
                  </div>
                  <div className="flex items-center justify-center">
                    <ChevronRight className="w-5 h-5 text-secondary" />
                  </div>
                  <div>
                    <p className="text-slate-500">To</p>
                    <p className="font-medium text-slate-900">
                      {selectedRelationship.targetNode?.name}
                    </p>
                  </div>
                  {selectedRelationship.reason && (
                    <div className="border-t border-slate-200 pt-3 mt-3">
                      <p className="text-slate-500 mb-1">Reason</p>
                      <p className="text-slate-700 text-xs">{selectedRelationship.reason}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Export Button */}
            <button
              onClick={exportToCSV}
              className="w-full px-4 py-2 bg-primary text-white rounded-lg hover:bg-teal-700 transition font-medium flex items-center justify-center gap-2"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          </div>
        </div>

        {/* Contradictions Section */}
        {contradictions.length > 0 && (
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-red-500" />
              Detected Contradictions ({contradictions.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contradictions.map((contradiction, i) => (
                <div
                  key={i}
                  className="border border-red-200 bg-red-50 rounded-lg p-4 cursor-pointer hover:shadow-md transition"
                  onClick={() => {
                    setHighlightedNode(contradiction.clause1);
                    setSelectedEntity(
                      filteredGraph.nodes.find(n => n.id === contradiction.clause1)
                    );
                  }}
                >
                  <p className="text-sm font-semibold text-red-900">
                    {contradiction.clause1} ↔ {contradiction.clause2}
                  </p>
                  <p className="text-xs text-red-700 mt-2">{contradiction.reason}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
