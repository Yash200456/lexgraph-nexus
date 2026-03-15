"""
Text Chunking Module
Intelligently splits legal documents into semantic chunks
"""

from langchain_text_splitters import RecursiveCharacterTextSplitter
from typing import List, Dict
import json
from pathlib import Path


def chunk_text(text: str, chunk_size: int = 500, chunk_overlap: int = 50) -> List[Dict]:
    """
    Split text into semantic chunks using LangChain's intelligent splitter.
    
    Args:
        text: Full document text
        chunk_size: Target size for each chunk (in characters)
        chunk_overlap: Overlap between chunks to preserve context
        
    Returns:
        List of dictionaries containing chunk data and metadata
    """
    # Initialize the text splitter
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""]  # Smart splitting hierarchy
    )
    
    # Split the text
    chunks = text_splitter.split_text(text)
    
    # Add metadata to each chunk
    chunked_data = []
    for idx, chunk in enumerate(chunks):
        chunked_data.append({
            "chunk_id": f"chunk_{idx + 1}",
            "chunk_index": idx,
            "text": chunk,
            "char_count": len(chunk),
            "word_count": len(chunk.split())
        })
    
    return chunked_data


def chunk_document(pdf_data: Dict, chunk_size: int = 500, chunk_overlap: int = 50) -> Dict:
    """
    Chunk an entire document with page-level metadata.
    
    Args:
        pdf_data: Dictionary from pdf_extractor.extract_text_from_pdf()
        chunk_size: Target chunk size
        chunk_overlap: Overlap between chunks
        
    Returns:
        Dictionary with chunked data and document metadata
    """
    # Get the full text
    full_text = pdf_data['full_text']
    
    # Chunk it
    chunks = chunk_text(full_text, chunk_size, chunk_overlap)
    
    # Add document-level metadata
    result = {
        "document_name": pdf_data['filename'],
        "total_pages": pdf_data['total_pages'],
        "total_chunks": len(chunks),
        "chunk_size": chunk_size,
        "chunk_overlap": chunk_overlap,
        "chunks": chunks
    }
    
    return result


def save_chunks(chunked_data: Dict, output_path: str):
    """
    Save chunked data to JSON file.
    
    Args:
        chunked_data: Dictionary from chunk_document()
        output_path: Path to save JSON file
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(chunked_data, f, indent=2, ensure_ascii=False)
    
    print(f"✅ Saved {chunked_data['total_chunks']} chunks to: {output_path}")


# Test function
if __name__ == "__main__":
    # Import the PDF extractor
    import sys
    sys.path.append('src')
    from pdf_extractor import extract_text_from_pdf
    
    test_pdf = "data/raw/sample_contract.pdf"
    
    try:
        print("📄 Step 1: Extracting text from PDF...")
        pdf_data = extract_text_from_pdf(test_pdf)
        print(f"   ✅ Extracted {pdf_data['total_chars']} characters from {pdf_data['total_pages']} pages")
        
        print("\n✂️  Step 2: Chunking the text...")
        chunked_data = chunk_document(pdf_data, chunk_size=500, chunk_overlap=50)
        print(f"   ✅ Created {chunked_data['total_chunks']} chunks")
        
        print("\n📊 Sample chunks:")
        for i, chunk in enumerate(chunked_data['chunks'][:3]):  # Show first 3
            print(f"\n   Chunk {i+1}:")
            print(f"   - ID: {chunk['chunk_id']}")
            print(f"   - Words: {chunk['word_count']}")
            print(f"   - Preview: {chunk['text'][:100]}...")
        
        print("\n💾 Step 3: Saving chunks...")
        save_chunks(chunked_data, "data/processed/chunks.json")
        
        print("\n🎉 Phase 2 Complete!")
        
    except FileNotFoundError:
        print("⚠️ No test PDF found. Add a PDF to data/raw/sample_contract.pdf")
    except Exception as e:
        print(f"❌ Error: {e}")