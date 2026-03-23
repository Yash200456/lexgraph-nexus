"""
AI Entity Extraction Module
Uses Gemini API with proper rate limiting and incremental saving
"""

import requests
import json
import os
from pathlib import Path
from typing import List, Dict
from dotenv import load_dotenv
import time

# Load environment variables
load_dotenv()

GEMINI_API_KEY = os.getenv('GEMINI_API_KEY')
GEMINI_API_URL = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key={GEMINI_API_KEY}"

# Free tier rate limit: 10 requests per minute
REQUESTS_PER_MINUTE = 10
RATE_LIMIT_DELAY = 60  # seconds


def extract_entities_from_chunk(chunk_text: str, chunk_id: str, max_retries: int = 3) -> Dict:
    """
    Extract legal entities and relationships from a text chunk using Gemini.
    
    Args:
        chunk_text: The text to analyze
        chunk_id: Identifier for this chunk
        max_retries: Maximum number of retry attempts
        
    Returns:
        Dictionary containing nodes (entities) and edges (relationships)
    """
    
    # Create the prompt
    prompt = f"""
You are a legal document analyzer. Extract entities and relationships from this legal text.

TEXT:
{chunk_text}

Extract and return ONLY valid JSON in this exact format (no markdown, no extra text):
{{
  "nodes": [
    {{"type": "Party", "name": "Company Name", "description": "Brief description"}},
    {{"type": "Clause", "name": "Section 5", "description": "What this clause states"}},
    {{"type": "Date", "name": "2024-01-15", "description": "Effective date"}}
  ],
  "edges": [
    {{"from": "Clause 5", "to": "Clause 12", "relation": "CONTRADICTS", "reason": "Why they conflict"}},
    {{"from": "Party A", "to": "Clause 3", "relation": "OBLIGATES", "reason": "What obligation"}}
  ]
}}

RULES:
- Extract parties (companies, people)
- Extract clauses/sections with their key points
- Extract important dates
- Identify relationships: CONTRADICTS, SUPERSEDES, DEFINES, OBLIGATES, REQUIRES
- Return ONLY the JSON, nothing else
"""
    
    # Retry logic
    for attempt in range(max_retries):
        try:
            # Prepare request payload
            payload = {
                "contents": [{
                    "parts": [{
                        "text": prompt
                    }]
                }]
            }
            
            # Call Gemini API
            response = requests.post(
                GEMINI_API_URL,
                headers={"Content-Type": "application/json"},
                json=payload,
                timeout=30
            )
            
            # Handle rate limiting
            if response.status_code == 429:
                if attempt < max_retries - 1:
                    wait_time = 60  # Wait full minute on rate limit
                    print(f"⏸️ Rate limit, waiting {wait_time}s...", end=" ", flush=True)
                    time.sleep(wait_time)
                    continue
                else:
                    raise Exception("Rate limit exceeded after retries")
            
            # Handle high demand
            if response.status_code == 503:
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"⏸️ High demand, waiting {wait_time}s...", end=" ", flush=True)
                    time.sleep(wait_time)
                    continue
                else:
                    raise Exception("Model overloaded after retries")
            
            if response.status_code != 200:
                raise Exception(f"API returned {response.status_code}: {response.text}")
            
            # Parse response
            result = response.json()
            response_text = result['candidates'][0]['content']['parts'][0]['text'].strip()
            
            # Remove markdown code blocks if present
            if response_text.startswith('```'):
                response_text = response_text.split('```')[1]
                if response_text.startswith('json'):
                    response_text = response_text[4:]
                response_text = response_text.rsplit('```', 1)[0]
            
            # Parse JSON
            data = json.loads(response_text)
            
            # Add chunk_id to metadata
            data['chunk_id'] = chunk_id
            data['success'] = True
            
            return data
            
        except Exception as e:
            if attempt == max_retries - 1:
                print(f"Error: {e}")
                return {
                    "chunk_id": chunk_id,
                    "nodes": [],
                    "edges": [],
                    "success": False,
                    "error": str(e)
                }
            else:
                time.sleep(1)


def extract_from_all_chunks(chunks_file: str = "data/processed/chunks.json") -> Dict:
    """
    Process all chunks and extract entities with rate limiting.
    Saves progress after each batch to prevent data loss.
    
    Args:
        chunks_file: Path to chunks JSON file
        
    Returns:
        Combined extraction results
    """
    chunks_file = Path(chunks_file)
    
    if not chunks_file.exists():
        raise FileNotFoundError(f"Chunks file not found: {chunks_file}")
    
    # Initial wait to ensure quota is reset
    print("⏸️  Waiting 60 seconds to ensure API quota is fresh...\n")
    time.sleep(60)
    
    # Load chunks
    with open(chunks_file, 'r', encoding='utf-8') as f:
        chunks_data = json.load(f)
    
    chunks = chunks_data['chunks']
    total_chunks = len(chunks)
    
    # Calculate estimated time
    batches = (total_chunks + REQUESTS_PER_MINUTE - 1) // REQUESTS_PER_MINUTE
    estimated_minutes = batches
    
    print(f"🤖 Processing {total_chunks} chunks with Gemini 2.5 Flash-Lite...")
    print(f"⏱️  Rate limit: {REQUESTS_PER_MINUTE} requests/minute")
    print(f"📊 Estimated time: ~{estimated_minutes} minutes ({batches} batches)")
    print(f"💾 Progress will be saved after each batch of 10 chunks\n")
    
    all_extractions = []
    all_nodes = []
    all_edges = []
    request_count = 0
    batch_start_time = time.time()
    
    for i, chunk in enumerate(chunks, 1):
        # Rate limiting: Wait after every 10 requests
        if request_count >= REQUESTS_PER_MINUTE:
            # Save progress before waiting
            print(f"\n💾 Saving progress... ({len(all_extractions)} chunks processed)")
            combined = {
                "document": chunks_data['document_name'],
                "total_chunks_processed": len(all_extractions),
                "total_nodes": len(all_nodes),
                "total_edges": len(all_edges),
                "nodes": all_nodes,
                "edges": all_edges,
                "raw_extractions": all_extractions
            }
            save_entities(combined)
            
            elapsed = time.time() - batch_start_time
            wait_time = max(0, RATE_LIMIT_DELAY - elapsed)
            if wait_time > 0:
                print(f"⏸️  Rate limit: Waiting {int(wait_time)}s before next batch...\n")
                time.sleep(wait_time)
            request_count = 0
            batch_start_time = time.time()
        
        print(f"⏳ Processing chunk {i}/{total_chunks}...", end=" ", flush=True)
        
        result = extract_entities_from_chunk(
            chunk['text'],
            chunk['chunk_id']
        )
        
        request_count += 1
        
        if result['success']:
            all_extractions.append(result)
            all_nodes.extend(result['nodes'])
            all_edges.extend(result['edges'])
            print(f"✅ Found {len(result['nodes'])} entities, {len(result['edges'])} relationships")
        else:
            print(f"⚠️ Failed")
        
        # Small delay between requests
        time.sleep(0.5)
    
    # Final save
    combined = {
        "document": chunks_data['document_name'],
        "total_chunks_processed": len(all_extractions),
        "total_nodes": len(all_nodes),
        "total_edges": len(all_edges),
        "nodes": all_nodes,
        "edges": all_edges,
        "raw_extractions": all_extractions
    }
    
    return combined


def save_entities(entities_data: Dict, output_path: str = "data/processed/entities.json"):
    """
    Save extracted entities to JSON file.
    
    Args:
        entities_data: Dictionary from extract_from_all_chunks
        output_path: Where to save the file
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(entities_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Saved to: {output_path}")


# Test function
if __name__ == "__main__":
    
    try:
        print("🚀 Starting AI Entity Extraction...\n")
        
        start_time = time.time()
        
        # Extract entities
        entities = extract_from_all_chunks()
        
        # Show summary
        print(f"\n{'='*60}")
        print(f"📊 EXTRACTION SUMMARY")
        print(f"{'='*60}")
        print(f"Document: {entities['document']}")
        print(f"Chunks Processed: {entities['total_chunks_processed']}")
        print(f"Total Entities: {entities['total_nodes']}")
        print(f"Total Relationships: {entities['total_edges']}")
        
        # Show sample entities
        print(f"\n📋 Sample Entities:")
        for node in entities['nodes'][:5]:
            print(f"  - {node['type']}: {node['name']}")
        
        # Show sample relationships
        if entities['edges']:
            print(f"\n🔗 Sample Relationships:")
            for edge in entities['edges'][:5]:
                print(f"  - {edge['from']} → {edge['relation']} → {edge['to']}")
        
        # Save results
        print(f"\n💾 Final save...")
        save_entities(entities)
        
        elapsed = time.time() - start_time
        print(f"\n⏱️ Total time: {elapsed/60:.1f} minutes")
        print(f"\n🎉 Phase 3A Complete: Entity Extraction Done!")
        
    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        print("💡 Make sure you ran chunker.py first!")
    except Exception as e:
        print(f"❌ Error: {e}")