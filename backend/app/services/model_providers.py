"""Unified model provider abstraction.

Supports three provider types:
- ``dashscope``  : Built-in Alibaba DashScope (Qwen series, default)
- ``openai``     : OpenAI-compatible HTTP API
                   (works with OpenAI, OpenRouter, vLLM, Ollama, DeepSeek, ...)
- ``anthropic``  : Anthropic Claude API

Users can register multiple custom providers and select which provider+model
is used for each role (text completion / vision). The default is the built-in
DashScope provider so existing behavior is preserved.

All call sites use OpenAI-style messages internally:
    [{"role": "user", "content": "..."}]                    # text only
    [{"role": "user", "content": [
        {"type": "image_url", "image_url": {"url": "data:image/...;base64,..."}},
        {"type": "text", "text": "..."},
    ]}]                                                     # vision

The abstraction translates these into each backend's native format.
"""
from __future__ import annotations

import base64
import logging
import mimetypes
import os
from pathlib import Path
from typing import Any, Optional

from app.config import settings

logger = logging.getLogger(__name__)


# ── Defaults & constants ──────────────────────────────────────────

BUILTIN_DASHSCOPE_ID = "builtin_dashscope"
BUILTIN_DASHSCOPE_MODELS = [
    "qwen-plus",
    "qwen3.6-plus",
    "qwen-max",
    "qwen-vl-plus",
    "qwen-vl-max",
]

DEFAULT_TEXT_MODEL = {"provider_id": BUILTIN_DASHSCOPE_ID, "model": "qwen-plus"}
DEFAULT_VISION_MODEL = {"provider_id": BUILTIN_DASHSCOPE_ID, "model": "qwen-vl-plus"}

# In-memory cache of active models for each role (refreshed on settings update).
_active_text_model: dict[str, str] = dict(DEFAULT_TEXT_MODEL)
_active_vision_model: dict[str, str] = dict(DEFAULT_VISION_MODEL)
_active_soldier_model: dict[str, str] = dict(DEFAULT_VISION_MODEL)


# ── Storage helpers ───────────────────────────────────────────────

def _read_setting(key: str, default=None):
    from app.database import SessionLocal
    from app.models import SystemSetting

    db = SessionLocal()
    try:
        row = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if not row or not isinstance(row.value, dict):
            return default
        return row.value.get("value", default)
    finally:
        db.close()


def reload_active_models() -> None:
    """Refresh active model selections from DB into in-memory cache."""
    global _active_text_model, _active_vision_model, _active_soldier_model
    _active_text_model = _read_setting("active_text_model", DEFAULT_TEXT_MODEL) or DEFAULT_TEXT_MODEL
    _active_vision_model = _read_setting("active_vision_model", DEFAULT_VISION_MODEL) or DEFAULT_VISION_MODEL
    _active_soldier_model = _read_setting("active_soldier_model", DEFAULT_VISION_MODEL) or DEFAULT_VISION_MODEL


def list_providers(unmasked: bool = False) -> list[dict]:
    """Return all configured providers, including the built-in DashScope.

    When ``unmasked`` is False (default), API keys are stripped before return.
    """
    user_providers = _read_setting("model_providers", []) or []
    builtin = {
        "id": BUILTIN_DASHSCOPE_ID,
        "name": "DashScope (內建)",
        "type": "dashscope",
        "base_url": "",
        "models": list(BUILTIN_DASHSCOPE_MODELS),
        "builtin": True,
        "api_key_set": bool(settings.dashscope_api_key),
    }
    if unmasked:
        builtin["api_key"] = settings.dashscope_api_key

    out = [builtin]
    for p in user_providers:
        item = {
            "id": p.get("id"),
            "name": p.get("name", "Unnamed"),
            "type": p.get("type", "openai"),
            "base_url": p.get("base_url", ""),
            "models": p.get("models", []) or [],
            "builtin": False,
            "api_key_set": bool(p.get("api_key")),
        }
        if unmasked:
            item["api_key"] = p.get("api_key", "")
        out.append(item)
    return out


def get_provider(provider_id: str) -> Optional[dict]:
    if not provider_id:
        return None
    if provider_id == BUILTIN_DASHSCOPE_ID:
        return {
            "id": BUILTIN_DASHSCOPE_ID,
            "name": "DashScope (內建)",
            "type": "dashscope",
            "api_key": settings.dashscope_api_key,
            "base_url": "",
            "models": list(BUILTIN_DASHSCOPE_MODELS),
        }
    user_providers = _read_setting("model_providers", []) or []
    for p in user_providers:
        if p.get("id") == provider_id:
            return p
    return None


def get_active_text_model() -> dict:
    return dict(_active_text_model)


def get_active_vision_model() -> dict:
    return dict(_active_vision_model)


def get_active_soldier_model() -> dict:
    return dict(_active_soldier_model)


# ── Public dispatch APIs ──────────────────────────────────────────

def text_complete(
    messages: list[dict],
    temperature: float = 0.2,
    max_tokens: int | None = None,
) -> str:
    """Run a chat-completion call against the active **text** provider.

    ``messages`` must be in OpenAI chat format: list of {role, content}.
    """
    active = get_active_text_model()
    return _dispatch(active, messages, temperature, max_tokens, vision=False)


def vision_complete(
    messages: list[dict],
    temperature: float = 0.1,
    max_tokens: int | None = None,
    role: str = "vision",
) -> str:
    """Run a multimodal completion against the active **vision** provider.

    ``messages`` must be in OpenAI chat format with images encoded as
    ``{"type": "image_url", "image_url": {"url": "data:image/...;base64,..."}}``.
    """
    active = get_active_soldier_model() if role == "soldier" else get_active_vision_model()
    return _dispatch(active, messages, temperature, max_tokens, vision=True)


def encode_image_to_data_url(image_path: str) -> str:
    """Read a local file and return a base64 ``data:`` URI suitable for any backend."""
    mime, _ = mimetypes.guess_type(image_path)
    if not mime or not mime.startswith("image/"):
        mime = "image/jpeg"
    with open(image_path, "rb") as f:
        b64 = base64.b64encode(f.read()).decode("ascii")
    return f"data:{mime};base64,{b64}"


# ── Internal dispatch ────────────────────────────────────────────

def _dispatch(
    active: dict,
    messages: list[dict],
    temperature: float,
    max_tokens: int | None,
    vision: bool,
) -> str:
    provider = get_provider(active.get("provider_id")) or get_provider(BUILTIN_DASHSCOPE_ID)
    if not provider:
        raise RuntimeError("No model provider available")
    model = active.get("model") or (
        DEFAULT_VISION_MODEL["model"] if vision else DEFAULT_TEXT_MODEL["model"]
    )

    p_type = provider.get("type", "dashscope")
    try:
        if p_type == "dashscope":
            return _call_dashscope(model, messages, temperature, max_tokens, vision)
        if p_type == "openai":
            return _call_openai(provider, model, messages, temperature, max_tokens)
        if p_type == "anthropic":
            return _call_anthropic(provider, model, messages, temperature, max_tokens)
    except Exception:
        logger.exception("Provider call failed (type=%s, model=%s)", p_type, model)
        raise
    raise ValueError(f"Unknown provider type: {p_type}")


# ── DashScope backend ─────────────────────────────────────────────

def _call_dashscope(
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int | None,
    vision: bool,
) -> str:
    import dashscope

    dashscope.api_key = settings.dashscope_api_key

    if vision or _has_image(messages):
        from dashscope import MultiModalConversation

        ds_messages = [_to_dashscope_msg(m) for m in messages]
        kwargs: dict[str, Any] = dict(model=model, messages=ds_messages, temperature=temperature)
        response = MultiModalConversation.call(**kwargs)
        if response.status_code != 200:
            raise RuntimeError(f"DashScope VL error: code={response.code} message={response.message}")
        text = response.output.choices[0].message.content
        if isinstance(text, list):
            text = next((c.get("text", "") for c in text if c.get("text")), "")
        return text or ""

    from dashscope import Generation

    response = Generation.call(
        model=model,
        messages=messages,
        result_format="message",
        temperature=temperature,
    )
    if response.status_code != 200:
        # Some newer DashScope models are only available via the
        # OpenAI-compatible endpoint and may fail here with
        # "InvalidParameter ... url error".
        if (
            not vision
            and str(getattr(response, "code", "")).lower() == "invalidparameter"
            and "url error" in str(getattr(response, "message", "")).lower()
        ):
            logger.warning(
                "DashScope Generation.call failed for model=%s with url error; fallback to compatible-mode API.",
                model,
            )
            return _call_dashscope_compatible(model, messages, temperature, max_tokens)
        raise RuntimeError(f"DashScope error: code={response.code} message={response.message}")
    return response.output.choices[0].message.content or ""


def _call_dashscope_compatible(
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int | None,
) -> str:
    """Call DashScope via OpenAI-compatible endpoint as fallback."""
    from openai import OpenAI

    client = OpenAI(
        api_key=settings.dashscope_api_key,
        base_url="https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    kwargs: dict[str, Any] = dict(model=model, messages=[_to_openai_msg(m) for m in messages], temperature=temperature)
    if max_tokens:
        kwargs["max_tokens"] = max_tokens
    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


def _to_dashscope_msg(msg: dict) -> dict:
    content = msg.get("content")
    if isinstance(content, str):
        return {"role": msg["role"], "content": [{"text": content}]}
    if not isinstance(content, list):
        return {"role": msg["role"], "content": [{"text": str(content)}]}

    ds_content = []
    for item in content:
        if not isinstance(item, dict):
            ds_content.append({"text": str(item)})
            continue
        t = item.get("type")
        if t == "image_url":
            url = (item.get("image_url") or {}).get("url", "")
            ds_content.append({"image": url})
        elif t == "text":
            ds_content.append({"text": item.get("text", "")})
        else:
            if "image" in item:
                ds_content.append({"image": item["image"]})
            elif "text" in item:
                ds_content.append({"text": item["text"]})
    return {"role": msg["role"], "content": ds_content}


# ── OpenAI-compatible backend ─────────────────────────────────────

def _call_openai(
    provider: dict,
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int | None,
) -> str:
    from openai import OpenAI

    api_key = provider.get("api_key", "") or "missing-key"
    base_url = provider.get("base_url") or None
    client = OpenAI(api_key=api_key, base_url=base_url)

    norm_messages = [_to_openai_msg(m) for m in messages]
    kwargs: dict[str, Any] = dict(model=model, messages=norm_messages, temperature=temperature)
    if max_tokens:
        kwargs["max_tokens"] = max_tokens

    response = client.chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


def _to_openai_msg(msg: dict) -> dict:
    content = msg.get("content")
    if isinstance(content, str):
        return {"role": msg["role"], "content": content}
    if not isinstance(content, list):
        return {"role": msg["role"], "content": str(content)}

    norm = []
    for item in content:
        if not isinstance(item, dict):
            norm.append({"type": "text", "text": str(item)})
            continue
        t = item.get("type")
        if t == "image_url":
            url = (item.get("image_url") or {}).get("url", "")
            url = _ensure_remote_or_data_url(url)
            norm.append({"type": "image_url", "image_url": {"url": url}})
        elif t == "text":
            norm.append({"type": "text", "text": item.get("text", "")})
    return {"role": msg["role"], "content": norm}


# ── Anthropic backend ─────────────────────────────────────────────

def _call_anthropic(
    provider: dict,
    model: str,
    messages: list[dict],
    temperature: float,
    max_tokens: int | None,
) -> str:
    import anthropic

    kwargs: dict[str, Any] = {"api_key": provider.get("api_key", "")}
    base_url = provider.get("base_url")
    if base_url:
        kwargs["base_url"] = base_url
    client = anthropic.Anthropic(**kwargs)

    system_text = ""
    user_msgs: list[dict] = []
    for m in messages:
        if m.get("role") == "system":
            c = m.get("content")
            system_text = c if isinstance(c, str) else _flatten_text(c)
        else:
            user_msgs.append(_to_anthropic_msg(m))

    request_kwargs: dict[str, Any] = dict(
        model=model,
        messages=user_msgs,
        temperature=temperature,
        max_tokens=max_tokens or 4096,
    )
    if system_text:
        request_kwargs["system"] = system_text

    response = client.messages.create(**request_kwargs)
    parts = []
    for block in response.content:
        text = getattr(block, "text", None)
        if text:
            parts.append(text)
    return "".join(parts)


def _to_anthropic_msg(msg: dict) -> dict:
    content = msg.get("content")
    if isinstance(content, str):
        return {"role": msg["role"], "content": content}

    blocks = []
    if isinstance(content, list):
        for item in content:
            if not isinstance(item, dict):
                blocks.append({"type": "text", "text": str(item)})
                continue
            t = item.get("type")
            if t == "text":
                blocks.append({"type": "text", "text": item.get("text", "")})
            elif t == "image_url":
                url = (item.get("image_url") or {}).get("url", "")
                blocks.append(_url_to_anthropic_image(url))
    return {"role": msg["role"], "content": blocks}


def _url_to_anthropic_image(url: str) -> dict:
    if url.startswith("data:"):
        try:
            header, b64 = url.split(",", 1)
            media_type = header.split(":")[1].split(";")[0]
        except Exception:
            media_type = "image/jpeg"
            b64 = ""
        return {
            "type": "image",
            "source": {"type": "base64", "media_type": media_type, "data": b64},
        }
    if url.startswith("file://"):
        path = url.replace("file://", "")
        try:
            with open(path, "rb") as f:
                b64 = base64.b64encode(f.read()).decode("ascii")
            mime, _ = mimetypes.guess_type(path)
            media_type = mime or "image/jpeg"
            return {
                "type": "image",
                "source": {"type": "base64", "media_type": media_type, "data": b64},
            }
        except Exception:
            return {"type": "text", "text": "[image unavailable]"}
    return {"type": "image", "source": {"type": "url", "url": url}}


# ── Utilities ────────────────────────────────────────────────────

def _has_image(messages: list[dict]) -> bool:
    for m in messages:
        c = m.get("content")
        if isinstance(c, list):
            for item in c:
                if isinstance(item, dict) and (item.get("type") == "image_url" or "image" in item):
                    return True
    return False


def _flatten_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(item.get("text", ""))
            elif isinstance(item, str):
                parts.append(item)
        return "\n".join(parts)
    return str(content or "")


def _ensure_remote_or_data_url(url: str) -> str:
    """OpenAI's HTTP API does not accept ``file://`` URIs — convert to data URL."""
    if url.startswith(("http://", "https://", "data:")):
        return url
    if url.startswith("file://"):
        path = url.replace("file://", "")
        if os.path.exists(path):
            return encode_image_to_data_url(path)
    return url
