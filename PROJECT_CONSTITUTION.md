# 📋 LexGraph Nexus - Project Constitution

**Last Updated:** March 26, 2026  
**Current AI Handler:** Gemini  
**Project Stage:** Active Development - Backend Integration Phase

---

## 🎯 Project Mission

**LexGraph Nexus** is a cloud-powered GraphRAG system that analyzes legal documents to detect and explain hidden contradictions across multiple files. It helps legal teams quickly identify conflicts and inconsistencies in contract documents.

---

## 🏗️ System Architecture

```
PDF Documents
    ↓
[PDF Extractor] → Extract clean text from legal PDFs
    ↓
[Chunker] → Split into semantic chunks (500 chars, 50 char overlap)
    ↓
[Entity Extractor] → Extract entities & relationships using Gemini API
    ↓
[Neo4j AuraDB] → Store in knowledge graph
    ↓
[FastAPI Backend] → API endpoints for graph queries
    ↓
[React Frontend] → Interactive graph visualization & chat interface
```

---

## 📦 Data Files & Structure

```
lexgraph-nexus/
├── src/
│   ├── pdf_extractor.py      # Extract text from PDFs (PyMuPDF)
│   ├── chunker.py             # Split text into chunks (LangChain)
│   ├── entity_extractor.py    # Extract entities/relationships (Gemini API)
│   └── __init__.py
│
├── data/
│   ├── raw/                   # Original PDFs
│   └── processed/
│       ├── chunks.json        # ✅ [43.81 KB] - 87 chunks from sample_contract.pdf
│       ├── entities.json      # ⏳ [135.56 KB] - 183 entities + 143 relationships (40/87 chunks)
│       └── extracted_text.txt # ⚠️ Placeholder only - rerun pdf_extractor for full text
│
├── client/                    # React + Vite frontend
│   ├── src/
│   │   ├── App.jsx            # ✅ Main dashboard (150 lines) - API-ready
│   │   ├── main.jsx           # ✅ React root setup
│   │   └── styles.css         # ✅ Complete styling with theme
│   ├── package.json           # ✅ React 19.2.4, Vite 8
│   ├── vite.config.js         # ✅ Vite configuration
│   └── index.html             # ✅ HTML5 entry
│
├── notebooks/                 # Jupyter notebooks for exploration
├── test_api.py                # API testing script
├── list_models.py             # Gemini models exploration
├── requirements.txt           # ✅ All Python dependencies installed
├── .env                       # API keys (GEMINI_API_KEY, NEO4J_*)
├── README.md                  # User-facing documentation
└── PROJECT_CONSTITUTION.md    # THIS FILE - AI handoff guide
```

---

## 🔄 Current Progress

### ✅ Completed
- **PDF Extraction:** sample_contract.pdf fully extracted (10 pages, text + metadata)
- **Text Chunking:** 87 semantic chunks created (500 char size, 50 char overlap)
- **React Frontend:** Fully built dashboard with graph visualization, entity search, stats display
  - App.jsx: Complete interactive UI (~150 lines)
  - styles.css: Full styling with theme, responsive layout
  - API-ready with fetch integration to backend endpoints
- **Graph Builder Class:** `graph_builder.py` mostly implemented with node/relationship upsert methods
- **Python Dependencies:** All packages installed (PyMuPDF, LangChain, Neo4j, FastAPI, Uvicorn, Pydantic)

### ⏳ In Progress
- **Entity Extraction:** 40/87 chunks processed (46% complete) via Gemini 2.5 Flash-Lite
  - **Extracted So Far:** 183 entities + 143 relationships
  - **Rate Limit Issue:** Processing paused during chunk extraction (10 req/min free tier limit)
  - **To Resume:** Run `python src/entity_extractor.py` with resume flag (skips chunks 1-40)
  - **Estimated Remaining Time:** ~5 minutes for final 47 chunks
- **FastAPI Backend:** Skeleton in place (`graph_api.py`)
  - ✅ Health check endpoint implemented
  - ✅ Pydantic models defined
  - ❌ Main query endpoints stubbed (/stats, /entities, /contradictions, /graph/view)
  - ❌ Contradiction detection logic not implemented

### 📋 Queued
- Load extracted entities into Neo4j AuraDB (currently empty)
- Complete FastAPI query endpoints
- Implement contradiction detection algorithm
- Natural language Q&A interface
- Test end-to-end workflow

---

## 🔐 Environment Setup

### Required API Key
```
GEMINI_API_KEY=your_key_here
```
- Location: `.env` file (git-ignored)
- Service: Google Gemini 2.5 Flash-Lite
- Rate limit: 10 requests/minute (free tier)
- Pricing: Free for development

### Python Environment
```bash
# Activate virtual environment
venv\Scripts\Activate.ps1  # Windows PowerShell

# Install dependencies
pip install -r requirements.txt
```

### Dependencies
- **pymupdf** (PyMuPDF) - PDF text extraction
- **langchain** - Text splitting & RAG
- **python-dotenv** - Environment variable management
- **requests** - HTTP for Gemini API calls
- **json** - Standard library for data handling

---

## 📊 Data Flow & Processing

### Step 1: PDF Extraction (COMPLETED ✅)
**File:** `src/pdf_extractor.py`  
**Input:** `data/raw/sample_contract.pdf`  
**Output:** `data/processed/extracted_text.txt`

```python
extract_text_from_pdf("path/to/pdf.pdf")
# Returns: {
#   "document_name": "sample_contract.pdf",
#   "full_text": "...",
#   "total_pages": 25,
#   "pages_data": [...]
# }
```

### Step 2: Text Chunking (COMPLETED ✅)
**File:** `src/chunker.py`  
**Input:** `data/processed/extracted_text.txt`  
**Output:** `data/processed/chunks.json`

```python
chunk_document(pdf_data, chunk_size=500, chunk_overlap=50)
# Creates: 87 chunks with metadata
# Structure: {
#   "document_name": "sample_contract.pdf",
#   "chunks": [
#     {"chunk_id": "chunk_1", "text": "...", "word_count": 75},
#     ...
#   ]
# }
```

### Step 3: Entity Extraction (IN PROGRESS ⏳) - 46% Complete
**File:** `src/entity_extractor.py`  
**Input:** `data/processed/chunks.json`  
**Output:** `data/processed/entities.json`

**Current Status:**
- ✅ Chunks 1-40 processed successfully
- 📊 **183 entities** extracted (Party, Clause, Date, Document, Obligation types)
- 📊 **143 relationships** extracted (CONTRADICTS, SUPERSEDES, DEFINES, OBLIGATES, REQUIRES)
- ⏳ Chunks 41-87 still pending (~5 min processing time remaining)

**Example of Extracted Data:**
```json
{
  "document": "sample_contract.pdf",
  "total_chunks_processed": 40,
  "total_nodes": 183,
  "total_edges": 143,
  "nodes": [
    {
      "type": "Party",
      "name": "SANTA CRUZ COUNTY REGIONAL TRANSPORTATION COMMISSION",
      "description": "Party identified as COMMISSION"
    }
  ],
  "edges": [
    {
      "from": "Clause 5",
      "to": "Clause 12",
      "relation": "CONTRADICTS",
      "reason": "Why they conflict"
    }
  ]
}
```

### Step 4: Graph Database (NOT STARTED ❌)
**File:** `src/graph_builder.py` (skeleton implemented, not yet connected)  
**Status:** Classes built but Neo4j AuraDB not yet provisioned  
**Next Actions:**
- Provision Neo4j AuraDB instance
- Add credentials to `.env`
- Run `python src/graph_builder.py` to load entities.json into database
- Verify nodes and relationships indexed properly

### Step 5: Backend API (PARTIAL ⏳)
**File:** `src/graph_api.py`  
**Status:** Health endpoint functional, main query endpoints stubbed  
**Implemented:**
- ✅ FastAPI app setup with CORS
- ✅ `/health` endpoint
- ✅ Pydantic response models defined

**Still Needed:**
- ❌ `GET /stats` - entity/relationship counts
- ❌ `GET /entities` - list entities with filtering
- ❌ `GET /contradictions` - find conflicting clauses
- ❌ `POST /graph/view` - return graph JSON for visualization
- ❌ Contradiction detection logic (complex N-clause analysis)

### Step 6: Frontend (PARTIAL ✅)
**Framework:** React 19 + Vite + CSS  
**Status:** UI fully built and styled, awaiting backend endpoints  
**Implemented:**
- ✅ Dashboard layout with project header
- ✅ Graph visualization panel (ready for React Force Graph)
- ✅ Entity browser with search
- ✅ Contradiction list display
- ✅ Statistics dashboard
- ✅ CSV export functionality
- ✅ API integration code (fetch calls to backend endpoints ready)

**Waiting For:**
Working backend endpoints to display real data

---

## 🚀 How to Continue the Project

### **CRITICAL BLOCKER #1:** Resume Entity Extraction (46% Complete)

```bash
# 1. Activate virtual environment
venv\Scripts\Activate.ps1

# 2. Resume entity extraction from chunk 41 (skips already-processed 1-40)
python src/entity_extractor.py
```

**Progress:**
- ✅ Chunks 1-40 already processed (183 entities, 143 relationships extracted)
- ⏳ Will process chunks 41-87 (47 remaining chunks)
- 💾 Auto-saves progress after each batch
- ⚠️ Rate limit: 10 requests/minute (Gemini free tier) → ~5 minutes total
- ✅ Can be stopped with Ctrl+C and resumed later

### **CRITICAL BLOCKER #2:** Set Up Neo4j AuraDB & Load Data

1. Sign up for free at [Neo4j AuraDB](https://neo4j.com/cloud/aura/)
2. Create a graph database instance
3. Add credentials to `.env`:
   ```
   NEO4J_URI=neo4j+s://[connection]
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=your_password
   ```
4. Run: `python src/graph_builder.py` (loads entities.json → Neo4j)
   - Creates nodes for each entity (Party, Clause, Date, etc.)
   - Creates edges for relationships (CONTRADICTS, SUPERSEDES, etc.)
   - Currently database is empty—this step persists the 183 entities

### **CRITICAL BLOCKER #3:** Complete FastAPI Backend

In `src/graph_api.py`, implement:
```python
# 1. GET /stats - Return entity and relationship counts
@app.get("/stats")
async def get_stats():
    # Return {"total_entities": 183, "total_relationships": 143, ...}

# 2. GET /entities - List all entities with filtering
@app.get("/entities")
async def get_entities(entity_type: Optional[str] = None):
    # Return paginated entities from Neo4j

# 3. GET /contradictions - Find conflicting clauses
@app.get("/contradictions")
async def get_contradictions():
    # Query Neo4j for CONTRADICTS relationships
    # Return list of conflicting clause pairs with explanations

# 4. POST /graph/view - Get graph visualization data
@app.post("/graph/view")
async def get_graph(entity_type: Optional[str] = None):
    # Return nodes and links for React Force Graph visualization
    # Currently frontend expects: {"nodes": [...], "links": [...]}
```

Frontend (`App.jsx`) is **ready to call** these endpoints—just need implementation.

### **Sequence for Completion:**

1. ✅ Resume entity extraction (finalize all 87 chunks)
2. ✅ Set up Neo4j and load data
3. ✅ Implement remaining `/stats`, `/entities`, `/contradictions`, `/graph/view` endpoints
4. ✅ Start frontend dev server and test with backend
5. ⏳ Implement contradiction detection logic
6. ⏳ Add Q&A interface (optional for MVP)

Create `frontend/` directory with React app.

---

## ⚠️ Known Issues & Solutions

### Issue 1: Rate Limiting
**Problem:** Gemini API rate limit (10 req/min) causing interrupts  
**Solution:** Script updated with graceful resume capability  
**Status:** ✅ RESOLVED - Can pause and continue anytime

### Issue 2: API Key Missing
**Problem:** GEMINI_API_KEY not found in .env  
**Solution:** Add your API key to `.env` file in project root  
**Format:** `GEMINI_API_KEY=your_actual_key_here`

### Issue 3: Virtual Environment Issues
**Problem:** Dependencies not installed  
**Solution:**
```bash
python -m venv venv
venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

---

## 📝 Testing & Validation

### Run Tests
```bash
python test_api.py         # Test Gemini API connectivity
python list_models.py      # List available Gemini models
```

### Check Progress
```bash
# View current entities (first 50 lines)
Get-Content data\processed\entities.json | Select-Object -First 50

# Check chunk count
(Get-Content data\processed\chunks.json | ConvertFrom-Json).chunks.Count
```

---

## 💡 Key Technical Decisions

1. **Chunking Strategy:** Recursive character splitter with semantic separators
   - Won't split sentences mid-way
   - Preserves context with 50-char overlap
   - 500-char chunks balance detail vs. API costs

2. **API Choice:** Gemini 2.5 Flash-Lite (not GPT-4)
   - Lower cost (free tier available)
   - Faster response times
   - Sufficient accuracy for legal entity extraction
   - ⚠️ Rate limited but manageable with batching

3. **Entity Types:** Party, Clause, Date, Document, Obligation
   - Covers main legal document components
   - Can be extended for specific use cases

4. **Relationship Types:** CONTRADICTS, SUPERSEDES, DEFINES, OBLIGATES, REQUIRES
   - Captures legal logic flows
   - Enables contradiction detection

---

## 🔧 Handoff to Gemini: What It Should Know

✅ **Gemini understands:**
- Python code structure and syntax
- JSON/data format specifications
- API integration patterns
- Resume/resumable processing logic
- Rate limiting and pagination

❌ **Gemini may NOT remember:**
- Previous conversation context (each new chat starts fresh)
- Your .env file contents (won't see API keys)
- File system state changes mid-conversation
- Real-time terminal output (needs screenshots/logs)

---

## 🎯 EXECUTIVE SUMMARY FOR GEMINI

**Project:** LexGraph Nexus - GraphRAG system for legal document contradiction detection

**Current Status (March 26, 2026):**
- **Data Processing:** 46% complete (40/87 chunks extracted, 183 entities, 143 relationships)
- **Backend:** Skeleton + health check only, needs 4 query endpoints implemented
- **Frontend:** Fully built and styled, ready for backend integration
- **Database:** No Neo4j instance provisioned yet (empty)

**Immediate Next Steps (in order):**

1. **Resume Entity Extraction (5 min)**
   - Command: `python src/entity_extractor.py`
   - Skips chunks 1-40 (already done), processes 41-87
   - Safe to interrupt with Ctrl+C and resume later

2. **Provision Neo4j & Load Graph (10 min)**
   - Sign up at neo4j.com/cloud/aura/ (free tier)
   - Add credentials to .env file
   - Run: `python src/graph_builder.py`

3. **Complete Backend Endpoints (30-60 min)**
   - In `src/graph_api.py`, implement:
     - `/stats` → return entity/relationship counts
     - `/entities` → return filtered entities from Neo4j
     - `/contradictions` → return pairs with CONTRADICTS relationships
     - `/graph/view` → return nodes+links for visualization

4. **Frontend Integration Testing**
   - Run: `npm run dev` (from client/ directory)
   - Test API calls to verify backend endpoints work
   - Display real data in dashboard

**Key Files to Focus On:**
- `src/entity_extractor.py` - Resume processing (line 1)
- `src/graph_builder.py` - Load to Neo4j (mostly done, just call it)
- `src/graph_api.py` - Implement 4 endpoints (skeleton ready)
- `client/src/App.jsx` - Frontend (fully done, just waiting for API)
- `data/processed/entities.json` - Current extraction results (183 nodes, 143 edges)

**MVP Success Criteria:**
- ✅ All 87 chunks processed for entities
- ✅ Data loaded into Neo4j
- ✅ 4 backend endpoints returning real data
- ✅ Frontend displaying graph + contradictions from database

**Not Needed Yet for MVP:**
- Natural language Q&A interface
- Advanced contradiction detection algorithm
- Multi-document support
- User authentication

✅ **To ensure continuity:**
- This document explains everything needed
- Code is well-commented
- Data format is explicit in examples
- Process is deterministic and resumable
- Progress is auto-saved after each batch

---

## 📞 Communication Tips for Next AI Handler

When you talk to Gemini (or another AI):

1. **Share this document first**
   ```
   "Here's our project constitution. Please review it."
   ```

2. **For code changes, provide context:**
   ```
   "I need to update entity_extractor.py to handle [specific issue].
    Current approach: [brief explanation].
    Proposed change: [what you want to do]."
   ```

3. **For debugging, include error logs:**
   ```
   [Full error traceback from terminal]
   "This happens when I run [command]."
   ```

4. **For design decisions:**
   ```
   "Should we [option A] or [option B]?
    Option A pros: [...]
    Option B pros: [...]
    Constraints: [...]"
   ```

5. **For review/handoff:**
   ```
   "Review PROJECT_CONSTITUTION.md and:
    1. Check current progress
    2. Identify next steps
    3. Suggest improvements
    4. Ask clarifying questions"
   ```

---

## 📚 File Reference Guide

| File | Purpose | Status |
|------|---------|--------|
| `src/pdf_extractor.py` | Extract text from PDFs | ✅ Complete |
| `src/chunker.py` | Split into semantic chunks | ✅ Complete |
| `src/entity_extractor.py` | Extract entities/relationships | ⏳ 20/87 chunks |
| `data/processed/extracted_text.txt` | Raw extracted text | ✅ Ready |
| `data/processed/chunks.json` | 87 semantic chunks | ✅ Ready |
| `data/processed/entities.json` | Extracted entities (20 chunks) | ⏳ In progress |
| `.env` | API keys & config | 🔐 Not in git |
| `requirements.txt` | Python dependencies | ✅ Ready |
| `README.md` | User documentation | ✅ Public docs |
| `PROJECT_CONSTITUTION.md` | AI handoff guide | ✅ THIS FILE |

---

## 🎓 Learning Resources

For Gemini (or any AI handler) to understand the tech stack:

- **PyMuPDF (pymupdf):** PDF text extraction library
- **LangChain:** Text splitting, embeddings, RAG workflows
- **Gemini API:** Google's large language model API
- **Neo4j:** Graph database for relationships
- **FastAPI:** Modern Python web framework
- **React:** Frontend JavaScript framework

---

## 📝 Next Session Checklist

- [ ] Review this PROJECT_CONSTITUTION.md
- [ ] Check `data/processed/entities.json` for current progress
- [ ] Count remaining chunks: 87 total - 20 processed = 67 remaining
- [ ] Verify `.env` has GEMINI_API_KEY
- [ ] Activate virtual environment
- [ ] Run: `python src/entity_extractor.py` to resume extraction
- [ ] Monitor progress for API rate limits
- [ ] Save progress after each batch
- [ ] Plan Neo4j integration for next phase

---

**Status:** Ready for Gemini handoff ✅  
**Last Verified:** March 25, 2026  
**Questions?** Review this document or check code comments.
