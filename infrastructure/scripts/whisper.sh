cd backend
source venv/bin/activate

# Install huggingface-hub if not already installed
pip install huggingface-hub

# Download models to local cache
hf download Systran/faster-whisper-base
hf download YOUR_USERNAME/whisper-sorani-model
hf download YOUR_USERNAME/whisper-kurmanji-model