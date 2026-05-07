# Dify Lite

`Dify Lite` is a slimmed-down local prototype inspired by Dify's RAG architecture.

It keeps only the backbone needed for downstream customization:

- document import
- text cleaning and chunking
- indexing into Weaviate
- retrieval
- optional OpenAI-compatible model invocation
- frontend-friendly REST APIs

## What this removes

Compared with full Dify, this prototype does not include:

- multi-tenant account system
- console/workspace management
- workflow orchestration
- plugin marketplace
- agent/tool ecosystem
- billing, permissions and team collaboration

## API surface

- `GET /api/health`
- `GET /api/config`
- `GET /api/collections`
- `POST /api/collections`
- `GET /api/documents?collection_id=...`
- `POST /api/documents/import`
- `POST /api/retrieval/query`
- `POST /api/chat/completions`

## Run locally

```powershell
cd E:\Dify\dify-lite
python run.py
```

Then open `http://127.0.0.1:8088/`.

## Environment variables

See `.env.example`.

## Notes

- The default embedding engine is a deterministic hash embedding so the system can run without an external embedding model.
- If you set an OpenAI-compatible chat endpoint, `POST /api/chat/completions` will use it.
- If no model endpoint is configured, chat falls back to retrieval-only mock answers while keeping the same API contract.
