FROM python:3.12-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY server/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r requirements.txt
COPY server/ /app/server/
COPY dist/questions.json /app/questions.json
COPY dist/ /app/dist/
ENV PYTHONUNBUFFERED=1
ENV VOICE_DIR=/models
EXPOSE 8080
CMD ["sh", "-c", "python /app/server/download_voice.py >/tmp/voice-install.log 2>&1 & exec uvicorn server.main:app --host 0.0.0.0 --port 8080 --proxy-headers --forwarded-allow-ips 127.0.0.1"]
