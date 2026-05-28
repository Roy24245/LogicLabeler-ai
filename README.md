<div align="center">

<img src="./logiclabeler_logo.png" alt="LogicLabeler Logo" width="150" />

# LogicLabeler

**基於 MLLM 語義推理與多智能體協作的下一代自動標註系統**

*讓自動標註不僅能「看見」物體，還能「理解」物體之間的關係與狀態。*

<br/>

<img src="https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white" />
<img src="https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=white" />
<img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white" />
<img src="https://img.shields.io/badge/MUI%20v6-Material%203-007FFF?style=for-the-badge&logo=mui&logoColor=white" />
<img src="https://img.shields.io/badge/YOLO-v8%2Fv11-00FFFF?style=for-the-badge&logo=yolo&logoColor=white" />
<img src="https://img.shields.io/badge/Qwen-DashScope-FF6A00?style=for-the-badge" />
<img src="https://img.shields.io/badge/OpenAI-Compatible-412991?style=for-the-badge&logo=openai&logoColor=white" />
<img src="https://img.shields.io/badge/Anthropic-Claude-CC785C?style=for-the-badge" />
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
- [核心亮點](#核心亮點)
- [功能總覽](#功能總覽)
- [系統架構](#系統架構)
- [工作流程](#工作流程)
- [技術棧](#技術棧)
- [快速啟動](#快速啟動)
- [初次啟動體驗](#初次啟動體驗)
- [本地開發](#本地開發)
- [配置說明](#配置說明)
- [項目結構](#項目結構)
- [API 參考](#api-參考)
- [與競品比較](#與競品比較)
- [更新日誌（Changelog）](#更新日誌changelog)
- [License](#license)

---

## 為什麼選擇 LogicLabeler

在深度學習時代，高品質標註數據是 AI 系統落地的最大瓶頸。

| 痛點 | 現狀 | LogicLabeler 的解法 |
|------|------|---------------------|
| 人工標註成本高昂 | 單張複雜圖片 $0.5–2 | 多智能體自動標註，人力成本趨近零 |
| 標註效率低 | 標註員逐張手動框選 | 批量自動標註 + AI 審查，速度提升數十倍 |
| 一致性差 | 不同標註員標準不一 | 對抗式品質驗證 + RAG 記憶確保一致性 |
| 無法理解語義 | 只能做名詞檢測 | Chain-of-Thought 推理支持複合邏輯指令 |
| 模型供應商鎖定 | 必須綁定單一服務 | 支援 DashScope / OpenAI / Anthropic 自由切換 |
| 標註與訓練割裂 | 多平台切換 | 從標註、增強到 YOLO 訓練的一站式閉環 |

---

## 核心亮點

###  多模型供應商抽象層
不再被 API 鎖死。內建 **DashScope (Qwen)** 為預設，並可隨時加入 **OpenAI 相容** (OpenAI / OpenRouter / DeepSeek / Ollama / vLLM…) 與 **Anthropic Claude** 供應商；文字 (Commander) 與視覺 (Soldier / Critic / Reviewer) 任務可分別指定不同的模型。

###  多智能體 + RAG 自進化
**Commander → Soldier → Critic → Reviewer** 四階段流水線，每次人工修正都會向量化進入 ChromaDB，下次處理相似場景時自動注入「歷史教訓」作為 Negative Prompts，越用越聰明。

###  Open Vocabulary 細粒度識別
Commander 會自動判讀「如 / 例如 / 包括但不限於」這類**示例性**用語，把「貓（如英短、布偶、暹羅）」理解為 **主類別 cat + 範例品種**，並開啟 `open_vocabulary` 模式，讓 Soldier 用真實品種（Persian、Tabby、Maine Coon…）命名 class_name，而非被硬塞進範例三選一；遇到無法 100% 辨識的個體會輸出 `cat (uncertain)` 或 `cat (unknown breed)`，**不漏標、不錯標**。當使用者改用「只 / 僅 / strictly」等限定詞，則自動切回封閉類別模式。

###  專業級多形狀標註工具
Canvas 編輯器內建 **BBox / Polygon / Keypoint / Oriented BBox** 四種形狀工具，加上 **Smart Segment**（OpenCV GrabCut，點一下就生 polygon）、**一鍵 AI 標註本圖**、放大鏡 Loupe、像素網格、Mini-map、邊緣磁吸、屬性面板（occluded / truncated / blur / note）與圖片層級的 verified / tags / split 元資料；資料集 Settings 還能編輯 **Keypoint Schema**（關節名稱 + skeleton edges）。匯出時自動偵測為 YOLO Detect / Segment / Pose / OBB 對應格式。

###  AI Prompt Optimizer
標註指令、數據增強指令旁皆內建「優化 Prompt」按鈕。一鍵向 LLM 發起優化，並回傳 **3 種風格**（更具體 / 加入邏輯 / 更精簡）讓您挑選或重新生成。

###  AI 數據增強 + 自動標註
基於 **qwen-image-2.0-pro** 圖像編輯模型，根據原圖 + 文字指令生成語義一致的變體（雨天、霧天、視角、光照…），並自動為新圖片觸發完整的標註流水線。

###  一鍵 YOLO 訓練閉環
ultralytics + WebSocket 即時日誌 + Recharts 訓練曲線，停止 / 繼續 (checkpoint) / 取消 / 刪除 全套生命週期管理。

###  Material Design 3 介面
基於 MUI v6 + 自製主題，全站統一的 PageHeader / SectionCard / LogConsole 等元件，亮 / 暗 / 跟隨系統一鍵切換。首次啟動更有 **多步驟初始化精靈** 引導完成 API、模型、外觀設定。

---

## 功能總覽

### 🤖 多智能體自動標註

採用 **Commander → Soldier → Critic → Reviewer** 四層智能體協作架構：

| 智能體 | 預設模型 | 任務 |
|---|---|---|
| **Commander** | 任意文字模型（預設 `qwen-plus`） | 理解自然語言指令，CoT 推理拆解為主類別 + `examples` 範例品種 + `open_vocabulary` 旗標，整合 RAG 歷史教訓 |
| **Soldier** | 任意視覺模型 / Grounded-SAM | 雙模式目標檢測，依 `open_vocabulary` 切換**封閉類別**或**開放詞彙（細粒度品種命名）**，高解析度圖自動啟用 SAHI 切片推理 |
| **Critic** | 任意視覺模型 | 幾何邏輯校驗 (`is_wearing` / `contains` / `IoU` …) + VLM 裁剪驗證 + 多輪辯論 |
| **Reviewer** | 任意視覺模型 | 標註完成後逐一裁剪 BBox 送入 VLM 二次審查，支援一鍵套用修正 |

#### 開放詞彙 vs 封閉類別 — Commander 怎麼判讀？

| 使用者用語 | 例 | Commander 輸出 |
|---|---|---|
| 「**如** / 例如 / 比如 / 包括但不限於 / e.g. / such as」 | 「貓（**如**英短、布偶、暹羅）」 | `targets=["cat"]`、`examples={"cat":[英短,布偶,暹羅]}`、`open_vocabulary=true` |
| 「**只** / 僅 / strictly / must be one of」或單純列舉 | 「**只**檢測 cat、dog、person」 | `targets=["cat","dog","person"]`、`examples={}`、`open_vocabulary=false` |

開啟 open vocabulary 後，Soldier 會被告知「以實際品種命名 `class_name`，範例只是 hint，不限於這些」；不確定時輸出 `<主類別> (uncertain)`，完全無法判斷時輸出 `<主類別> (unknown breed)`，**保證每個物件都被標到**。

### 🔌 模型供應商管理

- **內建 DashScope**（不可刪除）— Qwen 系列
- **新增 OpenAI 相容供應商** — OpenAI / OpenRouter / DeepSeek / Ollama / vLLM 等任何走 `/v1/chat/completions` 規範的服務
- **新增 Anthropic Claude** — 支援 Claude 4.5 / 3.5 系列
- 文字 / 視覺模型可分別獨立指定，圖片生成（數據增強）固定使用 DashScope 的 `qwen-image-2.0-pro`
- 在系統設定可即時切換、編輯、刪除自訂供應商，無需重啟

### 💡 Prompt Optimizer

- 兩個位置內建：**自動標註頁** 的標註指令、**數據增強頁** 的標註指令
- 點擊「優化 Prompt」由 LLM 回傳 **3 種優化版本**：
  - **更具體** — 加入細節描述提升精確度
  - **加入邏輯** — 加入條件、排除等複合語義
  - **更精簡** — 提煉核心需求降低 hallucination
- 一鍵套用、隨時重新生成

### 🎯 初次啟動精靈

5 步驟引導，自動偵測既有狀態：

1. **歡迎** — 簡介產品理念
2. **外觀** — 亮色 / 跟隨系統 / 暗色，即時套用
3. **API Key** — **若已偵測到 DashScope key 會顯示「已配置」狀態與「修改」按鈕**；未配置則顯示輸入框
4. **模型供應商** — 跳過使用預設 Qwen，或現場新增 OpenAI / Anthropic 供應商
5. **完成** — 顯示設定摘要，按下「開始使用」進入儀表板

可隨時從「系統設定」右上角的「重新執行初始化」按鈕再次觸發。

### 📦 數據集管理

- **數據集 CRUD** — 創建、刪除、批量上傳、自動轉 JPG（多次上傳不會覆蓋既有圖片）
- **多格式互通** — 導入支援 YOLO / COCO / Pascal VOC ZIP；匯出依任務型態自動選擇 YOLO Detect / Segment / Pose / OBB，或 COCO（含 segmentation + keypoints）
- **數據集詳情頁** — 含「保存數據集」（內建預處理 / 增強配置彈窗）與「刪除數據集」確認對話框
- **圖片瀏覽** — 縮圖網格、分頁載入、篩選（已標註 / 未標註 / 已驗證 / 增強圖片）、批量操作、verified 視覺徽章
- **Annotator（內建標註編輯器）**
  - **四種形狀工具**：BBox · Polygon（點擊加頂點、Enter 收尾、邊中點插入、右鍵刪頂點）· Keypoint（依 dataset schema 命名）· Oriented BBox（拖出矩形 + 旋轉 handle）
  - **AI 助手**：Smart Segment（GrabCut 點一下生 polygon）、工具列「一鍵自動標註本圖」按鈕（會自動走 Commander → Soldier，享受 open vocabulary 細粒度命名）
  - **視覺輔助**：放大鏡 Loupe、像素網格、Mini-map、邊緣磁吸、按類別著色 / 顯示隱藏
  - **編輯操作**：Undo/Redo、複製貼上、鎖定、方向鍵微調、Shift 等比例、座標手動輸入、數字熱鍵切換類別、Fit View、亮度對比度調整
  - **屬性與元資料**：每個標註支援 occluded / truncated / blur / note 屬性；每張圖支援 `verified` / `tags` / `note` / `split` 元資料
  - **列表面板**：搜尋、類別 filter chips、Shift 多選、批量改類 / 刪除 / 鎖定
  - **快捷鍵說明**：工具列 `?` 按鈕展開完整熱鍵表
- **Keypoint Schema 編輯器** — 在資料集 Settings 定義關節名稱清單與 skeleton edges，匯出 YOLO Pose 時自動寫進 `data.yaml`
- **類別管理** — CRUD、合併、重命名、分佈圖表可視化
- **數據分割** — 自動按比例分割 Train / Val / Test，支援手動調整
- **數據集統計** — 標註數量、類別分佈、寬高比散點圖、尺寸直方圖

### 🎨 AI 數據增強

利用 **qwen-image-2.0-pro** 圖像編輯模型，基於原圖 + 文字指令生成語義一致的變體圖片：

- **6 種預設增強** — 視角變換、明亮 / 昏暗光照、雨天 / 霧天效果、陰影方向變化
- **自動標註** — 增強後自動觸發 AI 標註新生成的圖片
- **實時日誌** — 前端終端面板即時顯示流程
- **限速重試** — 自動處理 DashScope 配額限制
- **Prompt Optimizer** — 標註指令一鍵優化
- **可隨時關閉** — 在系統設定中一鍵啟用/停用

### 🛠 本地數據預處理

訓練 / 導出前可選擇的本地增強與預處理：

- **圖像級** — 水平翻轉、隨機旋轉、裁剪、模糊、亮度調整、灰度化、自動對比度
- **BBox 級** — Cutout、Mosaic
- **預處理** — 自動調整尺寸、自動方向校正、自適應對比度

### 🚀 本地 YOLO 訓練

內建 ultralytics 訓練模塊，無需離開平台：

- **模型選擇** — YOLOv8 n / s / m / l / x、YOLO11 n / s / m
- **參數配置** — Epochs、Batch Size、Image Size
- **實時監控** — WebSocket 推送訓練日誌到前端終端面板
- **訓練曲線** — Loss / mAP / Precision / Recall 即時折線圖（Recharts）
- **生命週期管理** — 啟動 / 停止 / 繼續（從 checkpoint 恢復）/ 取消 / 刪除
- **產出瀏覽** — 直接查看訓練圖表、混淆矩陣、最佳模型權重

### 🧠 RAG 自適應進化

- 每次人工修正自動向量化存入 ChromaDB
- 再次處理相似場景時，自動檢索「歷史教訓」注入 Negative Prompts
- 越用越聰明，無需重新訓練基礎模型

### 🎨 Material Design 3 介面

- 基於 MUI v6 + 自製 M3 主題系統，亮 / 暗 / 跟隨系統三模式
- 全站統一的可重用元件：`PageHeader`、`SectionCard`、`LogConsole`、`PromptOptimizerDialog`、`PreprocessDialog`
- pill-shaped 按鈕、tonal button variant、rounded card surface、M3 動效
- 響應式側邊欄，分組導航（總覽 / 數據 / 智能 / 訓練 / 系統）
- M3 規範 Surface Tone、Tooltip、Switch、ListItemButton selected 狀態

---

## 系統架構

```
┌────────────────────────────────────────────────────────────────────┐
│            Web GUI (React 18 + MUI v6 / Material 3 + Vite)          │
│                                                                    │
│  Onboarding Wizard ──▶ 5-step 初始化（含 API Key 自動偵測）          │
│  ┌─────────┬─────────┬──────────┬────────┬────────┬───────┐         │
│  │ 儀表板  │ 數據集  │ 自動標註 │ 訓練   │ 增強   │ 設定  │         │
│  │         │         │ + Optim. │        │ + Optim│       │         │
│  └─────────┴─────────┴──────────┴────────┴────────┴───────┘         │
│  共用元件：PageHeader · SectionCard · LogConsole · PromptOptimizer   │
└─────────────────────────────┬──────────────────────────────────────┘
                              │  REST API + WebSocket
┌─────────────────────────────┴──────────────────────────────────────┐
│                  FastAPI Backend (Python 3.11)                     │
│                                                                    │
│  ┌─ Multi-Provider Abstraction (model_providers.py) ─────────────┐ │
│  │  DashScope (Qwen)    │   OpenAI 相容   │   Anthropic Claude   │ │
│  │  text_complete()     │   vision_complete()                    │ │
│  └────────────────────────────┬───────────────────────────────────┘ │
│                               │ 統一介面                            │
│  ┌─ Multi-Agent Pipeline ─────┴───────────────────────────────────┐ │
│  │                                                                │ │
│  │  Commander ──▶ Soldier ──▶ Critic ──▶ Reviewer                │ │
│  │  (語義推理)    (目標檢測)   (品質驗證)  (二次審查)               │ │
│  │       │                          │                              │ │
│  │       └────── RAG 進化層 ────────┘                              │ │
│  │              (ChromaDB)                                        │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Data Services ───────────────────────────────────────────────┐ │
│  │  Dataset Mgmt │ AI 增強           │ 本地 Preprocessing         │ │
│  │  (CRUD/導入/  │ (qwen-image-      │ (OpenCV/PIL                │ │
│  │   導出/分割)  │  2.0-pro)         │  圖像/BBox 增強)           │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Training Engine ─────────────────────────────────────────────┐ │
│  │  ultralytics YOLOv8/v11 │ 即時日誌 │ Checkpoint 管理            │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                    │
│  ┌─ Core Modules ────────────────────────────────────────────────┐ │
│  │  Geometry Engine (IoU, is_wearing, contains, ...)             │ │
│  │  SAHI 高解析度切片推理   ·   Prompt Optimizer (LLM-as-a-tool)  │ │
│  └────────────────────────────────────────────────────────────────┘ │
└──────┬──────────────────┬──────────────────┬────────────────────────┘
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
    ├──▶ (可選) Prompt Optimizer：點擊「優化 Prompt」獲得 3 種版本
    │
    ▼
┌───────────────────────────────────────┐
│  Commander — 語義推理與任務拆解         │
│  • Chain-of-Thought 推理               │
│  • 「如/例如/包括但不限於」判讀         │
│    → 主類別 + examples + open_vocabulary│
│  • RAG 檢索歷史錯誤注入                 │
│  • 透過 model_providers 路由到指定模型   │
│  • 輸出結構化 JSON 執行計劃             │
└────────────────┬──────────────────────┘
                 ▼
┌───────────────────────────────────────┐
│  Soldier — 目標檢測執行                │
│  • 模式 A: 視覺 API (Qwen-VL/GPT-4V/Claude-Vision)│
│  • 模式 B: Grounded-SAM (本地推理)     │
│  • open_vocabulary=ON → 細粒度品種命名  │
│    （Persian、Tabby、Mixed…不限範例）   │
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
│  • 標記 approved / rejected / needs_adjustment│
│  • 一鍵套用修正                        │
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
                 │
                 ▼
       (可選) 保存數據集 ZIP，或直接刪除釋放空間
```

---

## 技術棧

| 層級 | 技術 | 說明 |
|:----:|------|------|
| **前端框架** | React 18 + TypeScript | SPA，支援嚴格類型 |
| **UI 系統** | MUI v6 + 自製 M3 主題 | Material Design 3，亮/暗主題 |
| **構建** | Vite 6 | 極速 HMR 開發體驗 |
| **狀態管理** | Zustand 5 (持久化) | 輕量 + localStorage 持久化 |
| **圖表** | Recharts 2 | 訓練曲線與數據統計可視化 |
| **後端** | Python 3.11 + FastAPI | 異步 REST API + WebSocket |
| **ORM** | SQLAlchemy + SQLite | 元數據持久化 |
| **向量庫** | ChromaDB | RAG 錯誤記憶存儲 |
| **預設文字模型** | Qwen3.5-Plus (DashScope) | Commander |
| **預設視覺模型** | Qwen-VL-Plus (DashScope) | Soldier · Critic · Reviewer |
| **可替換供應商** | OpenAI 相容 / Anthropic | 統一抽象層動態切換 |
| **本地視覺檢測** | Grounded-SAM | Soldier 本地模式 |
| **圖片生成** | qwen-image-2.0-pro | AI 數據增強（圖像編輯） |
| **本地增強** | OpenCV + Pillow | 圖像/BBox 級預處理與增強 |
| **模型訓練** | ultralytics | YOLOv8 / YOLO11 本地訓練 |
| **高解析度** | SAHI | 切片推理支持超大尺寸圖像 |
| **部署** | Docker Compose | 一鍵啟動 3 個微服務 |

---

## 快速啟動

### 前置需求

- [Docker](https://docs.docker.com/get-docker/) & [Docker Compose](https://docs.docker.com/compose/install/) v2+
- 至少一個 LLM 供應商的 API Key：
  - [DashScope API Key](https://bailian.console.aliyun.com/?apiKey=1)（推薦，預設使用，亦支援數據增強）
  - 或 OpenAI / DeepSeek / OpenRouter / Anthropic / Ollama 等任一相容服務（可在 GUI 中新增）

### 一鍵部署

```bash
# 1. 克隆項目
git clone https://github.com/Roy24245/LogicLabeler.git
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

> **首次使用**：頁面會自動進入 5 步驟初始化精靈，引導您完成主題、API Key、模型供應商設定。

### 停止/重啟

```bash
docker compose down        # 停止並移除容器
docker compose up -d       # 後台啟動
docker compose restart     # 重啟所有服務
```

---

## 初次啟動體驗

第一次打開頁面時，您會看到全螢幕的初始化精靈：

```
 ┌─────────────────────────────────────────────────────────────┐
 │  [●]──[●]──[●]──[●]──[●]                                    │
 │   1    2    3    4    5                                     │
 │  歡迎  外觀  Key  供應商  完成                                │
 │                                                             │
 │   ┌──────────────────────────────────────────────────────┐  │
 │   │  • 第 1 步：歡迎介紹（含 logo）                        │  │
 │   │  • 第 2 步：選擇亮色 / 跟隨系統 / 暗色（即時套用）       │  │
 │   │  • 第 3 步：DashScope API Key                          │  │
 │   │           ─ 已配置：顯示「已偵測到既有 API Key」         │  │
 │   │             + 修改按鈕（可選擇是否更換）                  │  │
 │   │           ─ 未配置：顯示輸入框（可選填）                  │  │
 │   │  • 第 4 步：模型供應商                                  │  │
 │   │           ─ 使用預設 Qwen，或新增 OpenAI / Anthropic     │  │
 │   │  • 第 5 步：摘要確認 → 開始使用                          │  │
 │   └──────────────────────────────────────────────────────┘  │
 │                                                             │
 │  [上一步]                              [跳過] [下一步 →]     │
 └─────────────────────────────────────────────────────────────┘
```

之後可在「系統設定」右上角的「重新執行初始化」按鈕隨時再次觸發。

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
- **模型供應商** — 新增 / 編輯 / 刪除 OpenAI 相容、Anthropic 供應商
- **文字模型 (Commander)** — 跨供應商選擇任一模型
- **視覺模型 (Soldier / Critic / Reviewer)** — 跨供應商選擇任一視覺模型
- **Soldier 模式** — 視覺 API 或 Grounded-SAM 本地推理
- **數據增強開關** — 啟用/停用 AI 圖片生成功能
- **介面主題** — 亮色 / 暗色 / 跟隨系統
- **重新執行初始化** — 一鍵重啟初始化精靈

---

## 項目結構

```
LogicLabeler/
├── docker-compose.yml              # Docker 編排（backend + frontend + chromadb）
├── .env.example                    # 環境變量模板
├── logiclabeler_logo.png           # 品牌標誌
├── LICENSE                         # MIT License
│
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt            # 含 openai / anthropic / dashscope SDK
│   └── app/
│       ├── main.py                 # FastAPI 入口 + 啟動載入設定
│       ├── config.py               # Pydantic Settings 全局配置
│       ├── database.py             # SQLAlchemy 引擎 + Session
│       ├── models.py               # ORM 模型 (Dataset, Image, Annotation, TrainingJob, Settings)
│       │
│       ├── api/                    # API 路由層
│       │   ├── datasets.py         # 數據集 CRUD・導入導出・分割・統計
│       │   ├── labeling.py         # 自動標註 + AI 審查 + Prompt Optimizer
│       │   ├── training.py         # YOLO 訓練管理 (啟動/停止/繼續/取消/刪除)
│       │   ├── augmentation.py     # AI 數據增強 API
│       │   ├── settings.py         # 系統設定 + 模型供應商 CRUD + 主動模型切換
│       │   └── ws.py               # WebSocket 訓練日誌推送
│       │
│       ├── services/               # 業務邏輯層
│       │   ├── model_providers.py  # ★ 多供應商抽象層（DashScope/OpenAI/Anthropic）
│       │   ├── commander.py        # Commander Agent — 透過 mp.text_complete()
│       │   ├── soldier.py          # Soldier Agent — 透過 mp.vision_complete()
│       │   ├── critic.py           # Critic Agent — 透過 mp.vision_complete()
│       │   ├── reviewer.py         # Reviewer — 透過 mp.vision_complete()
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
│   ├── public/
│   │   └── logo.png                # Favicon / Onboarding logo
│   └── src/
│       ├── main.tsx                # React 入口
│       ├── App.tsx                 # 路由 + 動態主題 + Onboarding gate
│       ├── theme.ts                # ★ M3 設計 token + 共用 component defaults
│       │
│       ├── api/
│       │   └── client.ts           # Axios API 封裝（含 providers / optimizer 等）
│       │
│       ├── store/
│       │   └── useStore.ts         # Zustand 全局狀態（含 onboardingCompleted 持久化）
│       │
│       ├── components/
│       │   ├── Layout/Layout.tsx   # AppBar + 分組側邊欄 + 主題切換
│       │   ├── Onboarding/
│       │   │   └── OnboardingWizard.tsx  # ★ 5 步驟初始化精靈（API Key 偵測）
│       │   ├── PageHeader.tsx      # ★ 全站統一頁首（icon + title + actions）
│       │   ├── SectionCard.tsx     # ★ 全站統一區塊卡片
│       │   ├── LogConsole.tsx      # ★ 全站統一終端日誌顯示
│       │   ├── PromptOptimizerDialog.tsx  # ★ Prompt 優化對話框（共用）
│       │   ├── PreprocessDialog.tsx # 訓練/導出前增強預處理配置
│       │   ├── ClassManager.tsx    # 類別管理對話框
│       │   └── DatasetStats.tsx    # 數據集統計圖表
│       │
│       └── pages/
│           ├── Dashboard.tsx       # 儀表板 — 統計概覽 + 快捷操作
│           ├── Datasets.tsx        # 數據集列表 — 創建/刪除/批量管理
│           ├── DatasetDetail.tsx   # 圖片瀏覽 + Canvas 標註編輯器 + 保存/刪除
│           ├── AutoLabel.tsx       # 自動標註 + AI 審查 + Prompt Optimizer
│           ├── Training.tsx        # YOLO 訓練 — 任務管理/日誌/曲線/產出
│           ├── Augmentation.tsx    # AI 數據增強 + Prompt Optimizer
│           └── Settings.tsx        # 系統設定 — 含模型供應商管理
│
└── data/                           # 持久化數據 (Docker volume 掛載)
    ├── logiclabeler.db             # SQLite 數據庫
    ├── datasets/                   # 圖片和標註文件
    ├── models/                     # 訓練產出 (權重/圖表/日誌)
    └── chromadb/                   # ChromaDB 向量數據
```

> ★ 標記為近期重要新增/重構的核心模塊。

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
| `PUT` | `/api/images/{id}/annotations` | 更新標註（支援 BBox / Polygon / Keypoint / OBB + attributes，觸發 RAG 記憶） |
| `PUT` | `/api/images/{id}/meta` | 更新圖片 verified / tags / note / split 元資料 |

### AI 標註助手（單張圖即時呼叫）

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/assist/segment` | **Smart Segment**：以 click 或 bbox 為提示，GrabCut 生成 polygon |
| `POST` | `/api/assist/autolabel-image` | **單圖一鍵自動標註**：自動走 Commander 解析 instruction（享受 open vocabulary）+ Soldier 檢測 |

### 自動標註 + AI 審查

| 方法 | 路徑 | 說明 |
|------|------|------|
| `POST` | `/api/labeling/run` | 啟動自動標註流水線（自動套用 open vocabulary 判讀） |
| `GET` | `/api/labeling/status/{job_id}` | 查詢標註進度 |
| `POST` | `/api/labeling/review` | 啟動 AI 二次審查 |
| `GET` | `/api/labeling/review/{job_id}` | 查詢審查進度 |
| `POST` | `/api/labeling/review/{job_id}/apply` | 一鍵套用審查修正 |
| `POST` | `/api/labeling/optimize-prompt` | **Prompt Optimizer：回傳 3 種優化版本** |

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
| `GET` | `/api/augmentation/jobs/{job_id}` | 查詢增強任務狀態 |

### 系統設定 + 模型供應商

| 方法 | 路徑 | 說明 |
|------|------|------|
| `GET` | `/api/settings` | 獲取當前設定（含 active_text_model / active_vision_model） |
| `PUT` | `/api/settings` | 更新設定 (API Key / 模式等) |
| `GET` | `/api/settings/providers` | **列出所有模型供應商** |
| `POST` | `/api/settings/providers` | **新增 OpenAI 相容 / Anthropic 供應商** |
| `PUT` | `/api/settings/providers/{provider_id}` | 編輯供應商 |
| `DELETE` | `/api/settings/providers/{provider_id}` | 刪除供應商 |
| `PUT` | `/api/settings/active-model` | **切換當前 text / vision 主動模型** |
| `GET` | `/api/health` | 健康檢查 |

</details>

---

## 與競品比較

| 維度 | Autodistill | GPT-4V 直接標註 | CVAT / Label Studio | **LogicLabeler** |
|------|:-----------:|:---------------:|:-------------------:|:----------------:|
| 語義推理 | ❌ 僅名詞檢測 | ✅ 強 | ❌ | ✅ **CoT 邏輯推理** |
| **細粒度品種識別** | ❌ | 🔶 強但不可控 | ❌ | ✅ **Open Vocabulary + 範例 hint** |
| 模型選擇自由度 | 🔶 限定 | ❌ 鎖定 GPT | 🔶 需自接 | ✅ **DashScope / OpenAI / Anthropic 任選** |
| Prompt Optimizer | ❌ | ❌ | ❌ | ✅ **3 種優化版本** |
| 多形狀標註 | ❌ | ❌ | ✅ 全面 | ✅ **BBox / Polygon / Keypoint / OBB** |
| Smart Segment | ❌ | ❌ | 🔶 SAM 外掛 | ✅ **GrabCut（無需下載權重）** |
| 定位精度 | 🔶 中 | ❌ 幻覺嚴重 | ✅ | ✅ **SAM + SAHI** |
| 品質控制 | 🔶 固定閾值 | ❌ 無 | 🔶 人工審核 | ✅ **Agent 對抗辯論** |
| 場景適應 | ❌ 需重訓 | 🔶 需微調 | ❌ | ✅ **RAG 即時優化** |
| AI 增強 | ❌ | ❌ | ❌ | ✅ **AI 生成 + 本地** |
| 本地預處理 | ❌ | ❌ | 🔶 部分 | ✅ |
| 端到端訓練 | ❌ | ❌ | ❌ | ✅ **YOLO 訓練閉環** |
| 訓練控制 | ❌ | ❌ | ❌ | ✅ **停止/繼續/取消** |
| AI 審查 | ❌ | ❌ | ❌ | ✅ **VLM 二次驗證** |
| 初始化引導 | ❌ | ❌ | ❌ | ✅ **5 步驟智能精靈** |
| Material 3 介面 | ❌ | ❌ | ❌ | ✅ **MUI v6 + 自製主題** |
| 自部署 | ✅ | ❌ 雲端 | ✅ | ✅ **Docker 私有部署** |

---

## 更新日誌（Changelog）

### 2026.05 — Open Vocabulary 細粒度識別
- **Commander**：能判讀「如 / 例如 / 比如 / 包括但不限於 / e.g. / such as」等示例性用語，自動拆解為主類別 + `examples` + `open_vocabulary` 三層結構；單純列舉或「只 / 僅 / strictly」則維持封閉模式（[`backend/app/services/commander.py`](./backend/app/services/commander.py)）
- **Soldier**：vision prompt 新增開放詞彙分支，要求 VLM 以**實際品種**命名 `class_name`，不確定時輸出 `<主類別> (uncertain)`，完全無法判斷時輸出 `<主類別> (unknown breed)`，並嚴禁硬塞範例品種（[`backend/app/services/soldier.py`](./backend/app/services/soldier.py)）
- **全鏈路透傳**：`labeling.py` / `augmentation.py` / `sahi_utils.py` / `annotation_assist.py` 全部新增 `examples` 與 `open_vocabulary` 參數
- **單張圖一鍵 AI 標註**：`/api/assist/autolabel-image` 現在會先過 Commander，再呼叫 Soldier，所以工具列按鈕也享受同樣升級

### 2026.04 — Annotator 全面升級
- 新形狀：**Polygon / Keypoint / Oriented BBox**
- 新 AI 助手：**Smart Segment（GrabCut）**、單圖一鍵自動標註
- 新元資料：標註層級 occluded / truncated / blur / note；圖片層級 verified / tags / note / split
- 新視覺輔助：放大鏡 Loupe、像素網格、Mini-map、邊緣磁吸
- 列表面板：搜尋、filter chips、Shift 多選、批量改類 / 刪除 / 鎖定
- 匯出：自動偵測 YOLO Detect / Segment / Pose / OBB；Polygon 同步輸出 PNG mask
- 資料集 Settings 新增 **Keypoint Schema 編輯器**（名稱 + skeleton edges）
- 後端輕量化 SQLite migration：啟動時自動 `ALTER TABLE ADD COLUMN` 補上新欄位

### 2026.03 — Material Design 3 全站重構
- MUI v6 + 自製 M3 主題，亮 / 暗 / 跟隨系統
- 5 步驟初始化精靈（含 DashScope API Key 既存偵測）
- 模型供應商管理：OpenAI 相容 / Anthropic Claude
- Prompt Optimizer（3 種版本）、訓練生命週期管理（停止 / 繼續 / 取消 / 刪除）

---

## License

本項目基於 [MIT License](./LICENSE) 開源。

Copyright (c) 2026 FONG, KUN FAI

---

<div align="center">

*Built with ❤️ using Qwen · OpenAI · Anthropic · React · FastAPI & ultralytics*

</div>
