<div align="center">

# LogicLabeler

**基於 MLLM 語義推理與多智能體協作的下一代自動標註系統**

*讓自動標註不僅能「看見」物體，還能「理解」物體之間的關係與狀態。*

<br/>

<img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" />
<img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
<img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
<img src="https://img.shields.io/badge/MUI-6-007FFF?style=for-the-badge&logo=mui&logoColor=white" />
<img src="https://img.shields.io/badge/YOLO-v8%2Fv11-00FFFF?style=for-the-badge&logo=yolo&logoColor=white" />
<img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white" />
<img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" />

<br/><br/>

| 傳統工具能做的 | LogicLabeler 額外能做的 |
|:---:|:---:|
| 「標出所有**工人**」 | 「標出所有**未佩戴安全帽**的工人」 |
| 「標出所有**卡車**」 | 「標出所有**正在卸貨**的卡車」 |
| 「標出所有**車輛**」 | 「標出**停在禁停區域內**的車輛」 |

</div>

---

## 目錄

- [為什麼選擇 LogicLabeler](#為什麼選擇-logiclabeler)
- [功能亮點](#功能亮點)
- [系統架構](#系統架構)
- [工作流程](#工作流程)
- [技術棧](#技術棧)
- [快速啟動](#快速啟動)
- [本地開發](#本地開發)
- [配置說明](#配置說明)
- [項目結構](#項目結構)
- [API 參考](#api-參考)
- [與競品比較](#與競品比較)
- [License](#license)

---

## 為什麼選擇 LogicLabeler

在深度學習時代，高品質標註數據是 AI 系統落地的最大瓶頸。

| 痛點 | 現狀 | LogicLabeler 的解法 |
|------|------|---------------------|
|  人工標註成本高昂 | 單張複雜圖片 $0.5–2 | 多智能體自動標註，人力成本趨近零 |
|  標註效率低 | 標註員逐張手動框選 | 批量自動標註 + AI 審查，速度提升數十倍 |
|  一致性差 | 不同標註員標準不一 | 對抗式品質驗證 + RAG 記憶確保一致性 |
|  無法理解語義 | 只能做名詞檢測 | Chain-of-Thought 推理支持複合邏輯指令 |
|  標註與訓練割裂 | 多平台切換 | 從標註、增強到 YOLO 訓練的一站式閉環 |

---

## 功能亮點

###  多智能體自動標註

採用 **Commander → Soldier → Critic** 三層智能體協作架構，模擬人類團隊模式：

- **Commander** (Qwen3.5-Plus) — 理解自然語言指令，通過 CoT 推理拆解為可執行任務
- **Soldier** (Qwen-VL-Plus / Grounded-SAM) — 雙模式目標檢測，高解析度圖自動啟用 SAHI 切片推理
- **Critic** (Qwen3.5-Plus Vision) — 幾何邏輯校驗 + VLM 裁剪驗證，低置信度觸發辯論機制
- **Reviewer** — AI 二次審查功能，逐一驗證分類正確性與 BBox 位置精度

###  數據集管理

- **數據集** — 創建 / 刪除 / 批量上傳 / 導入 (YOLO・COCO・Pascal VOC 格式 ZIP) / 導出 YOLO 格式
- **圖片瀏覽** — 縮圖網格、分頁載入、篩選 (已標註/未標註/增強圖片)、批量操作
- **Canvas 標註編輯器** — 拖拽繪製 BBox、移動縮放、Undo/Redo、複製貼上、亮度對比度調整、按類別著色
- **類別管理** — CRUD、合併、重命名、分佈圖表可視化
- **數據分割** — 自動按比例分割 Train / Val / Test，支持手動拖拽調整
- **數據集統計** — 標註數量、類別分佈、寬高比散點圖、尺寸直方圖

###  AI 數據增強

利用 **qwen-image-2.0-pro** 圖像編輯模型，基於原圖 + 文字指令生成語義一致的變體圖片：

- 6 種預設增強（視角變換、明亮/昏暗光照、雨天/霧天效果、陰影方向變化）
- 增強後自動觸發 AI 標註新生成的圖片
- 前端實時增強日誌，自動限速重試
- 可在系統設定中一鍵開關

###  本地數據預處理

訓練/導出前可選擇的 **Roboflow 風格** 本地增強與預處理：

- **圖像級** — 水平翻轉、隨機旋轉、裁剪、模糊、亮度調整、灰度化、自動對比度
- **BBox 級** — Cutout、Mosaic
- **預處理** — 自動調整尺寸、自動方向校正、自適應對比度

###  本地 YOLO 訓練

內建 ultralytics 訓練模塊，無需離開平台：

- **模型選擇** — YOLOv8n / s / m / l / x、YOLO11n / s / m
- **參數配置** — Epochs、Batch Size、Image Size
- **實時監控** — WebSocket 推送訓練日誌到前端終端面板
- **訓練曲線** — Loss / mAP / Precision / Recall 即時折線圖 (Recharts)
- **生命週期管理** — 啟動 / 停止 / 繼續 (從 checkpoint 恢復) / 取消 / 刪除
- **產出瀏覽** — 直接查看訓練圖表、混淆矩陣、最佳模型權重

###  RAG 自適應進化

- 每次人工修正自動向量化存入 ChromaDB
- 再次處理相似場景時，自動檢索「歷史教訓」注入 Negative Prompts
- 越用越聰明，無需重新訓練基礎模型

###  Material Design 3 介面

- 基於 MUI v6 的 Material 3 設計語言
- 亮色 / 暗色 / 跟隨系統三種主題模式，一鍵切換
- 響應式側邊欄導航，平滑展開/收合動畫
- 所有頁面統一的圓角、色調、排版風格

---

## 系統架構

```
┌──────────────────────────────────────────────────────────────┐
│               Web GUI (React 18 + MUI v6 + Vite)             │
│                                                              │
│  ┌─────────┬─────────┬──────────┬────────┬────────┬───────┐  │
│  │ 儀表板  │ 數據集  │ 自動標註  │ 訓練   │  增強  │ 設定  │  │
│  └─────────┴─────────┴──────────┴────────┴────────┴───────┘  │
└───────────────────────────┬──────────────────────────────────┘
                            │  REST API + WebSocket
┌───────────────────────────┴──────────────────────────────────┐
│                    FastAPI Backend (Python 3.11)              │
│                                                              │
│  ┌─ Multi-Agent Pipeline ──────────────────────────────────┐ │
│  │                                                          │ │
│  │  Commander ──▶ Soldier ──▶ Critic ──▶ Reviewer          │ │
│  │  (語義推理)    (目標檢測)   (品質驗證)  (AI 審查)         │ │
│  │       │                         │                        │ │
│  │       └───── RAG 進化層 ────────┘                        │ │
│  │              (ChromaDB)                                  │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Data Services ─────────────────────────────────────────┐ │
│  │  Dataset Mgmt │ Augmentation    │ Preprocessing         │ │
│  │  (CRUD/導入/  │ (qwen-image-    │ (OpenCV/PIL           │ │
│  │   導出/分割)  │  2.0-pro)       │  本地增強)            │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Training Engine ───────────────────────────────────────┐ │
│  │  ultralytics YOLOv8/v11 │ 即時日誌 │ Checkpoint 管理    │ │
│  └──────────────────────────────────────────────────────────┘ │
│                                                              │
│  ┌─ Core Modules ──────────────────────────────────────────┐ │
│  │  Geometry Engine (IoU, is_wearing, contains, ...)       │ │
│  │  SAHI 高解析度切片推理                                    │ │
│  └──────────────────────────────────────────────────────────┘ │
└──────┬──────────────────┬──────────────────┬─────────────────┘
       │                  │                  │
  ┌────┴────┐       ┌─────┴─────┐      ┌────┴──────┐
  │ SQLite  │       │ ChromaDB  │      │ File Store│
  │ (元數據) │       │ (向量記憶) │      │ (圖片/模型)│
  └─────────┘       └───────────┘      └───────────┘
```

---

## 工作流程

### 自動標註流程

```
用戶輸入自然語言指令（例：「標出所有未佩戴安全帽的工人」）
    │
    ▼
┌───────────────────────────────────────┐
│  Commander — 語義推理與任務拆解         │
│  • Chain-of-Thought 推理               │
│  • RAG 檢索歷史錯誤注入                │
│  • 輸出結構化 JSON 執行計劃             │
└────────────────┬──────────────────────┘
                 ▼
┌───────────────────────────────────────┐
│  Soldier — 目標檢測執行                │
│  • 模式 A: Qwen-VL-Plus (雲端 API)    │
│  • 模式 B: Grounded-SAM (本地推理)     │
│  • 高解析度圖自動啟用 SAHI 切片推理     │
│  • 輸出候選 BBox + 置信度               │
└────────────────┬──────────────────────┘
                 ▼
┌───────────────────────────────────────┐
│  Critic — 品質對抗驗證                 │
│  • 幾何邏輯校驗 (IoU, is_wearing ...)  │
│  • VLM 裁剪區域驗證                    │
│  • 低置信度觸發多輪辯論                │
└────────────────┬──────────────────────┘
                 ▼
┌───────────────────────────────────────┐
│  Reviewer — AI 二次審查 (可選)          │
│  • 逐一裁剪 BBox 區域送入 VLM          │
│  • 驗證分類正確性 + BBox 貼合度         │
│  • 標記 approved / rejected / corrected│
└────────────────┬──────────────────────┘
                 ▼
     標註結果存入數據集
         │
         ▼ (若用戶手動修正)
┌───────────────────────────────────────┐
│  RAG 進化記憶                          │
│  • 修正記錄向量化存入 ChromaDB          │
│  • 下次相似場景自動注入 Negative Prompts│
└───────────────────────────────────────┘
```

### 訓練閉環流程

```
  創建/導入數據集
        │
        ▼
  自動標註 + AI 審查 + 人工微調
        │
        ▼
  ┌─ 訓練前 Preprocessing Dialog ─┐
  │  • 選擇本地增強 (翻轉/旋轉..) │
  │  • 配置預處理 (resize/對比度)  │
  └──────────────┬────────────────┘
                 ▼
  配置 YOLO 參數 → 啟動訓練
        │
        ├──▶ WebSocket 實時日誌
        ├──▶ 訓練曲線即時更新
        └──▶ 停止 / 繼續 / 取消 控制
                 │
                 ▼
  瀏覽產出 → 下載最佳模型權重
```

---

## 技術棧

| 層級 | 技術 | 說明 |
|:----:|------|------|
| **前端** | React 18 + TypeScript + MUI v6 | Material Design 3 響應式介面，亮/暗主題 |
| **構建** | Vite 6 | 極速 HMR 開發體驗 |
| **狀態管理** | Zustand 5 | 輕量持久化狀態管理 |
| **圖表** | Recharts 2 | 訓練曲線與數據統計可視化 |
| **後端** | Python 3.11 + FastAPI | 異步 REST API + WebSocket |
| **ORM** | SQLAlchemy + SQLite | 元數據持久化 |
| **向量庫** | ChromaDB | RAG 錯誤記憶存儲 |
| **推理引擎** | Qwen3.5-Plus (DashScope) | Commander + Critic 語義推理 |
| **視覺檢測** | Qwen-VL-Plus / Grounded-SAM | Soldier 雙模式目標檢測 |
| **圖片生成** | qwen-image-2.0-pro (DashScope) | AI 數據增強（圖像編輯） |
| **本地增強** | OpenCV + Pillow | Roboflow 風格預處理/增強 |
| **模型訓練** | ultralytics | YOLOv8 / YOLO11 本地訓練 |
| **高解析度** | SAHI | 切片推理支持超大尺寸圖像 |
| **部署** | Docker Compose | 一鍵啟動 3 個微服務 |

---

## 快速啟動

### 前置需求

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) v2+
- [DashScope API Key](https://dashscope.console.aliyun.com/) (阿里雲百煉平台，用於 AI 標註與增強)

### 一鍵部署

```bash
# 1. 克隆項目
git clone https://github.com/your-org/LogicLabeler.git
cd LogicLabeler

# 2. (可選) 設置環境變量，也可稍後在 GUI 中配置
cp .env.example .env
# 編輯 .env 填入 DASHSCOPE_API_KEY

# 3. 構建並啟動所有服務
docker compose up --build -d

# 4. 等待服務就緒 (約 30-60 秒)
docker compose logs -f
```

服務啟動後：

| 服務 | 地址 | 說明 |
|------|------|------|
| **前端界面** | http://localhost | React 應用 (Nginx 代理) |
| **API 文檔** | http://localhost:8000/docs | Swagger UI 交互式文檔 |
| **ChromaDB** | http://localhost:8100 | 向量數據庫 (內部使用) |

> **首次使用**：前往「系統設定」頁面填入 DashScope API Key 即可開始使用 AI 功能。

### 停止/重啟

```bash
docker compose down        # 停止並移除容器
docker compose up -d       # 後台啟動
docker compose restart     # 重啟所有服務
```

---

## 本地開發

如果需要在本地進行開發調試，可以分別啟動前後端：

### 後端

```bash
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# 確保 ChromaDB 運行中（可單獨啟動）
docker compose up chromadb -d

# 啟動開發服務器
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
# 訪問 http://localhost:5173（Vite 自動代理 /api 到 8000）
```

---

## 配置說明

### 環境變量

| 變量 | 說明 | 默認值 |
|------|------|--------|
| `DASHSCOPE_API_KEY` | 阿里雲 DashScope API Key | — (可在 GUI 中設定) |
| `DATABASE_URL` | SQLite 數據庫路徑 | `sqlite:///./data/logiclabeler.db` |
| `CHROMADB_HOST` | ChromaDB 主機地址 | `chromadb` (Docker) / `localhost` |
| `CHROMADB_PORT` | ChromaDB 端口 | `8100` |
| `DATA_DIR` | 數據持久化根目錄 | `./data` |

### GUI 運行時配置

以下配置均可在前端「系統設定」頁面中隨時修改，**無需重啟服務**：

- **DashScope API Key** — AI 標註 & 增強的 API 密鑰
- **Soldier 模式** — 切換雲端 API 或本地推理
- **數據增強開關** — 啟用/停用 AI 圖片生成功能
- **介面主題** — 亮色 / 暗色 / 跟隨系統

---

## 項目結構

```
LogicLabeler/
├── docker-compose.yml              # Docker 編排（backend + frontend + chromadb）
├── .env.example                    # 環境變量模板
├── LICENSE                         # MIT License
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                 # FastAPI 入口 + 靜態文件掛載
│       ├── config.py               # Pydantic Settings 全局配置
│       ├── database.py             # SQLAlchemy 引擎 + Session
│       ├── models.py               # ORM 模型 (Dataset, Image, Annotation, TrainingJob)
│       │
│       ├── api/                    # API 路由層
│       │   ├── datasets.py         # 數據集 CRUD・導入導出・分割・統計
│       │   ├── labeling.py         # 自動標註流水線觸發
│       │   ├── training.py         # YOLO 訓練管理 (啟動/停止/繼續/取消/刪除)
│       │   ├── augmentation.py     # AI 數據增強 API
│       │   ├── settings.py         # 系統設定讀寫
│       │   └── ws.py              # WebSocket 日誌推送
│       │
│       ├── services/               # 業務邏輯層
│       │   ├── commander.py        # Commander Agent — CoT 語義推理
│       │   ├── soldier.py          # Soldier Agent — 目標檢測 (雲端/本地)
│       │   ├── critic.py           # Critic Agent — 對抗式品質驗證
│       │   ├── reviewer.py         # Reviewer — AI 標註二次審查
│       │   ├── rag_service.py      # RAG 進化層 (ChromaDB 記憶)
│       │   ├── augmentation.py     # AI 圖片增強 (qwen-image-2.0-pro)
│       │   ├── preprocessing.py    # 本地增強/預處理 (OpenCV + PIL)
│       │   ├── training_service.py # ultralytics 訓練管理 + Checkpoint 恢復
│       │   └── dataset_service.py  # 數據集業務邏輯
│       │
│       └── core/                   # 核心工具模塊
│           ├── geometry.py         # 幾何邏輯函數庫 (IoU, is_wearing, contains ...)
│           └── sahi_utils.py       # SAHI 高解析度切片推理
│
├── frontend/
│   ├── Dockerfile                  # 多階段構建 (Node build → Nginx)
│   ├── nginx.conf                  # Nginx 反向代理 + SPA fallback
│   └── src/
│       ├── main.tsx                # React 入口
│       ├── App.tsx                 # 路由 + 動態主題 Provider
│       ├── theme.ts                # Material 3 主題 (亮/暗)
│       │
│       ├── api/
│       │   └── client.ts           # Axios API 封裝 (所有後端接口)
│       │
│       ├── store/
│       │   └── useStore.ts         # Zustand 全局狀態 (含持久化)
│       │
│       ├── components/
│       │   ├── Layout/Layout.tsx   # AppBar + 側邊欄導航 + 主題切換
│       │   ├── ClassManager.tsx    # 類別管理對話框
│       │   ├── DatasetStats.tsx    # 數據集統計圖表
│       │   └── PreprocessDialog.tsx # 訓練/導出前增強預處理配置
│       │
│       └── pages/
│           ├── Dashboard.tsx       # 儀表板 — 統計概覽 + 快捷操作
│           ├── Datasets.tsx        # 數據集列表 — 創建/刪除/批量管理
│           ├── DatasetDetail.tsx   # 圖片瀏覽 + Canvas 標註編輯器
│           ├── AutoLabel.tsx       # 自動標註配置 + AI 審查 + 即時日誌
│           ├── Training.tsx        # YOLO 訓練 — 任務管理/日誌/曲線/產出
│           ├── Augmentation.tsx    # AI 數據增強 — 類型選擇 + 進度日誌
│           └── Settings.tsx        # 系統設定 — API Key/主題/模式/狀態
│
└── data/                           # 持久化數據 (Docker volume 掛載)
    ├── logiclabeler.db             # SQLite 數據庫
    ├── datasets/                   # 圖片和標註文件
    ├── models/                     # 訓練產出 (權重/圖表/日誌)
    └── chromadb/                   # ChromaDB 向量數據
```

---

## API 參考

啟動後端後訪問 http://localhost:8000/docs 查看完整的 Swagger UI 文檔。

<details>
<summary><b>主要端點一覽</b> (點擊展開)</summary>

### 數據集管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/datasets` | 創建數據集 |
| `GET` | `/api/datasets` | 列出所有數據集 |
| `GET` | `/api/datasets/{id}` | 獲取數據集詳情 |
| `DELETE` | `/api/datasets/{id}` | 刪除數據集 |
| `POST` | `/api/datasets/{id}/images` | 批量上傳圖片 (自動轉換 JPG) |
| `GET` | `/api/datasets/{id}/images` | 分頁查詢圖片 (篩選/排序) |
| `POST` | `/api/datasets/{id}/import` | 導入 YOLO / COCO / VOC 格式 ZIP |
| `GET` | `/api/datasets/{id}/export` | 導出 YOLO 格式 ZIP |
| `POST` | `/api/datasets/{id}/export` | 帶預處理/增強的導出 |
| `GET` | `/api/datasets/{id}/stats` | 數據集統計信息 |
| `POST` | `/api/datasets/{id}/auto-split` | 自動分割 Train/Val/Test |

### 標註管理

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/images/{id}/annotations` | 查詢圖片標註 |
| `PUT` | `/api/images/{id}/annotations` | 更新標註 (觸發 RAG 記憶) |

### 自動標註

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/labeling/run` | 啟動自動標註流水線 |

### YOLO 訓練

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/training/start` | 啟動訓練任務 |
| `GET` | `/api/training/jobs` | 列出所有訓練任務 |
| `POST` | `/api/training/jobs/{id}/stop` | 停止訓練 |
| `POST` | `/api/training/jobs/{id}/resume` | 從 checkpoint 繼續訓練 |
| `POST` | `/api/training/jobs/{id}/cancel` | 取消訓練 (強制終止) |
| `DELETE` | `/api/training/jobs/{id}` | 刪除訓練任務 |
| `GET` | `/api/training/jobs/{id}/metrics` | 獲取訓練指標 |
| `GET` | `/api/training/jobs/{id}/log` | 獲取完整訓練日誌 |
| `GET` | `/api/training/jobs/{id}/artifacts` | 列出訓練產出文件 |
| `WS` | `/ws/logs/{job_id}` | WebSocket 實時日誌推送 |

### 數據增強

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/augmentation/run` | 啟動 AI 數據增強 |

### 系統設定

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/settings` | 獲取當前設定 |
| `PUT` | `/api/settings` | 更新設定 (API Key / 模式等) |
| `GET` | `/api/health` | 健康檢查 |

</details>

---

## 與競品比較

| 維度 | Autodistill | GPT-4V 直接標註 | Roboflow | **LogicLabeler** |
|------|:-----------:|:---------------:|:--------:|:----------------:|
| 語義推理 | ❌ 僅名詞檢測 | ✅ 強 | ❌ | ✅ **CoT 邏輯推理** |
| 定位精度 | 🔶 中 | ❌ 幻覺嚴重 | ✅ | ✅ **SAM + SAHI** |
| 品質控制 | 🔶 固定閾值 | ❌ 無 | 🔶 規則 | ✅ **Agent 對抗辯論** |
| 場景適應 | ❌ 需重訓 | 🔶 需微調 | ❌ | ✅ **RAG 即時優化** |
| AI 增強 | ❌ | ❌ | 🔶 本地變換 | ✅ **AI 生成 + 本地** |
| 本地預處理 | ❌ | ❌ | ✅ | ✅ |
| 端到端訓練 | ❌ | ❌ | ✅ | ✅ **YOLO 訓練閉環** |
| 訓練控制 | ❌ | ❌ | 🔶 | ✅ **停止/繼續/取消** |
| AI 審查 | ❌ | ❌ | ❌ | ✅ **VLM 二次驗證** |
| 自部署 | ✅ | ❌ 雲端 | ❌ 雲端 | ✅ **Docker 私有部署** |

---

## License

本項目基於 [MIT License](./LICENSE) 開源。

Copyright (c) 2026 FONG, KUN FAI

---

<div align="center">

*Built with ❤️ using Qwen, React, FastAPI & ultralytics*

</div>
