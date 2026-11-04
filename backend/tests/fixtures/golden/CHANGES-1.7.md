# Golden fixtures: before / after methodology 1.7 alignment

Значения до (main @ 5bed3b3) и после выравнивания API с методикой (ветка `fix/api-methodology-alignment`).

| Fixture | Поле | До | После | Δ, % |
|---|---|---:|---:|---:|
| baseline_small | TS_session_context | 2400 | 2400 | +0.0 |
| baseline_small | SL_pf_input_length | 1400 | 2150 | +53.6 |
| baseline_small | th_prefill | 4597 | 4495 | -2.2 |
| baseline_small | th_decode | 79.62 | 67.19 | -15.6 |
| baseline_small | Cmodel_rps | 14.52 | 11.91 | -18.0 |
| baseline_small | BS_real | 50 | 50 | +0.0 |
| baseline_small | servers_by_memory | 2 | 2 | +0.0 |
| baseline_small | servers_by_compute | 1 | 1 | +0.0 |
| baseline_small | servers_final | 2 | 2 | +0.0 |
| baseline_small | ttft_analyt | 0.3431 | 0.5191 | +51.3 |
| baseline_small | e2e_latency_for_sla | 3.483 | 4.199 | +20.6 |
| baseline_small | peak_tpm | 9.9e+05 | 1.44e+06 | +45.5 |
| high_load_enterprise | TS_session_context | 4000 | 4000 | +0.0 |
| high_load_enterprise | SL_pf_input_length | 2000 | 3600 | +80.0 |
| high_load_enterprise | th_prefill | 3776 | 3683 | -2.5 |
| high_load_enterprise | th_decode | 449.3 | 48.31 | -89.2 |
| high_load_enterprise | Cmodel_rps | 40.14 | 6.157 | -84.7 |
| high_load_enterprise | BS_real | 57 | 57 | +0.0 |
| high_load_enterprise | servers_by_memory | 22 | 22 | +0.0 |
| high_load_enterprise | servers_by_compute | 1 | 6 | +500.0 |
| high_load_enterprise | servers_final | 22 | 22 | +0.0 |
| high_load_enterprise | ttft_analyt | 0.5579 | 1.024 | +83.6 |
| high_load_enterprise | e2e_latency_for_sla | 1.448 | 9.258 | +539.3 |
| high_load_enterprise | peak_tpm | 9e+06 | 1.5e+07 | +66.7 |
| long_context_compute_bound | TS_session_context | 1.02e+04 | 7800 | -23.5 |
| long_context_compute_bound | SL_pf_input_length | 6100 | 6500 | +6.6 |
| long_context_compute_bound | th_prefill | 1.13e+04 | 1.122e+04 | -0.8 |
| long_context_compute_bound | th_decode | 64.36 | 50.67 | -21.3 |
| long_context_compute_bound | Cmodel_rps | 8.149 | 6.441 | -21.0 |
| long_context_compute_bound | BS_real | 169 | 169 | +0.0 |
| long_context_compute_bound | servers_by_memory | 2 | 2 | +0.0 |
| long_context_compute_bound | servers_by_compute | 2 | 2 | +0.0 |
| long_context_compute_bound | servers_final | 2 | 2 | +0.0 |
| long_context_compute_bound | ttft_analyt | 0.5812 | 0.6252 | +7.6 |
| long_context_compute_bound | e2e_latency_for_sla | 20.78 | 26.24 | +26.3 |
| long_context_compute_bound | peak_tpm | 9.74e+06 | 1.027e+07 | +5.4 |

Причины: SL_pf включает ответы прошлых ходов (§2.2); Th_dec^compute без K_batch (§6.1); TTFT и e2e проверяются при итоговом BS (§7); TPM учитывает K_calls и T_dec = A + A_tool + MRT (§9).
