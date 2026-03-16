"""
AI Entity Extraction Module
Uses Gemini to extract legal entities and relationships from text chunks
"""

from google import genai
from google.genai import types
import json
import os
from pathlib import Path
from typing import List, Dict
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure Gemini client
client = genai.Client(api_key=os.getenv('GEMINI_API_KEY'))


def extract_entities_from_chunk(chunk_text: str, chunk_id: str) -> Dict:
    """
    Extract legal entities and relationships from a text chunk using Gemini.
    
    Args:
        chunk_text: The text to analyze
        chunk_id: Identifier for this chunk
        
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
    
    try:
        # Call Gemini API with new SDK
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt
        )
        
        # Parse the response
        response_text = response.text.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith('```'):
            response_text = response_text.split('```')[1]
            if response_text.startswith('json'):
                response_text = response_text[4:]
        
        # Parse JSON
        data = json.loads(response_text)
        
        # Add chunk_id to metadata
        data['chunk_id'] = chunk_id
        data['success'] = True
        
        return data
        
    except Exception as e:
        print(f"❌ Error processing chunk {chunk_id}: {e}")
        return {
            "chunk_id": chunk_id,
            "nodes": [],
            "edges": [],
            "success": False,
            "error": str(e)
        }


def extract_from_all_chunks(chunks_file: str = "data/processed/chunks.json") -> Dict:
    """
    Process all chunks and extract entities.
    
    Args:
        chunks_file: Path to chunks JSON file
        
    Returns:
        Combined extraction results
    """
    chunks_file = Path(chunks_file)
    
    if not chunks_file.exists():
        raise FileNotFoundError(f"Chunks file not found: {chunks_file}")
    
    # Load chunks
    with open(chunks_file, 'r', encoding='utf-8') as f:
        chunks_data = json.load(f)
    
    chunks = chunks_data['chunks']
    total_chunks = len(chunks)
    
    print(f"🤖 Processing {total_chunks} chunks with Gemini AI...")
    print(f"📊 This will take ~{total_chunks * 3} seconds ({total_chunks} API calls)\n")
    
    all_extractions = []
    all_nodes = []
    all_edges = []
    
    for i, chunk in enumerate(chunks, 1):
        print(f"⏳ Processing chunk {i}/{total_chunks}...", end=" ")
        
        result = extract_entities_from_chunk(
            chunk['text'],
            chunk['chunk_id']
        )
        
        if result['success']:
            all_extractions.append(result)
            all_nodes.extend(result['nodes'])
            all_edges.extend(result['edges'])
            print(f"✅ Found {len(result['nodes'])} entities, {len(result['edges'])} relationships")
        else:
            print(f"⚠️ Failed")
    
    # Combine results
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
    
    print(f"\n✅ Saved entities to: {output_path}")


# Test function
if __name__ == "__main__":
    import time
    
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
        save_entities(entities)
        
        elapsed = time.time() - start_time
        print(f"\n⏱️ Total time: {elapsed:.1f} seconds")
        print(f"\n🎉 Phase 3A Complete: Entity Extraction Done!")
        
    except FileNotFoundError as e:
        print(f"❌ Error: {e}")
        print("💡 Make sure you ran chunker.py first!")
    except Exception as e:
        print(f"❌ Error: {e}")