import { expect, test } from "@playwright/test";

const mockSizingResponse = {
  servers_final: 22,
  servers_by_memory: 22,
  servers_by_compute: 17,
  sessions_per_server: 114,
  Ssim_concurrent_sessions: 2500,
  TS_session_context: 4000,
  gpus_per_server: 8,
  gpus_per_instance: 1,
  instances_per_server_tp: 2,
  S_TP_z: 57,
  th_server_comp: 3.77,
  th_prefill: 8563.06,
  th_decode: 6402.65,
  model_mem_gb: 64.6,
  kv_free_per_instance_tp_gb: 223.39,
  instance_total_mem_gb: 320,
  cost_estimate_usd: 1_100_000,
};

const mockOptimizeResponse = {
  mode: "balanced",
  total_evaluated: 120,
  total_valid: 24,
  results: [
    {
      rank: 1,
      gpu_id: "NVIDIA_A100",
      gpu_name: "NVIDIA A100",
      gpu_mem_gb: 80,
      gpu_tflops: 312,
      bytes_per_param: 2,
      tp_multiplier_Z: 2,
      gpus_per_server: 8,
      servers_final: 12,
      total_gpus: 96,
      sessions_per_server: 160,
      th_server_comp: 6.5,
      cost_estimate_usd: 720000,
      gpu_price_usd: 18000,
      sizing_input: {
        internal_users: 1000,
        penetration_internal: 0.2,
        concurrency_internal: 0.1,
        external_users: 0,
        penetration_external: 0.0,
        concurrency_external: 0.0,
        sessions_per_user_J: 1,
        system_prompt_tokens_SP: 1000,
        user_prompt_tokens_Prp: 200,
        reasoning_tokens_MRT: 0,
        answer_tokens_A: 400,
        dialog_turns: 5,
        params_billions: 32,
        bytes_per_param: 2,
        safe_margin: 5,
        emp_model: 1.0,
        layers_L: 64,
        hidden_size_H: 4096,
        num_kv_heads: 32,
        num_attention_heads: 32,
        bytes_per_kv_state: 2,
        emp_kv: 1.0,
        max_context_window_TSmax: 32768,
        gpu_mem_gb: 80,
        gpu_id: "NVIDIA_A100",
        gpus_per_server: 8,
        kavail: 0.9,
        tp_multiplier_Z: 2,
        saturation_coeff_C: 10,
        gpu_flops_Fcount: 312,
        eta_prefill: 0.2,
        eta_decode: 0.15,
        rps_per_session_R: 0.02,
        sla_reserve_KSLA: 1.25,
      },
    },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route("**/v1/gpus**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        gpus: [],
        total: 0,
        page: 1,
        per_page: 100,
        has_next: false,
        has_prev: false,
      }),
    });
  });
});

test("smoke: open app and run single sizing calculation", async ({ page }) => {
  await page.route("**/v1/size", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockSizingResponse),
    });
  });

  await page.goto("/");

  await expect(page.getByRole("heading", { name: "AI Infrastructure Calculator" })).toBeVisible();
  await page.locator('[data-tour="presets"] button').first().click();
  await page.locator('[data-tour="calculate-btn"]').click();

  await expect(page.getByRole("heading", { name: "Calculation Results" })).toBeVisible();
  await expect(page.getByText("Infrastructure Required")).toBeVisible();
  // Infrastructure tile carries the mem/compute breakdown in its native
  // browser title attribute (hover tooltip) — assert against that, not
  // visible text.
  await expect(page.locator('[title^="max(mem:"]').first()).toHaveAttribute(
    "title",
    /22/,
  );
});

test("smoke: auto-optimize mode renders optimization table", async ({ page }) => {
  await page.route("**/v1/auto-optimize", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(mockOptimizeResponse),
    });
  });

  await page.goto("/");

  await page.locator('[data-tour="auto-optimize"] button').click();
  await expect(page.locator('[data-tour="calculate-btn"]')).toContainText("Find Best Configs");

  await page.locator('[data-tour="calculate-btn"]').click();

  await expect(page.getByText("Optimization Results")).toBeVisible();
  await expect(page.getByText("NVIDIA A100")).toBeVisible();
});
