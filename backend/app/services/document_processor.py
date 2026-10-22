import uuid
import io
import os
import tempfile
import mimetypes
import subprocess
from pathlib import Path

from pypdf import PdfReader
from docx import Document as DocxDocument
from qdrant_client.http.models import PointStruct
from sqlalchemy.ext.asyncio import AsyncSession

# OCR Imports
import pytesseract
from pdf2image import convert_from_bytes

# Audio Imports
from faster_whisper import WhisperModel

from app.services.qdrant_client import qdrant_client, COLLECTION_NAME
from app.services.embeddings import get_embeddings_batch
from app.models.document import DocumentChunk

# ─── Audio Extensions ────────────────────────────────────────────────────────

AUDIO_EXTENSIONS = {".mp3", ".wav", ".m4a", ".ogg", ".flac", ".webm", ".mp4"}

AUDIO_MIME_TYPES = {
    "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4",
    "audio/x-m4a", "audio/m4a", "audio/ogg", "audio/flac",
    "audio/webm", "audio/aac", "video/mp4", "video/webm",
}

EXTENSION_MAP = {
    ".mp3": ".mp3", ".wav": ".wav", ".m4a": ".m4a",
    ".ogg": ".ogg", ".flac": ".flac", ".webm": ".webm", ".mp4": ".mp4",
}

# ─── Multi-Language Model Registry ───────────────────────────────────────────

# Languages handled by the default Whisper model (all 99 official languages)
# Just listed here for clarity — detection returns these codes automatically
OFFICIAL_LANGUAGES = {
    # High-resource languages
    "en", "es", "fr", "de", "it", "pt", "nl", "ru", "ja", "zh", "ko",
    "ar", "hi", "tr", "pl", "uk", "vi", "th", "id", "ms", "fa", "he",
    # Medium-resource languages
    "cs", "da", "el", "fi", "hu", "ro", "sk", "sv", "bg", "hr", "et",
    "lt", "lv", "sl", "sr", "ca", "gl", "eu", "is", "mk", "sq", "mt",
    "az", "ka", "hy", "kk", "uz", "ky", "tg", "tk", "mn",
    "bn", "gu", "kn", "ml", "mr", "ne", "pa", "si", "ta", "te", "ur",
    "my", "km", "lo", "sw", "yo", "ha", "ig", "zu", "xh", "af",
    "am", "so", "ps", "sd", "ku",  # Kurdish may be misdetected — see below
    # Low-resource / special
    "la", "sa", "bo", "jw", "su", "tl", "haw", "mi", "sm", "to", "fj",
    "ht", "mg", "ln", "oc", "br", "cy", "gd", "ga", "fo", "lb", "rm",
    "an", "ast", "wa", "li", "sc", "co", "nap", "scn", "vec", "lmo",
}

# Fine-tuned models for languages Whisper handles poorly
# Customize these model IDs based on your needs (see HuggingFace)
SPECIAL_MODELS = {
    # Kurdish Sorani (Central Kurdish) — Arabic script
    "ckb": "AmanSagar1997/whisper-small-ku",
    
    # Kurdish Kurmanji (Northern Kurdish) — Latin script  
    "kmr": "AmanSagar1997/whisper-small-ku",
    
    # Persian — use official Whisper with forced language (better than fine-tunes)
    "fa": None,  # None = use default model with forced language
    
    # Add more fine-tuned models here as needed:
    # "sdh": "some-model/whisper-southern-kurdish",
    # "he": "some-model/whisper-hebrew-finetuned",
}

# ─── Whisper Model Cache (lazy-loaded) ───────────────────────────────────────

_whisper_models: dict[str, WhisperModel] = {}

def get_whisper_model(model_id: str) -> WhisperModel:
    """Load a Whisper model by ID, caching it for reuse."""
    if model_id not in _whisper_models:
        print(f"🎙️ Loading Whisper model: {model_id}...")
        _whisper_models[model_id] = WhisperModel(
            model_id,
            device="cpu",       # Change to "cuda" if you have an NVIDIA GPU
            compute_type="int8" # int8 = fastest on CPU, use float16 on GPU
        )
        print(f"✅ Model {model_id} loaded")
    return _whisper_models[model_id]


def format_timestamp(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


# ─── Language Detection ──────────────────────────────────────────────────────

def detect_language(tmp_path: str) -> tuple[str, float]:
    """
    Quick language detection using the default Whisper model.
    Returns (language_code, confidence).
    """
    model = get_whisper_model("base")
    _, info = model.transcribe(
        tmp_path,
        language=None,           # Auto-detect
        beam_size=1,             # Fast detection pass
        vad_filter=True,
        condition_on_previous_text=False,
        word_timestamps=False,
    )
    return info.language, info.language_probability


# ─── Transcription ───────────────────────────────────────────────────────────

def transcribe_audio(file_bytes: bytes, mime_type: str, file_name: str) -> str:
    """
    Transcribe audio with language-aware model selection.
    Converts audio to WAV first to avoid PyAV compatibility issues.
    """
    # Determine file extension
    ext = Path(file_name).suffix.lower()
    if ext not in EXTENSION_MAP:
        ext = mimetypes.guess_extension(mime_type) or ".mp3"
    suffix = EXTENSION_MAP.get(ext, ".mp3")
    
    tmp_path = None
    wav_path = None
    try:
        # Write to temp file
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name
        
        # Convert to WAV using ffmpeg (bypasses PyAV compatibility issues)
        wav_path = tmp_path.rsplit(".", 1)[0] + ".wav"
        import subprocess
        
        print(f"🔄 Converting {Path(file_name).name} to WAV...")
        convert_result = subprocess.run(
            [
                "ffmpeg", "-y",           # Overwrite output file
                "-i", tmp_path,           # Input file
                "-vn",                    # No video (extract audio only)
                "-acodec", "pcm_s16le",   # WAV PCM format
                "-ar", "16000",           # 16kHz sample rate (Whisper's native rate)
                "-ac", "1",               # Mono channel
                wav_path,
            ],
            capture_output=True,
            text=True,
            timeout=300,  # 5 minute timeout for large files
        )
        
        if convert_result.returncode != 0:
            print(f"❌ ffmpeg conversion failed: {convert_result.stderr}")
            raise RuntimeError(f"Audio conversion failed: {convert_result.stderr[:200]}")
        
        print(f"✅ Converted to WAV ({os.path.getsize(wav_path) / 1024:.0f} KB)")
        
        # ─── Step 1: Detect language ───
        print(f"🔍 Detecting language for {file_name}...")
        detected_lang, confidence = detect_language(wav_path)
        print(f"🌍 Detected language: {detected_lang} ({confidence:.0%})")
        
        # ─── Step 2: Pick the right model ───
        if detected_lang in SPECIAL_MODELS:
            fine_tuned = SPECIAL_MODELS[detected_lang]
            if fine_tuned:
                model = get_whisper_model(fine_tuned)
                language_param = None
                model_desc = f"fine-tuned ({fine_tuned})"
            else:
                model = get_whisper_model("base")
                language_param = detected_lang
                model_desc = f"default + forced '{detected_lang}'"
        else:
            model = get_whisper_model("base")
            language_param = detected_lang
            model_desc = f"default + detected '{detected_lang}'"
        
        # ─── Step 3: Full transcription ───
        print(f"🎙️ Transcribing with {model_desc}...")
        segments, info = model.transcribe(
            wav_path,
            language=language_param,
            beam_size=5,
            vad_filter=True,
            word_timestamps=False,
        )
        
        full_text = []
        for segment in segments:
            timestamp = f"[{format_timestamp(segment.start)} - {format_timestamp(segment.end)}]"
            full_text.append(f"{timestamp} {segment.text.strip()}")
        
        result = "\n".join(full_text)
        print(f"✅ Transcription complete: {len(result)} chars, language={info.language}")
        return result
        
    except Exception as e:
        print(f"❌ Transcription failed: {e}")
        import traceback
        traceback.print_exc()
        raise
    finally:
        # Clean up temp files
        for path in [tmp_path, wav_path]:
            if path and os.path.exists(path):
                try:
                    os.unlink(path)
                except Exception:
                    pass


# ─── Helper: Detect if file is audio ─────────────────────────────────────────

def is_audio_file(mime_type: str, file_name: str) -> bool:
    if mime_type in AUDIO_MIME_TYPES:
        return True
    ext = Path(file_name).suffix.lower()
    return ext in AUDIO_EXTENSIONS


# ─── Main Text Extraction ────────────────────────────────────────────────────

def extract_text(file_bytes: bytes, mime_type: str, file_name: str = "") -> str:
    # 1. Audio files
    if is_audio_file(mime_type, file_name):
        return transcribe_audio(file_bytes, mime_type, file_name)
    
    # 2. PDF
    if mime_type == "application/pdf":
        reader = PdfReader(io.BytesIO(file_bytes))
        standard_text = "\n".join([page.extract_text() or "" for page in reader.pages]).strip()
        
        if len(standard_text) > 100:
            return standard_text
            
        print("🔍 No text found in PDF. Running OCR...")
        try:
            images = convert_from_bytes(file_bytes)
            ocr_text = []
            for i, image in enumerate(images):
                page_text = pytesseract.image_to_string(image)
                ocr_text.append(f"--- Page {i+1} ---\n{page_text}")
            final_text = "\n".join(ocr_text).strip()
            print(f"✅ OCR complete. Extracted {len(final_text)} characters.")
            return final_text
        except Exception as e:
            print(f"❌ OCR Failed: {e}")
            return standard_text

    # 3. Word document
    if mime_type == "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        doc = DocxDocument(io.BytesIO(file_bytes))
        return "\n".join([p.text for p in doc.paragraphs]).strip()
        
    # 4. Plain text
    if mime_type == "text/plain":
        return file_bytes.decode("utf-8", errors="replace")
    
    # 5. Other text-like formats
    ext = Path(file_name).suffix.lower() if file_name else ""
    if ext in {".txt", ".md", ".csv", ".json", ".xml"}:
        return file_bytes.decode("utf-8", errors="replace")
    
    raise ValueError(f"Unsupported mime type: {mime_type} (file: {file_name})")


# ─── Chunking & Indexing ─────────────────────────────────────────────────────

def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
    if not text:
        return []
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end])
        start += chunk_size - overlap
    return chunks


async def index_document(document_id: uuid.UUID, workspace_id: uuid.UUID, text: str, db: AsyncSession):
    chunks = chunk_text(text)
    if not chunks:
        return

    db_chunks = [
        DocumentChunk(
            document_id=document_id,
            workspace_id=workspace_id,
            chunk_index=i,
            text=chunk
        ) for i, chunk in enumerate(chunks)
    ]
    db.add_all(db_chunks)
    await db.flush()

    vectors = await get_embeddings_batch(chunks)

    points = []
    for db_chunk, vector in zip(db_chunks, vectors):
        points.append(
            PointStruct(
                id=str(db_chunk.id),
                vector=vector,
                payload={
                    "document_id": str(document_id),
                    "workspace_id": str(workspace_id),
                    "chunk_index": db_chunk.chunk_index,
                    "text": db_chunk.text
                }
            )
        )

    qdrant_client.upsert(
        collection_name=COLLECTION_NAME,
        points=points
    )
