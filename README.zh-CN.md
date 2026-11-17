<div align="center">

[English](./README.md) · [繁體中文](./README.zh-TW.md) · **简体中文**

<img src="./logiclabeler_logo.png" alt="LogicLabeler 标志" width="150" />

# LogicLabeler

**由 MLLM 推理和多智能体协作驱动的下一代自动标注工具**

*超越单纯识别物体——理解它们的关系、属性与状态。*

<br />

<img src="./docs/images/logiclabeler-hero.png" alt="LogicLabeler——由 MLLM 推理与多智能体协作驱动的下一代自动标注工具" width="100%" />

<br />

<img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.11+" />
<img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" alt="React 18" />
<img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI 0.115" />
<img src="https://img.shields.io/badge/MUI%20v6-Material%203-007FFF?style=for-the-badge&logo=mui&logoColor=white" alt="MUI v6" />
<img src="https://img.shields.io/badge/YOLO-v8%2Fv11-00FFFF?style=for-the-badge&logo=yolo&logoColor=white" alt="YOLO v8/v11" />
<img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Compose" />
<img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License" />
<a href="https://www.msc.org.mo/attachment/files/2026/06/18/第一屆“青年科技村科創人才培訓計劃”成果展得獎名單.pdf"><img src="https://img.shields.io/badge/2026_冠军-%26_最受公众欢迎奖-F4B942?style=for-the-badge" alt="2026 冠军及最受公众欢迎奖" /></a>

<br /><br />

[获奖荣誉](#获奖荣誉) · [为什么选择 LogicLabeler？](#为什么选择-logiclabeler) · [标注流程](#多智能体标注流程) · [产品预览](#产品预览) · [快速开始](#快速开始) · [系统架构](#架构)

<br /><br />

| 传统标注 | LogicLabeler |
|:---:|:---:|
| “标注每个**工人**” | “标注所有**未戴安全帽的工人**” |
| “标注每辆**卡车**” | “标注所有**正在卸货的卡车**” |
| “标记每辆**车辆**” | “标记停在**限制区域内的车辆**” |

</div>

---

## 获奖荣誉

> [!IMPORTANT]
> 🏆 **电脑及科技网络类：冠军及最受公众欢迎奖**<br />
> 第一届“青年科技村”科创人才培训计划成果展 · 澳门 · 2026<br />
> [查看澳门科学馆公布的官方获奖名单](https://www.msc.org.mo/attachment/files/2026/06/18/第一屆“青年科技村科創人才培訓計劃”成果展得獎名單.pdf)

---

## 产品预览

### 仪表板

![LogicLabeler 仪表板](./docs/images/dashboard.png)

<table>
  <tr>
    <td width="50%">
      <img src="./docs/images/datasets.png" alt="LogicLabeler 数据集管理" />
      <p align="center"><b>数据集管理</b></p>
    </td>
    <td width="50%">
      <img src="./docs/images/auto-label.png" alt="LogicLabeler 自动标注工作区" />
      <p align="center"><b>多智能体自动标注</b></p>
    </td>
  </tr>
</table>

---

## 为什么选择 LogicLabeler？

高质量标注数据仍是 AI 系统落地时最大的瓶颈之一。LogicLabeler 将语义规划、视觉检测、对抗式审查、人工修正与模型训练整合为单一自托管工作流。

| 挑战 | LogicLabeler 解决方案 |
|---|---|
| 昂贵的人工标注 | 批量自动化，仅在关键环节加入人工审查 |
| 标签不一致 | Critic（批评者）和 Reviewer（审阅者）智能体验证几何与语义约束 |
| 仅识别名词 | Chain-of-Thought（思维链）规划支持复合逻辑指令 |
| 封闭类别列表 | 开放式词汇识别可分配细粒度类别名称 |
| 供应商锁定 | 支持 DashScope、OpenAI 兼容 API 及 Anthropic Claude |
| 工具互不相连 | 在单一平台上完成标注、数据增强、导出与 YOLO 训练 |

## 亮点

### 多智能体标注流程

LogicLabeler 执行四阶段工作流：

![LogicLabeler 多智能体标注流程](./docs/images/agent-workflow.svg)

1. **Commander（指挥官）** 解析自然语言指令并生成结构化计划。
2. **Soldier（士兵）** 使用视觉模型或本地 Grounded-SAM 推理检测物体。
3. **Critic（批评者）** 验证几何与语义约束，并可触发多轮辩论。
4. **Reviewer（审阅者）** 检查逐个裁剪区域，提出通过、拒绝或标注框调整建议。

人工修正会向量化存入 ChromaDB，并在之后遇到类似任务时作为负例自动检索。

### 开放式词汇与细粒度识别

Commander 能区分范例与硬性约束。例如：

| 指令风格 | 解释 |
|---|---|
| "Cats **such as** British Shorthair, Ragdoll, or Siamese"（猫，例如英国短毛猫、布偶猫或暹罗猫） | 检测父类别 `cat`；使用品种作为提示；启用 `open_vocabulary` |
| "Detect **only** cat, dog, and person"（仅检测猫、狗和人） | 使用封闭类别列表；禁用 `open_vocabulary` |

当启用开放式词汇时，Soldier 可返回观察到的品种，而非强迫每个物体归入范例之一。不确定情况会使用类似 `cat (uncertain)`（猫 - 不确定）或 `cat (unknown breed)`（猫 - 未知品种）的标签。

### 专业标注工作区

- BBox、Polygon、Keypoint 和 Oriented BBox 工具
- 由 OpenCV GrabCut 驱动的 Smart Segment（智能分割）
- 当前图片的一键 AI 标注
- Loupe（放大镜）、像素网格、Mini-map、边缘吸附及按类别着色
- 撤销/重做、复制/贴上、锁定、键盘微调及多选编辑
- 每个标注属性：`occluded`（遮挡）、`truncated`（截断）、`blur`（模糊）和备注
- 每张图片的元数据：`verified`（已验证）、标签、备注及训练/验证/测试划分
- Keypoint schema（关键点模式）与骨架编辑器
- 自动导出 YOLO Detect、Segment、Pose 或 OBB

### Prompt 优化与增强

内置 Prompt Optimizer 可生成三种版本：更具体、加入逻辑及更精简。AI 数据增强使用 `qwen-image-2.0-pro` 生成天气、光照与视角等语义一致的变体，再将新图片送入完整标注流程。

### YOLO 端到端训练

无需离开应用即可训练 YOLOv8 或 YOLO11。训练功能包含 WebSocket 日志、实时图表、从 checkpoint 继续、停止/取消控制、训练产物浏览及最佳权重下载。

## 支持的功能

| 领域 | 能力 |
|---|---|
| 标注 (Annotation) | BBox, Polygon, Keypoint, OBB, Smart Segment |
| 导入 (Import) | YOLO, COCO, Pascal VOC ZIP |
| 导出 (Export) | YOLO Detect/Segment/Pose/OBB 和 COCO |
| 供应商 (Providers) | DashScope、OpenAI 兼容 API、Anthropic Claude |
| 本地检测 (Local detection) | Grounded-SAM（可选 SAHI 切片推理） |
| 记忆 (Memory) | 从人工修正中检索 ChromaDB 记忆 |
| 增强 (Augmentation) | AI 图像编辑加上 OpenCV/Pillow 预处理 |
| 训练 (Training) | YOLOv8 和 YOLO11（含生命周期控制） |
| 界面 (Interface) | React 18, MUI v6, Material Design 3, light/dark/system themes |

## 架构

![LogicLabeler 系统架构](./docs/images/system-architecture.svg)

## 快速开始

### 环境要求

- [Docker](https://docs.docker.com/get-docker/) 和 [Docker Compose](https://docs.docker.com/compose/install/) v2+
- 至少一个受支持的模型供应商 API key：
  - [DashScope](https://bailian.console.aliyun.com/?apiKey=1)（默认，同时用于 AI 数据增强）
  - 或 OpenAI 兼容 API、Anthropic、DeepSeek、OpenRouter、Ollama 或 vLLM 端点

### 使用 Docker Compose 执行

```bash
git clone https://github.com/Roy24245/LogicLabeler-ai.git
cd LogicLabeler-ai

# 可选：在此处配置 key，或稍后在用户界面中输入。
cp .env.example .env

docker compose up --build -d
docker compose logs -f
```

服务准备就绪后：

| 服务 | 地址 |
|---|---|
| Web 界面 | <http://localhost> |
| Swagger API 文档 | <http://localhost:8000/docs> |
| ChromaDB | <http://localhost:8100> |

首次启动时，五步初始化向导会引导您完成外观、API key、模型供应商及当前使用模型的设置。

### 停止或重启

```bash
docker compose down
docker compose up -d
docker compose restart
```

## 本地开发

### 后端

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

docker compose up chromadb -d
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

Vite 开发服务器会将 `/api` 代理到后端 `8000` 端口。

## 配置

### 环境变量

| 变量 | 用途 | 默认值 |
|---|---|---|
| `DASHSCOPE_API_KEY` | DashScope API key | 可在界面中设置 |
| `DATABASE_URL` | SQLite 数据库地址 | `sqlite:///./data/logiclabeler.db` |
| `CHROMADB_HOST` | ChromaDB 主机名 | Docker 中为 `chromadb`，其他环境为 `localhost` |
| `CHROMADB_PORT` | ChromaDB 端口 | `8100` |
| `DATA_DIR` | 持久化数据根目录 | `./data` |

设置页面可在无需重启服务的情况下更新模型供应商、当前文本/视觉模型、Soldier 模式、数据增强、主题及初始化状态。

## 项目结构

```text
LogicLabeler-ai/
├── backend/
│   └── app/
│       ├── api/                 # REST 与 WebSocket 路由
│       ├── core/                # 几何与 SAHI 辅助工具
│       └── services/            # 智能体、供应商、RAG、数据与训练
├── frontend/
│   └── src/
│       ├── components/          # 共享界面与标注组件
│       ├── pages/               # 仪表板、数据集、标注、训练与设置
│       ├── api/                 # 类型化 API 客户端
│       └── store/               # Zustand 状态
├── data/                        # SQLite、数据集、模型与 ChromaDB 数据
├── docs/images/                 # README 视觉资源
├── docker-compose.yml
└── .env.example
```

## 主要 API 分组

后端启动后，可在 <http://localhost:8000/docs> 查看交互式文档。

| 分组 | 代表性端点 |
|---|---|
| 数据集 | `/api/datasets`、导入、导出、统计及划分操作 |
| 标注 | `/api/images/{id}/annotations` 及图片元数据 |
| AI 助手 | `/api/assist/segment`、`/api/assist/autolabel-image` |
| 自动标注 | `/api/labeling/run`、状态、审查及 Prompt Optimizer |
| 训练 | 启动、停止、继续、取消、指标、日志及产物 |
| 数据增强 | 启动增强及查询任务状态 |
| 设置 | 供应商、API keys、当前模型及健康检查 |

## 近期里程碑

- **2026.05 — 开放词汇：** Commander 可识别示例语句、Soldier 支持细粒度命名，并加入单张图片一键标注。
- **2026.04 — 标注工作区：** Polygon、Keypoint、OBB、Smart Segment、元数据、视觉辅助及扩展导出支持。
- **2026.03 — Material Design 3：** 全新主题系统、初始化向导、供应商管理、Prompt Optimizer 及完整训练生命周期控制。

## 授权条款

根据 [MIT License](./LICENSE) 发布。

Copyright (c) 2026 FONG, KUN FAI

---

<div align="center">

*Built with ❤️ using Qwen · OpenAI · Anthropic · React · FastAPI · ultralytics*

</div>
