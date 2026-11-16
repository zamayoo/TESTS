FROM python:3.10-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates git libsndfile1 build-essential && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY server/voice-requirements.txt /app/voice-requirements.txt
RUN pip install --no-cache-dir 'torch==2.1.2+cpu' --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir -r voice-requirements.txt \
    && apt-get purge -y --auto-remove build-essential \
    && rm -rf /var/lib/apt/lists/*
COPY server/ /app/server/
COPY dist/questions.json /app/questions.json
COPY dist/ /app/dist/
ENV PYTHONUNBUFFERED=1
ENV VOICE_DIR=/models
EXPOSE 8080
CMD ["sh", "-c", "python /app/server/download_modern_voice.py >/tmp/modern-voice-install.log 2>&1 & python /app/server/download_voice.py >/tmp/voice-install.log 2>&1 & exec uvicorn server.main:app --host 0.0.0.0 --port 8080 --proxy-headers --forwarded-allow-ips 127.0.0.1"]
