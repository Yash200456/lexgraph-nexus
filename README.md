# ⚖️ LexGraph Nexus: AI-Powered Legal GraphRAG

![Python](https://img.shields.io/badge/Python-3.11+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-009688.svg)
![Neo4j](https://img.shields.io/badge/Neo4j-AuraDB-4c8ed9.svg)
![React](https://img.shields.io/badge/React-19.2-61dafb.svg)
![Tailwind](https://img.shields.io/badge/Tailwind_CSS-3.4-38b2ac.svg)

## 📌 Overview
**LexGraph Nexus** is a Legal-Tech web application that uses **GraphRAG (Retrieval-Augmented Generation + Knowledge Graphs)** to detect contradictions and hidden dependencies in legal contracts.

Instead of relying only on plain text search, the system extracts legal entities (Parties, Clauses, Dates, Obligations) and relationships (CONTRADICTS, SUPERSEDES, OBLIGATES, etc.), stores them in **Neo4j AuraDB**, and visualizes the graph in a modern interactive React dashboard.

## 🚀 Why This Project Matters
- Legal contracts are long and cross-referential; contradictions are easy to miss manually.
- Graph-based modeling enables multi-hop reasoning across clauses and entities.
- The dashboard gives fast visual and analytical insight for legal review workflows.

## ✨ Key Features
- **AI entity extraction pipeline:** PDF -> cleaned text -> chunking -> Gemini-based extraction.
- **Knowledge graph storage:** Nodes and edges are persisted in Neo4j using transactional upserts.
- **Graph API with FastAPI:** Query stats, entities, relationships, contradictions, and subgraph views.
- **Interactive dashboard:** Force-directed graph, filters, search, relationship explorer, and detail modal.
- **Built-in analytics:** Entity distribution, relationship bar chart, timeline view, and top connected entities.
- **Export tools:** Graph PNG, CSV, and JSON exports from the frontend.

## 🧠 System Architecture
1. **Ingestion Layer**
   - Extract text from legal PDFs (`src/pdf_extractor.py`)
   - Chunk documents for LLM processing (`src/chunker.py`)

2. **AI Extraction Layer**
   - Gemini-driven extraction of entities + relationships (`src/entity_extractor.py`)
   - Output persisted as structured JSON in `data/processed/`

3. **Graph Persistence Layer**
   - Load/merge graph records into Neo4j (`src/graph_builder.py`)

4. **Backend API Layer**
   - FastAPI service for graph queries and contradiction analysis (`src/graph_api.py`)

5. **Frontend Layer**
   - React + Vite + Tailwind client (`client/`)
   - Force graph visualization + analytics + dark mode

## 💻 Tech Stack
- **Frontend:** React 19, Vite, Tailwind CSS, React-Force-Graph-2D, Recharts, Lucide React
- **Backend:** Python, FastAPI, Uvicorn, Pydantic, Neo4j Python Driver
- **Data/AI:** PyMuPDF, LangChain Text Splitters, Google Gemini API
- **Database:** Neo4j AuraDB (Cypher)

## 🔌 API Endpoints (Current)
- `GET /health` - Service and Neo4j connectivity status
- `GET /stats` - Total graph nodes and edges
- `GET /entities` - Entity search/filter endpoint
- `GET /entities/types` - Distinct entity types
- `GET /relationships` - Relationship listing/filter
- `GET /relationships/types` - Distinct relationship types
- `GET /contradictions` - Contradicting clause pairs
- `GET /graph/view` - Graph payload for frontend visualization
- `GET /connected/{entity_name}` - N-hop connected entities
- `POST /analyze` - Clause analysis helper endpoint

## 🛠️ Local Development

### Prerequisites
- Python 3.11+
- Node.js 18+
- Neo4j AuraDB instance
- Gemini API key

### 1. Clone + Backend Setup
```bash
git clone https://github.com/Yash200456/lexgraph-nexus.git
cd lexgraph-nexus

python -m venv venv
venv\Scripts\activate

pip install -r requirements.txt
```

Create `.env` in the project root:
```env
NEO4J_URI=neo4j+s://...
NEO4J_USER=neo4j
NEO4J_PASSWORD=...
GEMINI_API_KEY=...
```

Run backend:
```bash
uvicorn src.graph_api:app --reload
```

### 2. Frontend Setup
```bash
cd client
npm install
npm run dev
```

Frontend: `http://localhost:5173` (or next free Vite port)  
API docs: `http://localhost:8000/docs`

## 📂 Repository Structure
```text
lexgraph-nexus/
├── src/
│   ├── pdf_extractor.py
│   ├── chunker.py
│   ├── entity_extractor.py
│   ├── graph_builder.py
│   └── graph_api.py
├── data/
│   ├── raw/
│   └── processed/
├── client/
│   ├── src/
│   ├── package.json
│   └── tailwind.config.js
└── requirements.txt
```

## 📈 Portfolio Highlights
- End-to-end AI pipeline from raw legal PDF to visual graph intelligence.
- Practical GraphRAG implementation with Neo4j + FastAPI + React.
- Production-style dashboard UX with modern frontend tooling.
- Demonstrates data modeling, API design, and AI-assisted information extraction.

## 🧭 Roadmap
- Improve contradiction scoring and explanation quality.
- Add authentication and multi-document workspace support.
- Add deployment workflow (Docker + cloud hosting).

## 📜 License
For academic/portfolio use. Add a LICENSE file for open-source distribution.
