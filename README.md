<div align="center">

**English** · [繁體中文](./README.zh-TW.md) · [简体中文](./README.zh-CN.md)

<img src="./logiclabeler_logo.png" alt="LogicLabeler logo" width="150" />

# LogicLabeler

**Next-generation automatic annotation powered by MLLM reasoning and multi-agent collaboration**

*Go beyond seeing objects—understand their relationships, attributes, and state.*

<br />

<img src="./docs/images/logiclabeler-hero.png" alt="LogicLabeler — next-generation automatic annotation powered by MLLM reasoning and multi-agent collaboration" width="100%" />

<br />

<img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.11+" />
<img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 18" />
<img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI 0.115" />
<img src="https://img.shields.io/badge/MUI%20v6-Material%203-007FFF?style=for-the-badge&logo=mui&logoColor=white" alt="MUI v6" />
<img src="https://img.shields.io/badge/YOLO-v8%2Fv11-00FFFF?style=for-the-badge&logo=yolo&logoColor=white" alt="YOLO v8/v11" />
<img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose" />
<img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />

<br /><br />

[Why LogicLabeler?](#why-logiclabeler) · [Workflow](#multi-agent-annotation-pipeline) · [Product preview](#product-preview) · [Quick start](#quick-start) · [Architecture](#architecture)

<br /><br />

| Traditional annotation | LogicLabeler |
|:---:|:---:|
| “Label every **worker**” | “Label every worker **not wearing a helmet**” |
| “Label every **truck**” | “Label every truck **currently unloading**” |
| “Label every **vehicle**” | “Label vehicles **parked in a restricted zone**” |

</div>

---

## Product preview

### Dashboard

![LogicLabeler dashboard](./docs/images/dashboard.png)

<table>
  <tr>
    <td width="50%">
      <img src="./docs/images/datasets.png" alt="LogicLabeler dataset management" />
      <p align="center"><b>Dataset management</b></p>
    </td>
    <td width="50%">
      <img src="./docs/images/auto-label.png" alt="LogicLabeler automatic annotation workspace" />
      <p align="center"><b>Multi-agent automatic annotation</b></p>
    </td>
  </tr>
</table>

---

## Why LogicLabeler?

High-quality labeled data remains one of the largest bottlenecks in production AI. LogicLabeler combines semantic planning, visual detection, adversarial review, human correction, and model training in one self-hosted workflow.

| Challenge | LogicLabeler approach |
|---|---|
| Expensive manual annotation | Batch automation with human review where it matters |
| Inconsistent labels | Critic and Reviewer agents validate geometry and semantics |
| Noun-only detection | Chain-of-Thought planning supports compound logical instructions |
| Closed category lists | Open-vocabulary recognition can assign fine-grained class names |
| Provider lock-in | DashScope, OpenAI-compatible, and Anthropic providers |
| Disconnected tools | Annotation, augmentation, export, and YOLO training in one platform |

## Highlights

### Multi-agent annotation pipeline

LogicLabeler runs a four-stage workflow:

![LogicLabeler multi-agent annotation workflow](./docs/images/agent-workflow.svg)

1. **Commander** interprets natural-language instructions and creates a structured plan.
2. **Soldier** detects objects using a vision model or local Grounded-SAM inference.
3. **Critic** validates geometric and semantic constraints and can trigger multi-round debate.
4. **Reviewer** inspects individual crops and proposes approval, rejection, or box adjustment.

Human corrections are embedded into ChromaDB and retrieved as negative examples for similar future tasks.

### Open-vocabulary, fine-grained recognition

Commander distinguishes examples from hard constraints. For example:

| Instruction style | Interpretation |
|---|---|
| “Cats **such as** British Shorthair, Ragdoll, or Siamese” | Detect the parent class `cat`; use the breeds as hints; enable `open_vocabulary` |
| “Detect **only** cat, dog, and person” | Use a closed category list; disable `open_vocabulary` |

When open vocabulary is enabled, Soldier can return the observed breed rather than forcing every object into one of the examples. Uncertain cases use labels such as `cat (uncertain)` or `cat (unknown breed)`.

### Professional annotation workspace

- BBox, Polygon, Keypoint, and Oriented BBox tools
- Smart Segment powered by OpenCV GrabCut
- One-click AI annotation for the current image
- Loupe, pixel grid, mini-map, edge snapping, and class-based colors
- Undo/redo, copy/paste, locking, keyboard nudging, and multi-select editing
- Per-annotation attributes: `occluded`, `truncated`, `blur`, and notes
- Per-image metadata: `verified`, tags, notes, and train/validation/test split
- Keypoint schema and skeleton editor
- Automatic YOLO Detect, Segment, Pose, or OBB export

### Prompt optimization and augmentation

The built-in Prompt Optimizer produces three alternatives: more specific, more logical, and more concise. AI augmentation uses `qwen-image-2.0-pro` to create semantically consistent variations such as weather, lighting, and viewpoint changes, then sends the new images through the annotation pipeline.

### End-to-end YOLO training

Train YOLOv8 or YOLO11 without leaving the application. Training includes WebSocket logs, live charts, checkpoint resume, stop/cancel controls, artifact browsing, and best-weight download.

## Supported capabilities

| Area | Capabilities |
|---|---|
| Annotation | BBox, Polygon, Keypoint, OBB, Smart Segment |
| Import | YOLO, COCO, Pascal VOC ZIP |
| Export | YOLO Detect/Segment/Pose/OBB and COCO |
| Providers | DashScope, OpenAI-compatible APIs, Anthropic Claude |
| Local detection | Grounded-SAM with optional SAHI slicing |
| Memory | ChromaDB retrieval from human corrections |
| Augmentation | AI image editing plus OpenCV/Pillow preprocessing |
| Training | YOLOv8 and YOLO11 with lifecycle controls |
| Interface | React 18, MUI v6, Material Design 3, light/dark/system themes |

## Architecture

![LogicLabeler system architecture](./docs/images/system-architecture.svg)

## Quick start

### Requirements

- [Docker](https://docs.docker.com/get-docker/) and [Docker Compose](https://docs.docker.com/compose/install/) v2+
- An API key for at least one supported model provider:
  - [DashScope](https://bailian.console.aliyun.com/?apiKey=1), the default and the provider used for AI augmentation
  - Or an OpenAI-compatible, Anthropic, DeepSeek, OpenRouter, Ollama, or vLLM endpoint

### Run with Docker Compose

```bash
git clone https://github.com/Roy24245/LogicLabeler-ai.git
cd LogicLabeler-ai

# Optional: configure the key here, or enter it later in the UI.
cp .env.example .env

docker compose up --build -d
docker compose logs -f
```

Once the services are ready:

| Service | URL |
|---|---|
| Web interface | <http://localhost> |
| Swagger API docs | <http://localhost:8000/docs> |
| ChromaDB | <http://localhost:8100> |

On first launch, a five-step wizard guides you through appearance, API keys, model providers, and active model selection.

### Stop or restart

```bash
docker compose down
docker compose up -d
docker compose restart
```

## Local development

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

docker compose up chromadb -d
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite development server proxies `/api` to the backend on port `8000`.

## Configuration

### Environment variables

| Variable | Purpose | Default |
|---|---|---|
| `DASHSCOPE_API_KEY` | DashScope API key | Can be set in the UI |
| `DATABASE_URL` | SQLite database URL | `sqlite:///./data/logiclabeler.db` |
| `CHROMADB_HOST` | ChromaDB hostname | `chromadb` in Docker, otherwise `localhost` |
| `CHROMADB_PORT` | ChromaDB port | `8100` |
| `DATA_DIR` | Persistent data root | `./data` |

The Settings page can update providers, active text/vision models, Soldier mode, augmentation, theme, and onboarding state without restarting the services.

## Project structure

```text
LogicLabeler-ai/
├── backend/
│   └── app/
│       ├── api/                 # REST and WebSocket routes
│       ├── core/                # Geometry and SAHI helpers
│       └── services/            # Agents, providers, RAG, data, and training
├── frontend/
│   └── src/
│       ├── components/          # Shared UI and annotation components
│       ├── pages/               # Dashboard, datasets, labeling, training, settings
│       ├── api/                 # Typed API client
│       └── store/               # Zustand state
├── data/                        # SQLite, datasets, models, and ChromaDB data
├── docs/images/                 # README screenshots
├── docker-compose.yml
└── .env.example
```

## Main API groups

Interactive documentation is available at <http://localhost:8000/docs> after the backend starts.

| Group | Representative endpoints |
|---|---|
| Datasets | `/api/datasets`, import, export, statistics, and split operations |
| Annotations | `/api/images/{id}/annotations` and image metadata |
| AI assistance | `/api/assist/segment`, `/api/assist/autolabel-image` |
| Labeling | `/api/labeling/run`, status, review, and Prompt Optimizer |
| Training | Start, stop, resume, cancel, metrics, logs, and artifacts |
| Augmentation | Run augmentation and query job status |
| Settings | Providers, API keys, active models, and health checks |

## Recent milestones

- **2026.05 — Open vocabulary:** example-aware Commander parsing, fine-grained Soldier labels, and one-click image annotation.
- **2026.04 — Annotation workspace:** Polygon, Keypoint, OBB, Smart Segment, metadata, visual aids, and expanded export support.
- **2026.03 — Material Design 3:** new theme system, onboarding wizard, provider management, Prompt Optimizer, and complete training lifecycle controls.

## License

Released under the [MIT License](./LICENSE).

Copyright (c) 2026 FONG, KUN FAI

---

<div align="center">

*Built with ❤️ using Qwen · OpenAI · Anthropic · React · FastAPI · ultralytics*

</div>
