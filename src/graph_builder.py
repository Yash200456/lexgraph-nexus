"""
Graph builder for loading extracted legal entities and relationships into Neo4j.
"""

import json
import os
import sys
from pathlib import Path
from typing import Dict, List

from dotenv import load_dotenv
from neo4j import GraphDatabase
from neo4j.exceptions import AuthError, ServiceUnavailable

load_dotenv(override=True)


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


def _safe_key(value: str) -> str:
    """Create a stable key fragment from free text."""
    return "_".join(value.strip().lower().split())


def make_node_key(node_type: str, name: str) -> str:
    """Build a stable unique key for nodes."""
    return f"{_safe_key(node_type)}::{_safe_key(name)}"


class GraphBuilder:
    """Build and persist a legal knowledge graph in Neo4j."""

    def __init__(self, uri: str, user: str, password: str, trust_all_certs: bool = False) -> None:
        if trust_all_certs:
            if uri.startswith("neo4j+s://"):
                uri = uri.replace("neo4j+s://", "neo4j+ssc://", 1)
            elif uri.startswith("bolt+s://"):
                uri = uri.replace("bolt+s://", "bolt+ssc://", 1)
        self.driver = GraphDatabase.driver(uri, auth=(user, password))

    def close(self) -> None:
        self.driver.close()

    def verify_connection(self) -> None:
        """Fail fast if connection/authentication is invalid."""
        with self.driver.session() as session:
            session.run("RETURN 1 AS ok").single()

    def ensure_constraints(self) -> None:
        """Create constraints/indexes required for idempotent upserts."""
        with self.driver.session() as session:
            session.run(
                "CREATE CONSTRAINT entity_key_unique IF NOT EXISTS "
                "FOR (e:Entity) REQUIRE e.key IS UNIQUE"
            )

    def upsert_node(self, node: Dict) -> str:
        """Upsert a node and return its generated key."""
        node_type = str(node.get("type", "Unknown")).strip() or "Unknown"
        name = str(node.get("name", "Unnamed")).strip() or "Unnamed"
        description = str(node.get("description", "")).strip()
        key = make_node_key(node_type, name)

        query = (
            "MERGE (e:Entity {key: $key}) "
            "ON CREATE SET e.created_at = datetime() "
            "SET e.name = $name, e.type = $type, e.description = $description, "
            "    e.updated_at = datetime()"
        )

        with self.driver.session() as session:
            session.run(
                query,
                {
                    "key": key,
                    "name": name,
                    "type": node_type,
                    "description": description,
                },
            )

        return key

    def upsert_relationship(
        self,
        from_key: str,
        to_key: str,
        relation: str,
        reason: str,
        chunk_id: str,
    ) -> None:
        """Upsert an edge as a typed property-based relationship."""
        query = (
            "MATCH (a:Entity {key: $from_key}) "
            "MATCH (b:Entity {key: $to_key}) "
            "MERGE (a)-[r:RELATES_TO {relation: $relation, chunk_id: $chunk_id}]->(b) "
            "SET r.reason = $reason, r.updated_at = datetime()"
        )

        with self.driver.session() as session:
            session.run(
                query,
                {
                    "from_key": from_key,
                    "to_key": to_key,
                    "relation": relation,
                    "reason": reason,
                    "chunk_id": chunk_id,
                },
            )

    def build_from_entities_data(self, entities_data: Dict) -> Dict[str, int]:
        """Load nodes and edges from extracted entities JSON structure."""
        extractions = entities_data.get("raw_extractions", [])
        if not extractions:
            return {"nodes": 0, "edges": 0}

        node_name_index: Dict[str, List[str]] = {}
        node_count = 0
        edge_count = 0

        for extraction in extractions:
            chunk_id = extraction.get("chunk_id", "unknown_chunk")
            nodes = extraction.get("nodes", [])
            edges = extraction.get("edges", [])

            for node in nodes:
                node_key = self.upsert_node(node)
                node_count += 1

                name = str(node.get("name", "")).strip().lower()
                if name:
                    node_name_index.setdefault(name, [])
                    if node_key not in node_name_index[name]:
                        node_name_index[name].append(node_key)

            for edge in edges:
                from_name = str(edge.get("from", "")).strip()
                to_name = str(edge.get("to", "")).strip()
                relation = str(edge.get("relation", "RELATED_TO")).strip() or "RELATED_TO"
                reason = str(edge.get("reason", "")).strip()

                if not from_name or not to_name:
                    continue

                from_candidates = node_name_index.get(from_name.lower(), [])
                to_candidates = node_name_index.get(to_name.lower(), [])

                if from_candidates:
                    from_key = from_candidates[0]
                else:
                    from_key = self.upsert_node(
                        {"type": "Unknown", "name": from_name, "description": "Auto-created from edge"}
                    )
                    node_name_index.setdefault(from_name.lower(), []).append(from_key)
                    node_count += 1

                if to_candidates:
                    to_key = to_candidates[0]
                else:
                    to_key = self.upsert_node(
                        {"type": "Unknown", "name": to_name, "description": "Auto-created from edge"}
                    )
                    node_name_index.setdefault(to_name.lower(), []).append(to_key)
                    node_count += 1

                self.upsert_relationship(from_key, to_key, relation, reason, chunk_id)
                edge_count += 1

        return {"nodes": node_count, "edges": edge_count}


def load_entities_file(path: str = "data/processed/entities.json") -> Dict:
    """Load entities JSON produced by entity extraction pipeline."""
    file_path = Path(path)
    if not file_path.exists():
        raise FileNotFoundError(f"Entities file not found: {file_path}")

    with open(file_path, "r", encoding="utf-8") as f:
        return json.load(f)


def run_build(entities_path: str = "data/processed/entities.json") -> None:
    """Run graph build process end-to-end."""
    uri = _get_env_value("NEO4J_URI")
    user = _get_env_value("NEO4J_USER", "NEO4J_USERNAME")
    password = _get_env_value("NEO4J_PASSWORD")
    trust_all_certs = _get_env_value("NEO4J_TRUST_ALL_CERTS") .lower() in {
        "1",
        "true",
        "yes",
        "on",
    }

    if not uri or not user or not password:
        raise ValueError(
            "Missing Neo4j credentials. Set NEO4J_URI, NEO4J_PASSWORD, and either "
            "NEO4J_USER or NEO4J_USERNAME in .env"
        )

    builder = GraphBuilder(uri, user, password, trust_all_certs=trust_all_certs)

    try:
        builder.verify_connection()
        builder.ensure_constraints()
        entities_data = load_entities_file(entities_path)
        stats = builder.build_from_entities_data(entities_data)
        print(f"Graph build complete. Nodes processed: {stats['nodes']}, edges processed: {stats['edges']}")
    except AuthError:
        print("Neo4j authentication failed.")
        print("Check NEO4J_USERNAME/NEO4J_USER and NEO4J_PASSWORD in .env.")
        print("If needed, reset the Neo4j Aura password and update .env.")
        sys.exit(1)
    except ServiceUnavailable:
        print("Neo4j is unreachable.")
        print("Check NEO4J_URI and network access. If your network uses SSL inspection, keep NEO4J_TRUST_ALL_CERTS=true.")
        sys.exit(1)
    finally:
        builder.close()


if __name__ == "__main__":
    run_build()
