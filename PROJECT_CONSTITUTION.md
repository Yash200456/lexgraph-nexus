# 📋 LexGraph Nexus - Project Constitution

**Last Updated:** March 25, 2026  
**Current AI Handler:** Gemini (Claude transitioning to Gemini)  
**Project Stage:** Active Development - Entity Extraction Phase

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
│       ├── chunks.json        # Extracted and chunked text [87 chunks from sample_contract.pdf]
│       ├── entities.json      # Extracted entities & relationships [20/87 chunks processed]
│       └── extracted_text.txt # Full extracted text
│
├── notebooks/                 # Jupyter notebooks for exploration
├── requirements.txt           # Python dependencies
├── .env                      # API keys (GEMINI_API_KEY)
├── README.md                 # User-facing documentation
└── PROJECT_CONSTITUTION.md   # THIS FILE - AI handoff guide
```

---

## 🔄 Current Progress

### ✅ Completed
- **PDF Extraction:** sample_contract.pdf fully extracted (text + metadata)
- **Text Chunking:** 87 semantic chunks created (500 char size, 50 char overlap)
- **Entity Extraction:** 20/87 chunks processed through Gemini 2.5 Flash-Lite
  - **Extracted:** 98 entities (Party, Clause, Date types)
  - **Relationships:** 80 relationships (CONTRADICTS, SUPERSEDES, OBLIGATES, etc.)

### ⏸️ In Progress
- **Entity Extraction Resume:** Process resuming from chunk 21/87
  - Previous attempt interrupted at chunk 24 (rate limit)
  - Script updated with resume capability (skips already-processed chunks)
  - Rate limit: 10 requests/minute on free tier
  - Estimated time: ~9 minutes for remaining 67 chunks

### 📋 Queued
- Graph database setup (Neo4j AuraDB)
- FastAPI backend development
- React frontend with visualization
- Contradiction detection logic
- Natural language Q&A interface

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

### Step 3: Entity Extraction (IN PROGRESS ⏳)
**File:** `src/entity_extractor.py`  
**Input:** `data/processed/chunks.json`  
**Output:** `data/processed/entities.json`

```python
extract_from_all_chunks(
    chunks_file="data/processed/chunks.json",
    entities_file="data/processed/entities.json",
    resume=True  # NEW: Resume from chunk 21
)
```

**Extraction Types:**
- **Nodes (Entities):** Party, Clause, Date, Document, Obligation
- **Edges (Relationships):** CONTRADICTS, SUPERSEDES, DEFINES, OBLIGATES, REQUIRES

**Example Output:**
```json
{
  "document": "sample_contract.pdf",
  "total_chunks_processed": 20,
  "total_nodes": 98,
  "total_edges": 80,
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
**Next Phase:** Load entities into Neo4j AuraDB
- Create nodes for each entity
- Create edges for relationships
- Index by entity type for fast querying

### Step 5: Backend API (NOT STARTED ❌)
**Framework:** FastAPI
- Endpoints for graph queries
- Contradiction detection logic
- Natural language processing integration

### Step 6: Frontend (NOT STARTED ❌)
**Framework:** React + Tailwind CSS + React Force Graph
- Interactive graph visualization
- Chat interface for queries
- Filtering and search capabilities

---

## 🚀 How to Continue the Project

### Immediate: Resume Entity Extraction

```bash
# 1. Activate virtual environment
venv\Scripts\Activate.ps1

# 2. Run entity extraction (will resume from chunk 21)
python src/entity_extractor.py
```

**What happens:**
- ✅ Skips chunks 1-20 (already processed)
- ⏳ Processes chunks 21-87
- 💾 Auto-saves progress after each batch of 10
- ⚠️ Can be stopped anytime with Ctrl+C and resumed later

### Next: Set Up Neo4j AuraDB

1. Sign up for free at [Neo4j AuraDB](https://neo4j.com/cloud/aura/)
2. Create a graph database instance
3. Note the connection string and credentials
4. Add to `.env`:
   ```
   NEO4J_URI=neo4j+s://[connection]
   NEO4J_USER=neo4j
   NEO4J_PASSWORD=your_password
   ```

### Then: Build FastAPI Backend

Create `src/graph_api.py`:
- Load entities from JSON
- Push to Neo4j
- Create query endpoints
- Implement contradiction detection

### Finally: Build React Frontend

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
