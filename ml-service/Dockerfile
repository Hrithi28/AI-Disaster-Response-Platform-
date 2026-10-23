FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt requirements-nlp.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# spaCy NER for locations (set --build-arg INSTALL_SPACY=false for a smaller image)
ARG INSTALL_SPACY=true
RUN if [ "$INSTALL_SPACY" = "true" ]; then pip install --no-cache-dir -r requirements-nlp.txt; fi
COPY app ./app
COPY data ./data
RUN mkdir -p models
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
