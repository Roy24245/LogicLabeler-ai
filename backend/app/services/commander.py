"""Commander Agent — Qwen3.5-Plus via DashScope.

Responsible for semantic understanding, Chain-of-Thought reasoning, and
task decomposition. Converts natural language labeling instructions into
structured JSON execution plans.
"""
from __future__ import annotations

import json
import logging
from typing import Any

import dashscope
from dashscope import Generation

from app.config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """你是 LogicLabeler 系統的 Commander (指揮官) 智能體。
你的職責是將用戶的自然語言標註指令轉化為結構化的檢測執行計劃。

請遵循以下流程進行 Chain-of-Thought 推理：
1. **分析**: 理解用戶想要標註的目標及其語義條件
2. **目標拆解**: 列出需要檢測的所有物體類別
3. **邏輯定義**: 定義物體之間的空間/邏輯關係（IoU、包含、位置等）
4. **生成計劃**: 輸出結構化 JSON

你必須嚴格以 JSON 格式返回結果，格式如下：
```json
{
  "reasoning": "你的推理過程",
  "targets": ["target1", "target2"],
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
    "target1": "specific prompt for detector",
    "target2": "specific prompt for detector"
  }
}
```

如果是簡單的物體檢測（不涉及邏輯推理），logic_type 設為 "simple_detection"，logic_rules 為空列表。

注意：
- targets 列表中的名稱應為英文，便於傳給視覺檢測模型
- detection_prompts 中為每個目標提供更具體的文本提示
- 多個邏輯規則可以組合使用
"""


def parse_instruction(instruction: str, rag_context: str = "") -> dict[str, Any]:
    """Parse a natural-language labeling instruction into an execution plan."""
    dashscope.api_key = settings.dashscope_api_key

    user_msg = instruction
    if rag_context:
        user_msg += (
            f"\n\n【歷史錯誤提醒 - 請避免以下已知錯誤】\n{rag_context}"
        )

    try:
        response = Generation.call(
            model="qwen-plus",
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            result_format="message",
            temperature=0.2,
        )

        if response.status_code != 200:
            logger.error("DashScope error: %s", response)
            return _fallback_plan(instruction)

        text = response.output.choices[0].message.content
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


def _fallback_plan(instruction: str) -> dict[str, Any]:
    """Simple fallback when MLLM is unavailable — treat as direct detection."""
    tokens = instruction.replace("，", ",").replace("、", ",").split(",")
    targets = [t.strip() for t in tokens if t.strip()]
    if not targets:
        targets = [instruction.strip()[:50]]
    return {
        "reasoning": "Fallback: treating instruction as simple object detection",
        "targets": targets,
        "logic_type": "simple_detection",
        "logic_rules": [],
        "output_labels": targets,
        "detection_prompts": {t: t for t in targets},
    }
