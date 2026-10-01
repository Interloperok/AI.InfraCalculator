"""MCP tool surface for the calculator."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

from mcp import Client

from mcp_server import calculator_mcp
from models import SizingInput
from services.sizing_service import run_sizing


def _run(coro):
    return asyncio.run(coro)


def test_tools_resources_and_prompt_are_registered() -> None:
    async def _check() -> None:
        async with Client(calculator_mcp) as client:
            tools = await client.list_tools()
            names = {tool.name for tool in tools.tools}
            assert {
                "list_llms",
                "get_llm",
                "list_gpus",
                "get_gpu",
                "size_llm",
                "size_vlm",
                "size_ocr",
                "compare_scenarios",
                "auto_optimize",
            } <= names

            resources = await client.list_resources()
            assert any(str(item.uri) == "calculator://playbook" for item in resources.resources)
            playbook = await client.read_resource("calculator://playbook")
            assert "size_llm" in playbook.contents[0].text

            prompts = await client.list_prompts()
            assert any(item.name == "size_llm_workload" for item in prompts.prompts)
            prompt = await client.get_prompt(
                "size_llm_workload",
                {"model_name": "Qwen3-32B", "gpu_query": "H100", "internal_users": "40"},
            )
            rendered = json.dumps(prompt.model_dump(mode="json"))
            assert "Qwen3-32B" in rendered
            assert "40" in rendered

    _run(_check())


def test_get_llm_returns_catalog_architecture() -> None:
    async def _check() -> None:
        async with Client(calculator_mcp) as client:
            listed = await client.call_tool("list_llms", {"search": "Qwen3-32B", "per_page": 5})
            assert listed.is_error is False
            assert listed.structured_content is not None
            assert listed.structured_content["total"] >= 1

            found = await client.call_tool("get_llm", {"name": "Qwen3-32B"})
            assert found.is_error is False
            body = found.structured_content
            assert body is not None
            assert body["name"] == "Qwen3-32B"
            assert body["layers"] > 0

            missing = await client.call_tool("get_llm", {"name": "not-a-real-model"})
            assert missing.is_error is True

    _run(_check())


def test_size_llm_matches_the_sizing_service() -> None:
    payload = json.loads((Path(__file__).parent / "payload.json").read_text(encoding="utf-8"))
    expected = run_sizing(SizingInput(**payload))

    async def _check() -> None:
        async with Client(calculator_mcp) as client:
            result = await client.call_tool("size_llm", {"workload": payload})
            assert result.is_error is False
            body = result.structured_content
            assert body is not None
            assert body["servers_final"] == expected.servers_final
            assert body["servers_by_memory"] == expected.servers_by_memory
            assert body["servers_by_compute"] == expected.servers_by_compute

            compared = await client.call_tool(
                "compare_scenarios",
                {
                    "comparison": {
                        "base": payload,
                        "scenarios": [
                            {"name": "more users", "overrides": {"internal_users": 4000}},
                        ],
                    }
                },
            )
            assert compared.is_error is False
            assert compared.structured_content is not None
            assert compared.structured_content["result"][0]["name"] == "more users"

            unknown = await client.call_tool(
                "compare_scenarios",
                {
                    "comparison": {
                        "base": payload,
                        "scenarios": [{"name": "bad", "overrides": {"not_a_field": 1}}],
                    }
                },
            )
            assert unknown.is_error is True

    _run(_check())


def test_list_gpus_and_unknown_gpu(client) -> None:
    async def _check() -> None:
        async with Client(calculator_mcp) as mcp_client:
            listed = await mcp_client.call_tool("list_gpus", {"search": "H100", "per_page": 5})
            assert listed.is_error is False
            page = listed.structured_content
            assert page is not None
            assert page["total"] >= 1
            gpu_id = page["gpus"][0]["id"]

            detail = await mcp_client.call_tool("get_gpu", {"gpu_id": gpu_id})
            assert detail.is_error is False
            assert detail.structured_content is not None
            assert detail.structured_content["id"] == gpu_id

            missing = await mcp_client.call_tool("get_gpu", {"gpu_id": "__missing__"})
            assert missing.is_error is True

    _run(_check())
    # Touch the HTTP mount while the FastAPI lifespan (and session manager) is up.
    response = client.post(
        "/mcp/",
        json={
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {
                "protocolVersion": "2025-03-26",
                "capabilities": {},
                "clientInfo": {"name": "test", "version": "0"},
            },
        },
        headers={"Accept": "application/json, text/event-stream"},
    )
    assert response.status_code != 404
    assert response.status_code < 500
