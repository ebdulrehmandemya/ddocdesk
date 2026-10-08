from pypdf import PdfReader
from docx import Document as DocxDocument
import io

def extract_text(file_bytes: bytes, mime_type: str) -> str:
    if mime_type == "application/pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        text = ""
        for page in reader.pages:
            text += page.extract_text() + "\n"
        return text.strip()
        
    elif mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        doc = DocxDocument(io.BytesIO(file_bytes))
        text = ""
        for para in doc.paragraphs:
            text += para.text + "\n"
        return text.strip()
        
    elif mime_type == "text/plain":
        return file_bytes.decode("utf-8", errors="replace")
        
    else:
        raise ValueError(f"Unsupported mime type: {mime_type}")
