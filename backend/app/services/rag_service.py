"""RAG Evolution Layer — ChromaDB-based error memory & retrieval-augmented prompting.

Stores human correction events as vector embeddings, retrieves similar past
errors when processing new images, and injects negative prompts to prevent
repeated mistakes.
"""
from __future__ import annotations

import hashlib
import logging
from typing import Any, Optional

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings

logger = logging.getLogger(__name__)

_client: Optional[chromadb.HttpClient] = None
COLLECTION_NAME = "error_memory"


def _get_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(
            host=settings.chromadb_host,
            port=settings.chromadb_port,
        )
    return _client


def _get_collection():
    client = _get_client()
    return client.get_or_create_collection(
        name=COLLECTION_NAME,
        metadata={"hnsw:space": "cosine"},
    )


def store_correction(
    image_id: int,
    original_prediction: dict[str, Any],
    human_correction: dict[str, Any],
    context_description: str = "",
    image_embedding: list[float] | None = None,
):
    """Store a human correction event into the vector database.

    When a user manually corrects an auto-generated annotation, this records
    the error for future retrieval.
    """
    try:
        collection = _get_collection()

        doc_text = (
            f"Error type: {_classify_error(original_prediction, human_correction)}. "
            f"Model predicted '{original_prediction.get('class_name', 'unknown')}' "
            f"but human corrected to '{human_correction.get('class_name', 'removed')}'. "
            f"Context: {context_description}"
        )

        doc_id = hashlib.md5(
            f"{image_id}_{original_prediction}_{human_correction}".encode()
        ).hexdigest()

        metadata = {
            "image_id": str(image_id),
            "error_type": _classify_error(original_prediction, human_correction),
            "model_prediction": original_prediction.get("class_name", ""),
            "human_correction": human_correction.get("class_name", "removed"),
            "context": context_description[:500],
        }

        kwargs: dict[str, Any] = {
            "ids": [doc_id],
            "documents": [doc_text],
            "metadatas": [metadata],
        }
        if image_embedding:
            kwargs["embeddings"] = [image_embedding]

        collection.upsert(**kwargs)
        logger.info("Stored correction: %s", doc_id)

    except Exception as e:
        logger.warning("Failed to store correction in ChromaDB: %s", e)


def retrieve_context(
    query_text: str = "",
    query_embedding: list[float] | None = None,
    top_k: int = 5,
) -> str:
    """Retrieve similar historical errors to inject as negative prompts."""
    try:
        collection = _get_collection()

        kwargs: dict[str, Any] = {"n_results": top_k}
        if query_embedding:
            kwargs["query_embeddings"] = [query_embedding]
        elif query_text:
            kwargs["query_texts"] = [query_text]
        else:
            return ""

        results = collection.query(**kwargs)

        if not results or not results.get("documents"):
            return ""

        docs = results["documents"][0]
        metadatas = results["metadatas"][0] if results.get("metadatas") else [{}] * len(docs)

        context_parts = []
        for doc, meta in zip(docs, metadatas):
            error_type = meta.get("error_type", "unknown")
            pred = meta.get("model_prediction", "")
            corr = meta.get("human_correction", "")
            context_parts.append(
                f"- [{error_type}] 模型曾將 '{pred}' 誤判，人工修正為 '{corr}'。{meta.get('context', '')}"
            )

        return "\n".join(context_parts)

    except Exception as e:
        logger.warning("Failed to retrieve from ChromaDB: %s", e)
        return ""


def get_stats() -> dict[str, Any]:
    """Get RAG collection statistics."""
    try:
        collection = _get_collection()
        return {
            "total_corrections": collection.count(),
            "collection_name": COLLECTION_NAME,
        }
    except Exception:
        return {"total_corrections": 0, "collection_name": COLLECTION_NAME}


def _classify_error(original: dict, correction: dict) -> str:
    orig_cls = original.get("class_name", "")
    corr_cls = correction.get("class_name", "")
    if not corr_cls or corr_cls == "removed":
        return "false_positive"
    if not orig_cls:
        return "false_negative"
    if orig_cls != corr_cls:
        return "misclassification"
    return "bbox_adjustment"
