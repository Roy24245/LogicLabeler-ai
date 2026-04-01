"""WebSocket endpoints for real-time log streaming."""
from __future__ import annotations

import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services import training_service

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/logs/{job_id}")
async def ws_training_logs(websocket: WebSocket, job_id: int):
    """Stream training job logs in real-time via WebSocket."""
    await websocket.accept()

    q = training_service.subscribe_logs(job_id)

    log_path = None
    from app.database import SessionLocal
    db = SessionLocal()
    try:
        from app.models import TrainingJob
        job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
        if job and job.log_path:
            log_path = job.log_path
    finally:
        db.close()

    if log_path:
        try:
            with open(log_path, "r") as f:
                existing = f.read()
                if existing:
                    await websocket.send_text(existing)
        except FileNotFoundError:
            pass

    try:
        while True:
            try:
                line = await asyncio.wait_for(q.get(), timeout=30)
                if line == "__TRAINING_ENDED__":
                    await websocket.send_text("\n[Training completed]\n")
                    break
                await websocket.send_text(line)
            except asyncio.TimeoutError:
                await websocket.send_text("")
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.warning("WebSocket error: %s", e)
    finally:
        training_service.unsubscribe_logs(job_id, q)
