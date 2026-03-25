"""
FastAPI backend for querying the legal knowledge graph.
Provides endpoints for contradiction detection, entity search, and graph analysis.
"""

import os
from typing import List, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from neo4j import GraphDatabase
from neo4j.exceptions import AuthError, ServiceUnavailable

load_dotenv()


# ============================================================================
# Pydantic Models
# ============================================================================

class Entity(BaseModel):
    """A node in the knowledge graph."""
    key: str
    name: str
    type: str
    description: str


class Relationship(BaseModel):
    """An edge in the knowledge graph."""
    from_name: str
    to_name: str
    relation: str
    reason: str


class Contradiction(BaseModel):
    """A potential contradiction between two clauses."""
    clause_a: str
    clause_b: str
    relation: str
    reason: str


class GraphNode(BaseModel):
    """Graph node payload for frontend visualization."""
    key: str
    name: str
    type: str


class GraphLink(BaseModel):
    """Graph link payload for frontend visualization."""
    source: str
    target: str
    relation: str


class GraphView(BaseModel):
    """Subgraph payload returned for dashboard graph view."""
    nodes: List[GraphNode]
    links: List[GraphLink]


# ============================================================================
# Neo4j Connection
# ============================================================================

def _get_env_value(*names: str) -> str:
    """Return first non-empty env var, trimmed and de-quoted."""
    for name in names:
        raw = os.getenv(name)
        if raw is None:
            continue
        value = raw.strip()
        if not value:
            continue
        if (value.startswith('"') and value.endswith('"')) or (
            value.startswith("'") and value.endswith("'")
        ):
            value = value[1:-1].strip()
        if value:
            return value
    return ""


uri = _get_env_value("NEO4J_URI")
user = _get_env_value("NEO4J_USER", "NEO4J_USERNAME")
password = _get_env_value("NEO4J_PASSWORD")
trust_all_certs = _get_env_value("NEO4J_TRUST_ALL_CERTS").lower() in {
    "1",
    "true",
    "yes",
    "on",
}

if trust_all_certs and uri:
    if uri.startswith("neo4j+s://"):
        uri = uri.replace("neo4j+s://", "neo4j+ssc://", 1)
    elif uri.startswith("bolt+s://"):
        uri = uri.replace("bolt+s://", "bolt+ssc://", 1)

driver = GraphDatabase.driver(uri, auth=(user, password)) if uri and user and password else None


# ============================================================================
# FastAPI App
# ============================================================================

app = FastAPI(
    title="LexGraph Nexus API",
    description="Query legal document knowledge graph for contradictions and entities",
    version="1.0.0"
)

# Enable CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================================
# Health & Status
# ============================================================================

@app.get("/health")
async def health_check():
    """Check API and database health."""
    if not driver:
        return {"status": "error", "message": "Neo4j not configured"}
    
    try:
        with driver.session() as session:
            session.run("RETURN 1 AS ok").single()
        return {"status": "ok", "message": "Connected to Neo4j"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@app.get("/stats")
async def graph_stats():
    """Get overall graph statistics."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (e:Entity)
                WITH COUNT(e) as node_count
                MATCH ()-[r]->()
                RETURN node_count, COUNT(r) as edge_count
                """
            )
            record = result.single()
            if record:
                return {
                    "total_nodes": record["node_count"],
                    "total_edges": record["edge_count"]
                }
            return {"total_nodes": 0, "total_edges": 0}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Entity Search
# ============================================================================

@app.get("/entities", response_model=List[Entity])
async def search_entities(
    entity_type: Optional[str] = Query(None),
    name_contains: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500)
):
    """Search for entities by type or name fragment."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            query = "MATCH (e:Entity)"
            params = {}
            
            where_clauses = []
            if entity_type:
                where_clauses.append("e.type = $type")
                params["type"] = entity_type
            
            if name_contains:
                where_clauses.append("e.name CONTAINS $name_fragment")
                params["name_fragment"] = name_contains
            
            if where_clauses:
                query += " WHERE " + " AND ".join(where_clauses)
            
            query += " RETURN e.key AS key, e.name AS name, e.type AS type, e.description AS description LIMIT $limit"
            params["limit"] = limit
            
            result = session.run(query, params)
            return [Entity(**record) for record in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/entities/types")
async def get_entity_types():
    """Get all unique entity types in the graph."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            result = session.run("MATCH (e:Entity) RETURN DISTINCT e.type AS type ORDER BY type")
            types = [record["type"] for record in result]
            return {"types": types}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Contradiction Detection
# ============================================================================

@app.get("/contradictions", response_model=List[Contradiction])
async def find_contradictions(limit: int = Query(20, ge=1, le=100)):
    """Find potential contradictions (CONTRADICTS relationships) in the graph."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
                WHERE r.relation = 'CONTRADICTS'
                RETURN a.name AS clause_a, b.name AS clause_b, r.relation AS relation, r.reason AS reason
                LIMIT $limit
                """,
                {"limit": limit}
            )
            return [Contradiction(**record) for record in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/contradictions/{entity_name}")
async def find_contradictions_for_entity(entity_name: str, limit: int = Query(10, ge=1, le=50)):
    """Find all contradictions involving a specific entity."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
                WHERE (a.name CONTAINS $name OR b.name CONTAINS $name)
                AND r.relation = 'CONTRADICTS'
                RETURN a.name AS clause_a, b.name AS clause_b, r.relation AS relation, r.reason AS reason
                LIMIT $limit
                """,
                {"name": entity_name, "limit": limit}
            )
            return [Contradiction(**record) for record in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Relationship Queries
# ============================================================================

@app.get("/relationships", response_model=List[Relationship])
async def get_relationships(
    relation_type: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=500)
):
    """Get relationships by type (e.g., CONTRADICTS, SUPERSEDES, OBLIGATES)."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            query = "MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)"
            params = {"limit": limit}
            
            if relation_type:
                query += " WHERE r.relation = $relation"
                params["relation"] = relation_type
            
            query += " RETURN a.name AS from_name, b.name AS to_name, r.relation AS relation, r.reason AS reason LIMIT $limit"
            
            result = session.run(query, params)
            return [Relationship(**record) for record in result]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/relationships/types")
async def get_relationship_types():
    """Get all unique relationship types in the graph."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            result = session.run("MATCH ()-[r:RELATES_TO]->() RETURN DISTINCT r.relation AS relation ORDER BY relation")
            relations = [record["relation"] for record in result]
            return {"relations": relations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/graph/view", response_model=GraphView)
async def get_graph_view(limit: int = Query(180, ge=10, le=1000)):
    """Return a compact subgraph for frontend visualization."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")

    try:
        with driver.session() as session:
            result = session.run(
                """
                MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
                RETURN
                  a.key AS source_key,
                  a.name AS source_name,
                  a.type AS source_type,
                  b.key AS target_key,
                  b.name AS target_name,
                  b.type AS target_type,
                  r.relation AS relation
                LIMIT $limit
                """,
                {"limit": limit},
            )

            node_map: Dict[str, Dict] = {}
            links: List[GraphLink] = []

            for record in result:
                source_key = record["source_key"]
                target_key = record["target_key"]

                if source_key and source_key not in node_map:
                    node_map[source_key] = {
                        "key": source_key,
                        "name": record["source_name"] or "Unnamed",
                        "type": record["source_type"] or "Unknown",
                    }

                if target_key and target_key not in node_map:
                    node_map[target_key] = {
                        "key": target_key,
                        "name": record["target_name"] or "Unnamed",
                        "type": record["target_type"] or "Unknown",
                    }

                if source_key and target_key:
                    links.append(
                        GraphLink(
                            source=source_key,
                            target=target_key,
                            relation=record["relation"] or "RELATED_TO",
                        )
                    )

            nodes = [GraphNode(**node) for node in node_map.values()]
            return GraphView(nodes=nodes, links=links)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Graph Traversal
# ============================================================================

@app.get("/connected/{entity_name}")
async def get_connected_entities(entity_name: str, depth: int = Query(1, ge=1, le=3)):
    """Get all entities connected to the given entity within N hops."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            result = session.run(
                f"""
                MATCH (start:Entity {{name: $name}})-[*1..{depth}]-(connected:Entity)
                RETURN DISTINCT connected.key AS key, connected.name AS name, connected.type AS type, connected.description AS description
                LIMIT 100
                """,
                {"name": entity_name}
            )
            entities = [Entity(**record) for record in result]
            if not entities:
                raise HTTPException(status_code=404, detail=f"Entity '{entity_name}' not found")
            return entities
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Analysis Endpoints
# ============================================================================

@app.post("/analyze")
async def analyze_clauses(clauses: List[str]):
    """Analyze multiple clauses for contradictions and relationships."""
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    try:
        with driver.session() as session:
            analysis = {
                "input_clauses": clauses,
                "contradictions": [],
                "supersedes": [],
                "related": []
            }
            
            for clause in clauses:
                # Find contradictions
                result = session.run(
                    """
                    MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
                    WHERE a.name CONTAINS $clause AND r.relation = 'CONTRADICTS'
                    RETURN b.name AS entity, r.reason AS reason
                    """,
                    {"clause": clause}
                )
                for record in result:
                    analysis["contradictions"].append({
                        "clause": clause,
                        "contradicts": record["entity"],
                        "reason": record["reason"]
                    })
                
                # Find supersedes
                result = session.run(
                    """
                    MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
                    WHERE a.name CONTAINS $clause AND r.relation = 'SUPERSEDES'
                    RETURN b.name AS entity, r.reason AS reason
                    """,
                    {"clause": clause}
                )
                for record in result:
                    analysis["supersedes"].append({
                        "clause": clause,
                        "supersedes": record["entity"],
                        "reason": record["reason"]
                    })
            
            return analysis
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# Startup/Shutdown
# ============================================================================

@app.on_event("shutdown")
async def shutdown_event():
    """Close Neo4j connection on shutdown."""
    if driver:
        driver.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
