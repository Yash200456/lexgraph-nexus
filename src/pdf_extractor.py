"""
PDF Text Extraction Module
Extracts clean text from legal PDF documents
"""

import pymupdf  # PyMuPDF
from pathlib import Path
from typing import Dict, List


def extract_text_from_pdf(pdf_path: str) -> Dict[str, any]:
    """
    Extract text from a PDF file with metadata.
    
    Args:
        pdf_path: Path to the PDF file
        
    Returns:
        Dictionary containing text, metadata, and page information
    """
    pdf_path = Path(pdf_path)
    
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF not found: {pdf_path}")
    
    # Open PDF
    doc = pymupdf.open(pdf_path)
    
    # Save page count BEFORE closing document
    total_pages = len(doc)
    
    # Extract text from all pages
    full_text = ""
    pages_data = []
    
    for page_num in range(total_pages):
        page = doc[page_num]
        page_text = page.get_text()
        
        # Clean the text
        cleaned_text = clean_text(page_text)
        
        full_text += cleaned_text + "\n\n"
        
        pages_data.append({
            "page_number": page_num + 1,
            "text": cleaned_text,
            "char_count": len(cleaned_text)
        })
    
    doc.close()
    
    return {
        "filename": pdf_path.name,
        "full_text": full_text.strip(),
        "total_pages": total_pages,
        "pages": pages_data,
        "total_chars": len(full_text)
    }


def clean_text(text: str) -> str:
    """
    Clean extracted text by removing extra whitespace and fixing formatting.
    
    Args:
        text: Raw text from PDF
        
    Returns:
        Cleaned text
    """
    # Remove excessive whitespace
    text = " ".join(text.split())
    
    # Fix common PDF extraction issues
    text = text.replace("\x00", "")  # Remove null characters
    text = text.replace("\uf0b7", "•")  # Fix bullet points
    
    return text


def save_extracted_text(data: Dict, output_path: str):
    """
    Save extracted text to a file.
    
    Args:
        data: Dictionary from extract_text_from_pdf
        output_path: Where to save the text file
    """
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(f"Document: {data['filename']}\n")
        f.write(f"Total Pages: {data['total_pages']}\n")
        f.write(f"Total Characters: {data['total_chars']}\n")
        f.write("=" * 80 + "\n\n")
        f.write(data['full_text'])
    
    print(f"✅ Saved extracted text to: {output_path}")


# Test function
if __name__ == "__main__":
    # This runs when you execute this file directly
    test_pdf = "data/raw/sample_contract.pdf"
    
    try:
        print("🔍 Extracting text from PDF...")
        result = extract_text_from_pdf(test_pdf)
        
        print(f"\n📄 Document: {result['filename']}")
        print(f"📊 Pages: {result['total_pages']}")
        print(f"📝 Characters: {result['total_chars']}")
        print(f"\n📖 First 500 characters:\n{result['full_text'][:500]}...")
        
        # Save to processed folder
        save_extracted_text(result, "data/processed/extracted_text.txt")
        
    except FileNotFoundError:
        print("⚠️ No test PDF found. Add a PDF to data/raw/sample_contract.pdf")
    except Exception as e:
        print(f"❌ Error: {e}")