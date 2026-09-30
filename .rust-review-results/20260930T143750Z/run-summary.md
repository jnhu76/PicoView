# Run summary

## Resolved parameters

- threat_model: REMOTE（恶意/不可信图片文件为核心攻击面）
- severity_filter: medium
- finding_scope_root: `native`（PicoView 自有 Rust 代码，18 个 .rs）
- context_roots: `.`（third_party/pocketjs、guest/ 仅作只读上下文，不产出 findings）
- capability flags: has_unsafe=true, has_ffi=false, has_concurrency=true, has_async=false, has_packed_repr=false, has_fs_io=true
- Cargo manifest: single-crate `native/Cargo.toml`（edition 2024）
- 执行环境适配：`rust-review:*` 插件子代理类型在本环境不可用 → 使用 general-purpose 代理并内联注入协议文件；子代理模型不可选（会话模型执行）；用户约束子代理总数 ≤4 → 14 个逻辑 worker 按 58 个 pass 分组为 4 个分组代理（每提示逐字节保留 plan 渲染内容，产物仍按各 worker id 落盘）。cache primer 已运行。

## Worker outcome table（按 plan.json 顺序）

| worker | cluster_id | claimed | shard 行数 | coverage | status | retry/abort |
|---|---|---|---|---|---|---|
| 1 | unsafe-boundary | 10 | 10 | coverage/worker-1.md | completed（validator OK） | 无 |
| 2 | memory-safety | 0 | 0 | coverage/worker-2.md | completed（validator OK） | 无 |
| 3 | concurrency-locking | 0 | 0 | coverage/worker-3.md | completed（validator OK） | 无 |
| 4 | concurrency-data-race | 0 | 0 | coverage/worker-4.md | completed（validator OK） | 无 |
| 5 | panic-dos | 0 | 0 | coverage/worker-5.md | completed（validator OK） | 无 |
| 6 | recursion-dos-1 | 0 | 0 | coverage/worker-6.md | completed（validator OK） | 无 |
| 7 | recursion-dos-2 | 0 | 0 | coverage/worker-7.md | completed（validator OK） | 无 |
| 8 | recursion-dos-3 | 0 | 0 | coverage/worker-8.md | completed（validator OK） | 无 |
| 9 | error-handling | 0 | 0 | coverage/worker-9.md | completed（validator OK） | 无 |
| 10 | logic-correctness | 0 | 0 | coverage/worker-10.md | completed（validator OK） | 无 |
| 11 | static-hygiene | 2 | 2 | coverage/worker-11.md | completed（validator OK） | 无 |
| 12 | resource-handling | 1 | 1 | coverage/worker-12.md | completed（validator OK） | 无 |
| 13 | input-os-safety | 0 | 0 | coverage/worker-13.md | completed（validator OK） | 无 |
| 14 | info-disclosure | 0 | 0 | coverage/worker-14.md | completed（validator OK） | 无 |

- 全部 14 个逻辑 worker complete；无 `abort:`；无 `NOT SEARCHED — truncated at hard cap` 覆盖行（完整覆盖）。
- findings-index.txt 行数 = 13，与 worker 申报总和一致（10+0+…+2+1+…+0 = 13）。
- 孤儿对账：无（每个磁盘 finding 均在对应 shard 中）。
- validate_artifacts.py 对全部 14 个 worker 返回 OK。

## Findings 概览（待 dedup/fp 评审）

- SAFETYDOC-001..010（unsafe-boundary：未附 `// SAFETY:` 注释的 unsafe 函数/块）
- CARGOLINT-001、MSRV-001（static-hygiene：Cargo/lint 配置类）
- RAWFD-001（resource-handling：句柄生命周期）

## Judge / 报告状态

- dedup-judge: 完成 — 13 findings → 13 primaries（0 次 Tier-1/2/3 合并，3 组相关模式；`dedup-summary.md`）
- fp-judge: 完成 — 12 TRUE_POSITIVE（全部 LOW 加固缺口：SAFETYDOC-001..010、CARGOLINT-001、MSRV-001）+ 1 OUT_OF_SCOPE（RAWFD-001，代码确证的 HKEY 句柄泄漏，但触发仅限本地 `--register-associations` CLI 路径，REMOTE 下越界）；判定数从磁盘回读核验（12 TP + 1 OOS = 13；12 条 severity = 12 幸存者）
- REPORT.md: fp-judge 撰写（非 orchestrator 代写）；severity_filter=medium 下 reported=0，含过滤出 find 的完整清单
- REPORT.sarif: Phase 8b 安全网重新生成（幂等覆盖，无 WARNING skipped），results: []
- 成功标准核对：14/14 逻辑 worker completed（validator OK，台账见 run-ledger.md）；全部 primary 带 fp_verdict+fp_rationale，幸存者带 severity/attack_vector/exploitability/severity_rationale；REPORT.md 与 REPORT.sarif 均在磁盘
- 无截断（无 `NOT SEARCHED` 覆盖行）、无孤儿 finding、无 skipped 文件
