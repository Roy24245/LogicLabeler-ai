<p align="center">
  <img src="https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white" />
  <img src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?logo=fastapi&logoColor=white" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white" />
  <img src="https://img.shields.io/badge/YOLO-v8%2Fv11-00FFFF?logo=yolo&logoColor=white" />
  <img src="https://img.shields.io/badge/License-MIT-green" />
</p>

# LogicLabeler

**基於 MLLM 語義推理與多智能體協作的下一代自動標註系統**

> 讓自動標註系統不僅能「看見」物體，還能「理解」物體之間的關係與狀態。

---

## 目錄

- [產品介紹](#產品介紹)
- [核心特色](#核心特色)
- [系統架構](#系統架構)
- [工作流程](#工作流程)
- [技術棧](#技術棧)
- [功能一覽](#功能一覽)
- [快速啟動](#快速啟動)
- [本地開發](#本地開發)
- [環境變量](#環境變量)
- [項目結構](#項目結構)
- [API 文檔](#api-文檔)
- [競爭優勢](#競爭優勢)

---

## 產品介紹

在深度學習時代，高品質標註數據是 AI 系統落地的關鍵瓶頸。傳統人工標註面臨**成本高昂**（單張複雜圖片 $0.5-2）、**效率低下**、**一致性差**等結構性問題；而現有自動標註工具（如 Autodistill）本質上只是「名詞檢測器」，無法處理複合邏輯指令。

**LogicLabeler** 是一個具備「認知推理能力」的智慧標註引擎。它能理解以下指令並精確執行：

| 傳統工具能做的 | LogicLabeler 額外能做的 |
|---|---|
| 「標出所有工人」 | 「標出所有**未佩戴安全帽**的工人」 |
| 「標出所有卡車」 | 「標出所有**正在卸貨**的卡車」 |
| 「標出所有車輛」 | 「標出**停在禁停區域內**的車輛」 |

系統通過自然語言理解用戶意圖，自動拆解為空間邏輯校驗（IoU、包含關係、相對位置），在精準定位的同時完成語義推理。

---

## 核心特色

### 從「感知」到「推理」的範式轉移
引入 Chain-of-Thought (CoT) 機制，將抽象的業務邏輯（如安全規範）自動轉化為可執行的幾何檢測任務。用戶只需用自然語言描述需求，系統自動拆解、執行並驗證。

### Commander-Soldier-Critic 三層智能體協作
模擬人類團隊協作模式——指揮官負責思考與調度，士兵負責執行，檢察官負責品質把關。三者形成對抗式驗證閉環，大幅降低偽標籤噪音。

### RAG 自適應進化
系統會記住每次人工修正，在面對相似場景時自動注入「歷史教訓」避免重蹈覆轍。越用越聰明，無需重新訓練模型。

### AI 數據增強
利用圖像生成模型對數據集進行條件化變換（角度、光照、天氣等），在保留語義標註的前提下擴充數據集規模和多樣性。

### 本地 YOLO 訓練
內建 ultralytics YOLOv8/v11 訓練模塊，支持實時日誌監控、訓練曲線可視化、模型產出瀏覽，形成從標註到訓練的完整閉環。

---

## 系統架構

```
┌─────────────────────────────────────────────────────────┐
│                      Web GUI (React + MUI)              │
│   儀表板 │ 數據集管理 │ 自動標註 │ 訓練 │ 增強 │ 設定    │
└────────────────────────┬────────────────────────────────┘
                         │ REST API / WebSocket
┌────────────────────────┴────────────────────────────────┐
│                   FastAPI Backend                        │
│                                                          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐               │
│  │Commander │  │ Soldier  │  │  Critic  │  Multi-Agent  │
│  │(Qwen3.5  │─▶│(Grounded │─▶│(Qwen3.5  │  Pipeline     │
│  │  Plus)   │  │ SAM/Qwen │  │  Vision) │               │
│  │          │  │ Vision)  │  │          │               │
│  └────┬─────┘  └──────────┘  └─────┬────┘               │
│       │                            │                     │
│  ┌────┴────────────────────────────┴────┐               │
│  │     Evolution Layer (RAG + ChromaDB) │               │
│  └──────────────────────────────────────┘               │
│                                                          │
│  ┌────────────────┐  ┌──────────────────┐               │
│  │  Augmentation   │  │  YOLO Training   │               │
│  │(qwen-image-2.0 │  │  (ultralytics)   │               │
│  │    -pro)        │  │                  │               │
│  └────────────────┘  └──────────────────┘               │
│                                                          │
│  ┌──────────────────────────────────────┐               │
│  │  Geometry Engine (IoU, is_wearing,   │               │
│  │  is_holding, contains, SAHI ...)     │               │
│  └──────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────┘
         │               │               │
    ┌────┴───┐     ┌─────┴────┐    ┌─────┴─────┐
    │ SQLite │     │ ChromaDB │    │ File Store│
    │ (Meta) │     │ (Vectors)│    │ (Images/  │
    └────────┘     └──────────┘    │  Models)  │
                                   └───────────┘
```

---

## 工作流程

### 自動標註流程

```
用戶輸入自然語言指令
       │
       ▼
┌─────────────────────────────┐
│  Step 1: Commander 解析指令  │
│  ・Chain-of-Thought 推理     │
│  ・RAG 檢索歷史錯誤注入      │
│  ・輸出結構化 JSON 執行計劃   │
│    {targets, logic_rules,   │
│     detection_prompts}      │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│  Step 2: Soldier 執行檢測    │
│  ・模式A: Qwen Vision API   │
│  ・模式B: Grounded-SAM 本地  │
│  ・高解析度圖自動啟用 SAHI   │
│  ・輸出候選 BBox + 置信度    │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│  Step 3: Critic 品質檢驗     │
│  ・幾何邏輯校驗              │
│    (is_wearing, IoU, ...)   │
│  ・VLM 裁剪驗證              │
│  ・低置信度觸發辯論機制       │
│  ・過濾/重新標記結果          │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│  Step 4: RAG 進化記憶        │
│  ・人工修正 → 向量化存入     │
│    ChromaDB                  │
│  ・下次處理相似場景自動       │
│    注入 Negative Prompts     │
└──────────┬──────────────────┘
           ▼
     標註結果存入數據集
```

### 數據增強流程

```
選擇數據集 → 選擇增強類型 → AI 生成變體圖片 → 自動繼承標註 → 擴充數據集
                │
                ├── 視角變換
                ├── 明亮/昏暗光照
                ├── 雨天/霧天效果
                └── 陰影方向變化
```

### YOLO 訓練流程

```
選擇數據集 → 配置參數 → 開始訓練 → 實時監控
                │              │
                │         ┌────┴─────┐
                │         │ WebSocket│
                │         │ 實時日誌  │
                │         └────┬─────┘
                │              │
                │         ┌────┴─────┐
                │         │ 訓練曲線  │
                │         │ Loss/mAP │
                │         └────┬─────┘
                │              │
                │         ┌────┴─────┐
                │         │ 產出瀏覽  │
                │         │ 模型/圖表 │
                │         └──────────┘
                │
                ├── 模型: YOLOv8n/s/m/l/x, YOLO11n/s/m
                ├── Epochs / Batch Size / Image Size
                └── 自動導出 YOLO 格式數據集
```

---

## 技術棧

| 層級 | 技術 | 說明 |
|------|------|------|
| **前端** | React 18 + TypeScript + MUI v5 | Material Design 響應式介面 |
| **構建** | Vite | 極速開發體驗 |
| **後端** | Python 3.11 + FastAPI | 異步 API + WebSocket |
| **數據庫** | SQLAlchemy + SQLite | 元數據持久化 |
| **向量庫** | ChromaDB | RAG 錯誤記憶存儲 |
| **AI 推理** | Qwen3.5-Plus (DashScope) | Commander + Critic 語義理解 |
| **視覺檢測** | Qwen-VL-Plus / Grounded-SAM | Soldier 目標檢測 (雙模式) |
| **圖片生成** | qwen-image-2.0-pro (DashScope) | 數據增強合成圖 |
| **模型訓練** | ultralytics (YOLOv8/v11) | 本地 YOLO 訓練 |
| **部署** | Docker Compose | 一鍵啟動三服務 |

---

## 功能一覽

### 數據集管理
- 創建 / 刪除數據集
- 批量上傳圖片
- 導入數據集（支持 **YOLO** / **COCO** / **Pascal VOC** 格式 ZIP）
- 導出為 YOLO 格式（含 `data.yaml`、`classes.txt`、`labels/`）

### 自動標註
- 自然語言指令輸入（中/英文皆可）
- Commander CoT 推理拆解
- Soldier 雙模式切換（API / 本地）
- SAHI 高解析度切片推理
- Critic 對抗式品質驗證
- RAG 歷史錯誤檢索增強
- 實時彩色日誌顯示

### 圖片標註查看/編輯
- Canvas 繪製彩色 BBox + 標籤
- 按類別著色
- 逐條刪除標註
- 人工修正自動觸發 RAG 記憶

### 數據增強
- 6 種 AI 增強預設（視角 / 光照 / 天氣 / 陰影）
- 功能開關（Settings 中可關閉）
- 增強圖片自動標記 `is_augmented`

### YOLO 訓練
- 支持 YOLOv8n/s/m/l/x、YOLO11n/s/m
- 可配置 Epochs / Batch Size / Image Size
- **WebSocket 實時日誌終端**
- **Recharts 訓練曲線**（Loss / mAP / Precision / Recall）
- 訓練產出文件瀏覽（圖表 / 模型權重）
- 支持中途停止訓練

### 系統設定
- DashScope API Key 管理
- Soldier 模式切換
- 數據增強功能開關
- 系統狀態儀表板

---

## 快速啟動

### Docker Compose（推薦）

```bash
# 1. 克隆項目
git clone https://github.com/your-org/LogicLabeler.git
cd LogicLabeler

# 2. 啟動
docker compose up --build -d

# 3. 訪問
# 前端界面:  http://localhost
# API 文檔:  http://localhost/api/docs

# 4. 在 GUI「系統設定」頁面中填入 DashScope API Key 即可開始使用
```

### 停止服務

```bash
docker compose down
```

---

## 本地開發

### 後端

```bash
cd backend
python3 -m pip install -r requirements.txt
python3 -m uvicorn app.main:app --reload --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
# 訪問 http://localhost:3000（自動代理 API 到 8000）
```

---

## 環境變量

| 變量 | 說明 | 默認值 |
|------|------|--------|
| `DASHSCOPE_API_KEY` | 阿里雲 DashScope API Key（也可在 GUI 設定頁面中配置） | 選填 |
| `DATABASE_URL` | SQLite 數據庫路徑 | `sqlite:///./data/logiclabeler.db` |
| `CHROMADB_HOST` | ChromaDB 服務地址 | `chromadb`（Docker 內部）/ `localhost` |
| `CHROMADB_PORT` | ChromaDB 端口 | `8100` |
| `DATA_DIR` | 數據持久化目錄 | `./data` |

> **提示**：所有運行時配置（API Key、Soldier 模式、數據增強開關）均可在前端「系統設定」頁面中隨時修改，無需重啟服務。

---

## 項目結構

```
LogicLabeler/
├── docker-compose.yml          # Docker 編排（backend + frontend + chromadb）
├── .env.example                # 環境變量模板
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI 入口
│       ├── config.py           # 全局配置
│       ├── database.py         # SQLAlchemy 初始化
│       ├── models.py           # ORM 模型（Dataset, Image, Annotation ...）
│       ├── api/
│       │   ├── datasets.py     # 數據集 CRUD + 導入/導出
│       │   ├── labeling.py     # 自動標註流水線
│       │   ├── training.py     # YOLO 訓練管理
│       │   ├── augmentation.py # 數據增強 API
│       │   ├── settings.py     # 系統設定
│       │   └── ws.py           # WebSocket 日誌推送
│       ├── services/
│       │   ├── commander.py    # Commander Agent（Qwen3.5-Plus CoT 推理）
│       │   ├── soldier.py      # Soldier Agent（Grounded-SAM / Qwen Vision）
│       │   ├── critic.py       # Critic Agent（對抗式驗證）
│       │   ├── rag_service.py  # RAG 進化層（ChromaDB）
│       │   ├── augmentation.py # 圖片增強（qwen-image-2.0-pro）
│       │   ├── training_service.py  # ultralytics YOLO 訓練
│       │   └── dataset_service.py   # 數據集業務邏輯
│       └── core/
│           ├── geometry.py     # 幾何邏輯函數庫（IoU, is_wearing ...）
│           └── sahi_utils.py   # SAHI 切片推理
│
├── frontend/
│   ├── Dockerfile
│   ├── nginx.conf              # Nginx 反向代理配置
│   └── src/
│       ├── App.tsx             # 路由入口
│       ├── theme.ts            # MUI 深色主題
│       ├── api/client.ts       # Axios API 封裝
│       ├── store/useStore.ts   # Zustand 全局狀態
│       ├── components/
│       │   └── Layout/         # AppBar + 側邊欄導航
│       └── pages/
│           ├── Dashboard.tsx   # 儀表板
│           ├── Datasets.tsx    # 數據集列表
│           ├── DatasetDetail.tsx  # 圖片瀏覽 + 標註編輯
│           ├── AutoLabel.tsx   # 自動標註配置 + 執行
│           ├── Training.tsx    # YOLO 訓練 + 日誌 + 圖表
│           ├── Augmentation.tsx  # 數據增強
│           └── Settings.tsx    # 系統設定
│
└── data/                       # 持久化數據（Docker volume）
    ├── datasets/               # 圖片和標註文件
    ├── models/                 # 訓練產出模型
    └── chromadb/               # 向量數據庫
```

---

## API 文檔

啟動後端後訪問 **http://localhost:8000/docs** 查看完整的 Swagger UI 文檔。

### 主要端點

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/datasets` | 創建數據集 |
| `GET` | `/api/datasets` | 列出所有數據集 |
| `POST` | `/api/datasets/{id}/images` | 批量上傳圖片 |
| `POST` | `/api/datasets/{id}/import` | 導入 YOLO/COCO/VOC 格式 |
| `GET` | `/api/datasets/{id}/export` | 導出為 YOLO 格式 |
| `GET` | `/api/images/{id}/annotations` | 查詢標註 |
| `PUT` | `/api/images/{id}/annotations` | 更新標註（觸發 RAG） |
| `POST` | `/api/labeling/run` | 啟動自動標註流水線 |
| `POST` | `/api/training/start` | 啟動 YOLO 訓練 |
| `POST` | `/api/training/jobs/{id}/stop` | 停止訓練 |
| `GET` | `/api/training/jobs/{id}/metrics` | 獲取訓練指標 |
| `WS` | `/ws/logs/{job_id}` | WebSocket 實時日誌 |
| `GET` | `/api/settings` | 獲取系統設定 |
| `PUT` | `/api/settings` | 更新系統設定 |

---

## 競爭優勢

| 比較維度 | 傳統自動標註 (Autodistill) | 純 MLLM (GPT-4V) | **LogicLabeler** |
|---------|--------------------------|-------------------|------------------|
| **語義理解** | 弱（僅名詞檢測） | 強 | **強（具備邏輯推理）** |
| **定位精度** | 中 | 低（幻覺嚴重） | **高（結合 SAM + SAHI）** |
| **品質控制** | 固定閾值 | 無 | **Agent 對抗式辯論** |
| **場景適應** | 需重訓模型 | 需微調 | **RAG 動態優化（即時）** |
| **數據增強** | 無 | 無 | **AI 條件化生成** |
| **端到端訓練** | 無 | 無 | **內建 YOLO 訓練** |

---

## License

MIT
