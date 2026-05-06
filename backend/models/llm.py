"""LLM catalog response schemas — mirrors the structure of llm_catalog.json."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class LLMInfo(BaseModel):
    """Single LLM entry as served by `/v1/llms`. Schema mirrors
    `llm_catalog.json` — keep in sync with `llm_catalog.schema.json`.
    """

    name: str = Field(..., description="Display name; unique across the catalog.")
    hf_id: Optional[str] = Field(
        default=None,
        description="HuggingFace org/repo id. Null when no HF mirror exists.",
    )
    vendor: str = Field(..., description="Vendor (Qwen, Meta, Mistral AI, ...).")
    family: str = Field(..., description="Logical family for UI grouping.")
    architecture: str = Field(..., description="Architecture descriptor.")
    is_moe: bool
    is_mla: bool
    params_total_b: float = Field(..., description="Total parameters (B).")
    params_active_b: float = Field(..., description="Active params per token (B).")
    layers: int
    hidden_size: int
    num_attention_heads: int
    num_kv_heads: int
    head_dim: int
    max_context: int = Field(..., description="Native max_position_embeddings.")
    verified: bool = Field(
        ...,
        description="True when audited against HF config.json + safetensors.",
    )
    comment: Optional[str] = None
    # MoE-only fields
    params_dense_b: Optional[float] = None
    params_moe_b: Optional[float] = None
    k_moe: Optional[int] = None
    n_experts: Optional[int] = None
    # MLA-only fields
    kv_lora_rank: Optional[int] = None
    qk_rope_head_dim: Optional[int] = None


class LLMListResponse(BaseModel):
    """Paginated list of LLM catalog entries."""

    models: List[LLMInfo] = Field(..., description="Catalog entries on this page.")
    total: int = Field(..., description="Total matching entries.")
    page: int
    per_page: int
    has_next: bool
    has_prev: bool

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "models": [
                    {
                        "name": "Qwen3-30B-A3B-Thinking-2507",
                        "hf_id": "Qwen/Qwen3-30B-A3B-Thinking-2507",
                        "vendor": "Qwen",
                        "family": "Qwen3",
                        "architecture": "MoE/GQA (reasoning)",
                        "is_moe": True,
                        "is_mla": False,
                        "params_total_b": 30,
                        "params_active_b": 3,
                        "layers": 48,
                        "hidden_size": 2048,
                        "num_attention_heads": 32,
                        "num_kv_heads": 4,
                        "head_dim": 128,
                        "max_context": 262144,
                        "verified": True,
                        "params_dense_b": 1.54,
                        "params_moe_b": 28.99,
                        "k_moe": 8,
                        "n_experts": 128,
                    }
                ],
                "total": 1,
                "page": 1,
                "per_page": 100,
                "has_next": False,
                "has_prev": False,
            }
        }
    )
