"""Commander Agent — Qwen3.5-Plus via DashScope.

Responsible for semantic understanding, Chain-of-Thought reasoning, and
task decomposition. Converts natural language labeling instructions into
structured JSON execution plans.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.services import model_providers as mp

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是 LogicLabeler 系統的 Commander (指揮官) 智能體。
你的職責是將用戶的自然語言標註指令轉化為結構化的檢測執行計劃。

請遵循以下流程進行 Chain-of-Thought 推理：
1. **語義分析**: 理解用戶想要標註的目標、屬性以及限定條件
2. **判斷「範例 vs 嚴格列舉」（非常重要！）**:
   - 當用戶使用「如」、「例如」、「比如」、「像是」、「包括（但不限於）」、「諸如」、「等等」、「等」、「e.g.」、「such as」、「including」這類「示例性」用語時，
     表示後面跟著的子類別只是 *參考範例*，不應被當作要鎖定的完整類別清單。
     這時請：
       a) `targets` 只放上層主類別（例如 "cat", "dog", "vehicle"，使用英文單數）
       b) 在 `examples` 中為每個主類別給出參考子型清單（保留用戶原文/語言）
       c) `open_vocabulary` 設為 true，告訴下游視覺模型「以實際看到的品種/型號命名 class_name，不限於範例」
   - 當用戶使用「只」、「僅」、「只限」、「only」、「strictly」、「必須是」、「must be one of」這類「限定性」用語，
     或明確列出固定且封閉的類別集合時，
     表示就是要這些類別，這時：
       a) `targets` 直接列出每個指定類別
       b) `examples` 為空物件 `{}`
       c) `open_vocabulary` 設為 false
   - 若用戶單純列出物件（沒有任何限定詞或示例詞），預設視為精確列舉：`open_vocabulary` 設為 false
3. **邏輯定義**: 定義物體之間的空間/邏輯關係（IoU、包含、位置等）
4. **生成計劃**: 輸出結構化 JSON

你必須嚴格以 JSON 格式返回結果，格式如下：
```json
{
  "reasoning": "你的推理過程，需明確說明判斷 open_vocabulary 為何 true / false",
  "targets": ["target1", "target2"],
  "examples": {
    "target1": ["範例子型1", "範例子型2"]
  },
  "open_vocabulary": true,
  "logic_type": "spatial_exclusion | containment | simple_detection | attribute_check",
  "logic_rules": [
    {
      "function": "is_wearing | is_holding | contains | iou | is_near | is_above | none",
      "args": ["target_a", "target_b"],
      "threshold": 0.3,
      "negate": false,
      "output_label": "label_for_matching_objects"
    }
  ],
  "output_labels": ["label1", "label2"],
  "detection_prompts": {
    "target1": "視覺模型如何辨識 target1 的具體文字提示，包含關鍵特徵與在 open_vocabulary 模式下對 fine-grained 命名的指示",
    "target2": "..."
  }
}
```

如果是簡單的物體檢測（不涉及邏輯推理），logic_type 設為 "simple_detection"，logic_rules 為空列表。

注意：
- targets 列表中的名稱應為英文、單數、簡潔（e.g. "cat" 而不是 "cats"、"a cat"），便於傳給視覺檢測模型
- examples 中保留用戶原始語言（中文/英文皆可）作為人類可讀的提示
- detection_prompts 描述「如何辨識該目標」，當 open_vocabulary 為 true 時應明確要求依實際品種/型號命名
- 多個邏輯規則可以組合使用

# 範例 1：示例性指令
用戶輸入：「檢測圖像中貓（如英國短毛貓、布偶貓、暹羅貓）和狗（如金毛尋回犬、德國牧羊犬、柴犬）的個體實例，並精確分類至細粒度品種級別」
預期輸出：
{
  "reasoning": "用戶使用『如』列舉，屬於範例性指令，要求 fine-grained 品種辨識，因此 targets 為主類別 cat/dog，examples 提供參考品種，open_vocabulary 為 true",
  "targets": ["cat", "dog"],
  "examples": {
    "cat": ["英國短毛貓", "布偶貓", "暹羅貓"],
    "dog": ["金毛尋回犬", "德國牧羊犬", "柴犬"]
  },
  "open_vocabulary": true,
  "logic_type": "simple_detection",
  "logic_rules": [],
  "output_labels": ["cat", "dog"],
  "detection_prompts": {
    "cat": "檢測圖中所有貓科家貓個體，並依實際品種命名 class_name（例如 British Shorthair、Persian、Tabby、Ragdoll、Mixed），不限於用戶提供的範例品種；無法精準辨識品種時使用 'cat (unknown breed)'",
    "dog": "檢測圖中所有犬科家犬個體，並依實際犬種命名 class_name；無法精準辨識時使用 'dog (unknown breed)'"
  }
}

# 範例 2：嚴格列舉指令
用戶輸入：「只檢測圖中的 cat、dog、person 三類」
預期輸出（節錄）：
{
  "targets": ["cat", "dog", "person"],
  "examples": {},
  "open_vocabulary": false,
  ...
}
"""


def parse_instruction(instruction: str, rag_context: str = "") -> dict[str, Any]:
    """Parse a natural-language labeling instruction into an execution plan."""
    user_msg = instruction
    if rag_context:
        user_msg += (
            f"\n\n【歷史錯誤提醒 - 請避免以下已知錯誤】\n{rag_context}"
        )

    try:
        text = mp.text_complete(
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.2,
        )
        text = _extract_json(text)
        plan = json.loads(text)
        _validate_plan(plan)
        return plan

    except Exception as e:
        logger.exception("Commander parse_instruction failed: %s", e)
        return _fallback_plan(instruction)


def _extract_json(text: str) -> str:
    """Extract JSON block from markdown-wrapped response."""
    if "```json" in text:
        text = text.split("```json")[1]
    if "```" in text:
        text = text.split("```")[0]
    return text.strip()


def _validate_plan(plan: dict):
    required = {"targets", "logic_type", "output_labels", "detection_prompts"}
    missing = required - set(plan.keys())
    if missing:
        raise ValueError(f"Plan missing fields: {missing}")
    if not plan["targets"]:
        raise ValueError("Plan has empty targets list")
    plan.setdefault("examples", {})
    plan.setdefault("open_vocabulary", False)
    if not isinstance(plan["examples"], dict):
        plan["examples"] = {}
    plan["open_vocabulary"] = bool(plan["open_vocabulary"])


_EXAMPLE_MARKERS = (
    "如",
    "例如",
    "比如",
    "像是",
    "諸如",
    "包括但不限於",
    "包括（但不限於）",
    "包括(但不限於)",
    "包含但不限於",
    "等等",
    "e.g.",
    "such as",
    "including",
    "for example",
)


def _fallback_plan(instruction: str) -> dict[str, Any]:
    """Simple fallback when MLLM is unavailable — treat as direct detection.

    Performs a lightweight heuristic to detect whether the instruction lists
    examples ("如/例如/such as ...") so we can still hint the detector to use
    open-vocabulary fine-grained naming even without the LLM.
    """
    lowered = instruction.lower()
    has_marker = any(m in instruction or m in lowered for m in _EXAMPLE_MARKERS)

    tokens = (
        instruction.replace("，", ",")
        .replace("、", ",")
        .replace("；", ",")
        .replace(";", ",")
        .split(",")
    )
    targets = [t.strip() for t in tokens if t.strip()]
    if not targets:
        targets = [instruction.strip()[:50]]

    if has_marker:
        return {
            "reasoning": (
                "Fallback (with example marker detected): the instruction appears "
                "to list example sub-types; falling back to a single open-vocabulary "
                "target to avoid over-constraining the detector."
            ),
            "targets": ["object"],
            "examples": {"object": targets},
            "open_vocabulary": True,
            "logic_type": "simple_detection",
            "logic_rules": [],
            "output_labels": ["object"],
            "detection_prompts": {
                "object": (
                    "Detect any object that semantically matches the user's "
                    "instruction. Use the most specific real-world category name "
                    "for class_name (open vocabulary); the listed examples are only "
                    "hints, not an exhaustive list."
                )
            },
        }

    return {
        "reasoning": "Fallback: treating instruction as simple closed-set detection",
        "targets": targets,
        "examples": {},
        "open_vocabulary": False,
        "logic_type": "simple_detection",
        "logic_rules": [],
        "output_labels": targets,
        "detection_prompts": {t: t for t in targets},
    }
