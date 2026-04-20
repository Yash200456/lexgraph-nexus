"""
FastAPI backend for querying the legal knowledge graph.
Provides endpoints for contradiction detection, entity search, and graph analysis.
"""

import os
import re
from typing import List, Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from neo4j import GraphDatabase
from neo4j.exceptions import AuthError, ServiceUnavailable
import requests

load_dotenv(override=True)


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


class QueryRequest(BaseModel):
    """Request model for natural language Q&A."""
    query: str


def _is_date_like(text: str) -> bool:
    if not text:
        return False
    value = text.strip()
    if re.search(r"\b\d{4}-\d{2}-\d{2}\b", value):
        return True
    if re.search(r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b", value):
        return True
    if re.search(r"\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)\w*\b", value, re.IGNORECASE):
        return True
    if "date" in value.lower() or "term" in value.lower() or "expire" in value.lower():
        return True
    return False


def _compact_graph_context(entities: List[Dict], relationships: List[Dict]) -> str:
    entity_lines = []
    for e in entities[:8]:
        entity_lines.append(f"- {e['name']} ({e['type']}): {e.get('description', '').strip()[:120]}")

    rel_lines = []
    for r in relationships[:8]:
        reason = (r.get("reason") or "").strip()
        reason_suffix = f" ({reason[:110]})" if reason else ""
        rel_lines.append(f"- {r['from_name']} {r['relation']} {r['to_name']}{reason_suffix}")

    sections = ["Graph evidence:"]
    if entity_lines:
        sections.append("Entities:")
        sections.extend(entity_lines)
    if rel_lines:
        sections.append("Relationships:")
        sections.extend(rel_lines)

    return "\n".join(sections)


def _heuristic_fallback_answer(query: str, entities: List[Dict], relationships: List[Dict]) -> str:
    q = query.lower()
    direct_answer = "I could not find a direct answer in the graph evidence yet."

    if any(token in q for token in ["expire", "expiry", "expiration", "end date", "term", "terminate"]):
        date_candidates = [e for e in entities if e.get("type") == "Date" or _is_date_like(e.get("name", ""))]
        if date_candidates:
            direct_answer = f"Possible relevant date/term reference: {date_candidates[0].get('name', 'Not specified')}"
        else:
            term_clause = next((e for e in entities if _is_date_like(e.get("description", ""))), None)
            if term_clause:
                direct_answer = f"A likely term-related clause is: {term_clause.get('name', 'Unknown clause')}"

    evidence_entities = [f"- {e['name']} ({e['type']})" for e in entities[:5]]
    evidence_rels = [f"- {r['from_name']} {r['relation']} {r['to_name']}" for r in relationships[:5]]

    lines = [
        f"Direct answer: {direct_answer}",
        "",
        "Top evidence:",
    ]
    if evidence_entities:
        lines.extend(evidence_entities)
    if evidence_rels:
        lines.append("")
        lines.append("Key relationships:")
        lines.extend(evidence_rels)

    return "\n".join(lines)


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

print("=" * 60)
print("🔍 NEO4J CONNECTION DEBUG")
print("=" * 60)
print(f"URI: {uri}")
print(f"User: {user}")
print(f"Password exists: {bool(password)}")
print(f"Driver created: {driver is not None}")

if driver:
    try:
        with driver.session() as test_session:
            test_session.run("RETURN 1 AS test").single()
            print("✅ Neo4j connection test: SUCCESS")
    except Exception as e:
        print(f"❌ Neo4j connection test FAILED: {e}")
        print(f"❌ Error type: {type(e).__name__}")
else:
    print("❌ Driver was not created - check .env credentials")
print("=" * 60)


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
# Natural Language Q&A
# ============================================================================

@app.post("/api/query")
async def query_contract(request: QueryRequest):
    """
    Natural language Q&A about the legal document.
    Uses graph context + LLM reasoning.
    """
    if not driver:
        raise HTTPException(status_code=500, detail="Neo4j not configured")
    
    query = request.query.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query cannot be empty")
    
    try:
        # Step 1: Extract keywords from question
        keywords = query.lower().split()
        # Remove common stop words
        stop_words = {'are', 'is', 'the', 'a', 'an', 'and', 'or', 'in', 'of', 'to', 'for', 'with', 'this', 'that', 'what', 'when', 'where', 'how', 'why', 'does', 'do', 'did', 'can', 'any', 'there'}
        keywords = [k for k in keywords if k not in stop_words and len(k) > 2]
        
        with driver.session() as session:
            # Step 2: Find matching entities based on keywords
            result = session.run(
                """
                MATCH (e:Entity)
                WHERE ANY(word IN $keywords WHERE toLower(e.name) CONTAINS word 
                       OR toLower(e.description) CONTAINS word)
                RETURN e.key AS key, e.name AS name, e.type AS type, e.description AS description
                LIMIT 15
                """,
                {"keywords": keywords}
            )
            entities = [dict(record) for record in result]
            
            if not entities:
                return {
                    "answer": "I couldn't find any relevant entities for your question. Try asking about specific parties, clauses, dates, or obligations mentioned in the document.",
                    "sources": [],
                    "relationships": [],
                    "graph_nodes": []
                }
            
            # Step 3: Get relationships for these entities
            entity_keys = [e['key'] for e in entities]
            result = session.run(
                """
                MATCH (a:Entity)-[r:RELATES_TO]->(b:Entity)
                WHERE a.key IN $keys OR b.key IN $keys
                RETURN a.name AS from_name, b.name AS to_name, 
                       r.relation AS relation, r.reason AS reason
                LIMIT 20
                """,
                {"keys": entity_keys}
            )
            relationships = [dict(record) for record in result]
        
        # Step 4: Build compact context from graph data
        context = _compact_graph_context(entities, relationships)
        
        # Step 5: Send to Gemini for reasoning
        gemini_api_key = os.getenv('GEMINI_API_KEY')
        if not gemini_api_key:
            return {
                "answer": f"Based on the document context:\n\n{context}\n\n(Note: Gemini API is not configured for full reasoning. Showing raw data instead.)",
                "sources": entities,
                "relationships": relationships,
                "graph_nodes": entity_keys
            }
        
        model_candidates = [
            os.getenv("GEMINI_QUERY_MODEL", "gemini-2.0-flash").strip(),
            "gemini-1.5-flash",
        ]

        prompt = f"""You are a legal document analyst. Answer the user's question using ONLY the provided context.

Context from legal document:
{context}

User Question: {query}

Instructions:
    - Start with one line: "Direct answer: ..."
    - Then add at most 5 short bullet points of evidence
    - If answer is uncertain, state uncertainty briefly
    - Never write long paragraphs

Answer:"""
        
        payload = {
            "contents": [{
                "parts": [{"text": prompt}]
            }]
        }
        
        for model_name in model_candidates:
            if not model_name:
                continue
            gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={gemini_api_key}"
            try:
                response = requests.post(gemini_url, json=payload, timeout=30)
                if response.status_code != 200:
                    continue

                result = response.json()
                candidates = result.get("candidates", [])
                if not candidates:
                    continue

                parts = candidates[0].get("content", {}).get("parts", [])
                if parts and parts[0].get("text"):
                    return {
                        "answer": parts[0]["text"].strip(),
                        "sources": entities,
                        "relationships": relationships,
                        "graph_nodes": entity_keys,
                    }
            except requests.RequestException:
                continue

        # Graceful concise fallback when Gemini is unavailable.
        return {
            "answer": _heuristic_fallback_answer(query, entities, relationships),
            "sources": entities,
            "relationships": relationships,
            "graph_nodes": entity_keys,
        }
        
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
