"""YOLO Training Service — ultralytics integration.

Manages YOLO training jobs as subprocesses, captures real-time logs,
parses results.csv for metrics, and provides access to training artifacts.
"""
from __future__ import annotations

import asyncio
import csv
import json
import logging
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any, Optional

from sqlalchemy.orm import Session

from app.config import settings
from app.models import TrainingJob
from app.services.dataset_service import export_yolo

logger = logging.getLogger(__name__)

_active_processes: dict[int, subprocess.Popen] = {}
_log_subscribers: dict[int, list[asyncio.Queue]] = {}


def prepare_yolo_dataset(db: Session, dataset_id: int, job_id: int) -> str:
    """Export dataset to YOLO format in a temp directory for training."""
    import zipfile
    from io import BytesIO

    zip_bytes = export_yolo(db, dataset_id)
    train_dir = Path(settings.models_dir) / f"train_job_{job_id}"
    train_dir.mkdir(parents=True, exist_ok=True)

    with zipfile.ZipFile(BytesIO(zip_bytes)) as zf:
        zf.extractall(train_dir)

    yaml_path = train_dir / "data.yaml"
    if yaml_path.exists():
        content = yaml_path.read_text()
        content = content.replace(
            "train: images",
            f"train: {train_dir / 'images'}",
        ).replace(
            "val: images",
            f"val: {train_dir / 'images'}",
        )
        content += f"\npath: {train_dir}\n"
        yaml_path.write_text(content)

    return str(yaml_path)


def start_training(
    db: Session,
    job: TrainingJob,
) -> TrainingJob:
    """Start a YOLO training job as a subprocess."""
    yaml_path = prepare_yolo_dataset(db, job.dataset_id, job.id)

    run_dir = Path(settings.models_dir) / f"runs/job_{job.id}"
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "training.log"

    cmd = [
        sys.executable, "-u", "-c",
        f"""
import sys
sys.stdout.reconfigure(line_buffering=True)
from ultralytics import YOLO
model = YOLO('{job.model_type}.pt')
results = model.train(
    data='{yaml_path}',
    epochs={job.epochs},
    batch={job.batch_size},
    imgsz={job.img_size},
    project='{run_dir}',
    name='train',
    exist_ok=True,
    verbose=True,
)
print("TRAINING_COMPLETE")
"""
    ]

    log_file = open(log_path, "w")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    _active_processes[job.id] = proc
    _log_subscribers.setdefault(job.id, [])

    job.status = "running"
    job.log_path = str(log_path)
    job.run_dir = str(run_dir)
    job.pid = proc.pid
    db.commit()

    thread = threading.Thread(
        target=_stream_output,
        args=(job.id, proc, log_file),
        daemon=True,
    )
    thread.start()

    return job


def _stream_output(job_id: int, proc: subprocess.Popen, log_file):
    """Read subprocess output line by line, write to log file and broadcast."""
    try:
        for line in iter(proc.stdout.readline, ""):
            if not line:
                break
            log_file.write(line)
            log_file.flush()

            for q in _log_subscribers.get(job_id, []):
                try:
                    q.put_nowait(line)
                except asyncio.QueueFull:
                    pass

        proc.wait()
    finally:
        log_file.close()
        _active_processes.pop(job_id, None)

        for q in _log_subscribers.get(job_id, []):
            try:
                q.put_nowait("__TRAINING_ENDED__")
            except asyncio.QueueFull:
                pass


def subscribe_logs(job_id: int) -> asyncio.Queue:
    """Subscribe to real-time log output for a training job."""
    q: asyncio.Queue = asyncio.Queue(maxsize=1000)
    _log_subscribers.setdefault(job_id, []).append(q)
    return q


def unsubscribe_logs(job_id: int, q: asyncio.Queue):
    subs = _log_subscribers.get(job_id, [])
    if q in subs:
        subs.remove(q)


def stop_training(job_id: int) -> bool:
    proc = _active_processes.get(job_id)
    if proc and proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()
        return True
    return False


def resume_training(db: Session, job: TrainingJob) -> TrainingJob:
    """Resume a stopped/failed training job from its last checkpoint."""
    last_pt = None
    if job.run_dir:
        run_path = Path(job.run_dir)
        for p in run_path.rglob("last.pt"):
            last_pt = str(p)
            break

    if not last_pt:
        raise RuntimeError("No checkpoint (last.pt) found to resume from")

    yaml_path = None
    train_dir = Path(settings.models_dir) / f"train_job_{job.id}"
    yaml_candidate = train_dir / "data.yaml"
    if yaml_candidate.exists():
        yaml_path = str(yaml_candidate)
    else:
        raise RuntimeError("Cannot find data.yaml for this job")

    run_dir = Path(job.run_dir) if job.run_dir else Path(settings.models_dir) / f"runs/job_{job.id}"
    run_dir.mkdir(parents=True, exist_ok=True)
    log_path = run_dir / "training.log"

    cmd = [
        sys.executable, "-u", "-c",
        f"""
import sys
sys.stdout.reconfigure(line_buffering=True)
from ultralytics import YOLO
model = YOLO('{last_pt}')
results = model.train(
    data='{yaml_path}',
    epochs={job.epochs},
    batch={job.batch_size},
    imgsz={job.img_size},
    project='{run_dir}',
    name='train',
    exist_ok=True,
    verbose=True,
    resume=True,
)
print("TRAINING_COMPLETE")
"""
    ]

    log_file = open(log_path, "a")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )

    _active_processes[job.id] = proc
    _log_subscribers.setdefault(job.id, [])

    job.status = "running"
    job.pid = proc.pid
    db.commit()

    thread = threading.Thread(
        target=_stream_output,
        args=(job.id, proc, log_file),
        daemon=True,
    )
    thread.start()

    return job


def cancel_training(job_id: int) -> bool:
    """Stop a running job forcefully (cancel)."""
    proc = _active_processes.get(job_id)
    if proc and proc.poll() is None:
        proc.kill()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            pass
        return True
    return False


def get_job_status(db: Session, job_id: int) -> dict[str, Any]:
    job = db.query(TrainingJob).filter(TrainingJob.id == job_id).first()
    if not job:
        return {}

    proc = _active_processes.get(job_id)
    if proc and proc.poll() is not None:
        job.status = "completed" if proc.returncode == 0 else "failed"
        job.metrics = parse_results_csv(job.run_dir)
        _find_best_model(job)
        db.commit()
    elif not proc and job.status == "running":
        job.status = "completed"
        job.metrics = parse_results_csv(job.run_dir)
        _find_best_model(job)
        db.commit()

    return {
        "id": job.id,
        "status": job.status,
        "metrics": job.metrics,
        "best_model_path": job.best_model_path,
        "run_dir": job.run_dir,
    }


def parse_results_csv(run_dir: str | None) -> dict[str, Any]:
    """Parse ultralytics results.csv for training metrics."""
    if not run_dir:
        return {}

    csv_path = Path(run_dir) / "train" / "results.csv"
    if not csv_path.exists():
        for p in Path(run_dir).rglob("results.csv"):
            csv_path = p
            break
        else:
            return {}

    metrics: dict[str, list[float]] = {}
    try:
        with open(csv_path) as f:
            reader = csv.DictReader(f)
            for row in reader:
                for key, val in row.items():
                    key = key.strip()
                    try:
                        metrics.setdefault(key, []).append(float(val.strip()))
                    except (ValueError, AttributeError):
                        pass
    except Exception as e:
        logger.warning("Failed to parse results.csv: %s", e)

    return metrics


def get_training_artifacts(run_dir: str | None) -> list[dict[str, str]]:
    """List image/model artifacts from a training run directory."""
    if not run_dir:
        return []

    artifacts = []
    run_path = Path(run_dir)
    for pattern in ["**/*.png", "**/*.jpg", "**/*.pt", "**/*.csv"]:
        for f in run_path.glob(pattern):
            rel = str(f.relative_to(run_path))
            artifacts.append({
                "name": f.name,
                "path": str(f),
                "relative_path": rel,
                "type": f.suffix.lstrip("."),
                "size": f.stat().st_size,
            })

    return artifacts


def _find_best_model(job: TrainingJob):
    if not job.run_dir:
        return
    for p in Path(job.run_dir).rglob("best.pt"):
        job.best_model_path = str(p)
        return
    for p in Path(job.run_dir).rglob("last.pt"):
        job.best_model_path = str(p)
        return
