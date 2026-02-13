# 多轮对话功能测试用例（Phase 4）

本文档用于验证多轮对话功能在前后端联动、SSE 流式传输、UI 展示与 Supabase 数据落库等方面均可正确工作。

相关规格：[`plans/MULTI_TURN_SPEC.md`](plans/MULTI_TURN_SPEC.md)

---

## 0. 测试范围与前置条件

### 0.1 测试范围

- 功能测试：单轮/多轮/轮次警告/投票后禁用
- UI 测试：ChatGPT 风格气泡、自动滚动、Markdown 渲染、流式动画、响应式
- API 测试：
  - `/api/arena/battle`
  - `/api/arena/continue`
  - `/api/arena/vote`
  - （可选/扩展）`/api/arena/chat`：投票后与选中模型继续对话（若该端点已启用）
- 数据完整性：Supabase `votes` 表字段 `conversation_history` 和 `turn_count`

### 0.2 环境与准备

- 后端：已部署到测试环境（或本地运行），可访问 `/health`
- 前端：已部署或本地运行
- Supabase：已完成迁移（见 [`migrations/README.md`](migrations/README.md)）
  - 已执行：[`migrations/add_conversation_history.sql`](migrations/add_conversation_history.sql)
  - 已验证：[`migrations/verify_schema.sql`](migrations/verify_schema.sql)

### 0.3 建议记录项（便于复现与排查）

每次测试建议记录：

- 后端版本：Git commit hash
- 前端版本：Git commit hash / Vercel 部署版本
- session_id
- 实际轮次（turn_count）
- 投票结果（winner / vote）
- Supabase `votes` 表对应记录 id

---

## 1. 功能测试（Functional）

### FT-01 单轮对话（向后兼容）

**目标**：验证单轮流程不受多轮改动影响；且写库时 `turn_count = 1`。

**步骤**：

1. 打开 Battle 页面
2. 输入单轮 prompt（见第 6 节）并提交
3. 等待双模型生成完成（流式结束）
4. 点击投票（left/right/tie/both_bad 或项目实际投票枚举）
5. 等待揭晓/投票结果返回

**预期**：

- UI：可看到匿名 A/B 两侧完整回复
- SSE：有 meta 帧 + left/right delta 帧 + finish 帧（见 AT-01）
- 数据：投票后写入 Supabase `votes` 表
  - `turn_count = 1`
  - `conversation_history` 为 JSON 数组，长度为 1
  - 数组第 1 项包含用户 prompt 与 A/B 回复（字段名以实现为准，但必须可还原该轮内容）

---

### FT-02 多轮对话（基本流程：2 轮）

**目标**：验证 continue 能在同一个 session 中累积对话历史；投票后写入完整历史。

**步骤**：

1. 首轮：输入 `prompt1` 并提交，等待 A/B 回复生成完成
2. 续写：输入 `prompt2` 并提交，等待 A/B 第二轮回复生成完成
3. 在第 2 轮后点击投票
4. 在 Supabase Dashboard 查询最新投票记录

**预期**：

- UI：对话历史中包含两轮（用户输入 x2，A/B 回复 x2）
- `session_id` 不变（继续使用同一会话）
- 投票后：
  - `turn_count = 2`
  - `conversation_history` 数组长度为 2
  - 数组按轮次顺序排列，轮次编号连续（1,2）

---

### FT-03 多轮对话（更长流程：3 轮）

**目标**：验证多轮累计在 UI 和落库中都正确，且不会覆盖前序轮次。

**步骤**：

1. 依次输入 `prompt1`、`prompt2`、`prompt3`
2. 每轮都等待 A/B 回复生成完成后再进行下一轮
3. 第 3 轮后投票

**预期**：

- `conversation_history` 数组长度为 3
- `turn_count = 3`
- 第 1 轮、第 2 轮内容不被第 3 轮覆盖

---

### FT-04 轮次警告（5+ 轮软限制提示）

**目标**：验证达到阈值后出现“建议尽快投票”警告。

**步骤**：

1. 连续进行多轮对话，至少完成 6 轮（每轮都等待 A/B 回复完成）
2. 观察从第 5 轮开始（或第 6 轮）是否出现提示

**预期**：

- UI：第 5 轮后显示警告文案：`建议尽快投票`（或等价文案）
- 若警告通过 SSE 下发：前端能正确解析并展示（见 AT-02）
- 功能不被强制中断（软限制：仍可继续输入）

---

### FT-05 投票后禁用继续输入

**目标**：投票后不可继续“投票前的多轮对话”，输入框禁用，并提示已投票。

**步骤**：

1. 完成 1-2 轮对话后投票
2. 尝试继续在原输入框输入并提交

**预期**：

- 输入框 disabled
- 提示文案：`已投票，无法继续对话`（或等价文案）
- 不会再触发 `/api/arena/continue`

---

## 2. UI 测试（UI）

### UI-01 ChatGPT 风格气泡显示

**检查点**：

- 用户消息气泡右对齐
- 模型消息气泡左对齐
- 区分 A/B 两列时仍保持清晰的视觉分组

### UI-02 对话历史自动滚动

**检查点**：

- 流式生成过程中，视图随最新内容自动滚动到底部
- 用户手动上滑查看历史时，不应被强制拉回（若产品设计如此，可写明例外规则）

### UI-03 Markdown 渲染

使用第 6 节 prompts 测试：

- 加粗：`**加粗**`
- 列表：有序/无序列表
- 代码块：三引号代码块

**预期**：

- Markdown 不应以纯文本显示（除非明确禁用）
- 代码块有等宽字体与可读的背景/边框

### UI-04 流式生成打字光标动画

**检查点**：

- 回复未完成时显示光标/闪烁指示
- 回复完成（finish）后光标消失

### UI-05 响应式设计（移动端 / 桌面端）

**步骤**：

1. 桌面端宽屏：检查左右对比布局
2. 移动端窄屏：检查是否自动变为上下布局或可横向切换

**预期**：

- 文本不溢出屏幕
- 投票按钮可点击且不遮挡内容
- 输入框固定在底部，不遮挡最新消息

---

## 3. API 测试（API）

> 本节用于验证后端端点行为与 SSE 流事件格式。可用 `curl -N` 或浏览器 Network 面板观察。

### AT-01 `/api/arena/battle` 正常工作（SSE）

**请求**：

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"prompt":"我最近压力很大，睡不着"}' \
  http://localhost:8000/api/arena/battle
```

**预期（示例）**：

- 首帧：meta 信息（至少包含 `session_id`、轮次信息）
- 过程中：A/B 两侧持续输出增量（delta）
- 结束：两侧都出现 finish

### AT-02 SSE 流事件正确解析（meta、warning、delta、finish）

**目标**：前端能稳定解析并渲染所有类型事件。

**事件类型定义（以实现为准，以下为最低覆盖要求）**：

- `meta`：会话与轮次元信息（例如 `session_id`、`turn`、`emotion` 等）
- `warning`：软限制提示（例如第 5 轮后的 `建议尽快投票`）
- `delta`：流式 token/片段增量
- `finish`：流式结束信号

**检查点**：

- `meta` 必须在 UI 可用（用于后续 continue/vote 的 session_id）
- `warning` 必须能被用户感知（Toast/inline banner 均可）
- `delta` 按顺序拼接成最终文本
- `finish` 后 UI 状态从 streaming 切换为 done

### AT-03 `/api/arena/continue` 正确处理续写请求

**步骤**：

1. 先调用 `/api/arena/battle` 获取 meta 帧内的 `session_id`
2. 用该 `session_id` 调用 continue

**请求**：

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"session_id":"<session_id>","prompt":"你有什么具体的建议吗？"}' \
  http://localhost:8000/api/arena/continue
```

**预期**：

- 返回 SSE
- meta 帧轮次递增（例如 `turn: 2`）
- left/right 都有 delta 输出并最终 finish

### AT-04 `/api/arena/vote` 正确保存对话历史

**步骤**：

1. 完成至少 2 轮对话（battle + continue）
2. 调用 vote（JSON body 以实现为准）
3. 在 Supabase 查询最新 votes 记录

**请求示例（以 [`TESTING.md`](TESTING.md) 的现有 curl 为参考）**：

```bash
curl -s -H "Content-Type: application/json" \
  -d '{
    "session_id":"<session_id>",
    "vote":"model_a",
    "prompt":"你有什么具体的建议吗？",
    "left_model":"anonymous_a",
    "right_model":"anonymous_b",
    "client_info":"curl"
  }' \
  http://localhost:8000/api/arena/vote | jq
```

**预期**：

- HTTP 200
- 响应包含揭晓信息（revealed_left/right 或等价结构）
- Supabase `votes` 表对应记录：
  - `conversation_history` 含完整多轮内容
  - `turn_count` 正确

### AT-05 （可选/扩展）`/api/arena/chat` 投票后继续对话

> 该端点在规格中定义（见 [`plans/MULTI_TURN_SPEC.md`](plans/MULTI_TURN_SPEC.md) 的 `POST /api/arena/chat`），若当前部署未启用，可跳过。

**目标**：投票后与选中侧继续对话，仍保持 SSE 流。

**请求**：

```bash
curl -N -H "Content-Type: application/json" \
  -d '{"session_id":"<session_id>","prompt":"谢谢你，我感受到了支持","model_side":"right"}' \
  http://localhost:8000/api/arena/chat
```

**预期**：

- 返回 SSE
- 只返回单侧回复流（side=model 或等价字段）
- finish 后 UI 可继续下一轮（该阶段通常不再写入 votes 表）

---

## 4. 数据完整性测试（Supabase）

### DT-01 `votes` 表包含 `conversation_history` 和 `turn_count`

在 Supabase SQL Editor 运行：

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'votes'
  AND column_name IN ('conversation_history', 'turn_count');
```

**预期**：两列均存在。

### DT-02 对话历史格式正确（JSONB 数组）

```sql
SELECT
  id,
  turn_count,
  jsonb_typeof(conversation_history) AS history_type,
  jsonb_array_length(conversation_history) AS history_len
FROM votes
ORDER BY created_at DESC
LIMIT 5;
```

**预期**：

- `history_type = 'array'`
- `history_len = turn_count`（至少在投票前多轮阶段应一致）

### DT-03 轮次统计准确

```sql
SELECT
  turn_count,
  COUNT(*) AS cnt
FROM votes
GROUP BY turn_count
ORDER BY turn_count;
```

**预期**：

- 单轮投票有 `turn_count = 1`
- 多轮投票分布可见（`turn_count >= 2`）

---

## 5. 异常与边界场景（建议）

> 该部分不在验收必选项中，但建议覆盖以提高发布稳定性。

- 断网/超时：SSE 中断后前端提示重试，不产生半写入数据
- 重复投票：同一 `session_id` 多次 vote 的处理（应拒绝或幂等）
- 无效 session_id 调用 continue：返回明确错误（4xx）

---

## 6. 测试 Prompts 示例

### 6.1 单轮对话

- 请介绍一下人工智能的发展历史

### 6.2 多轮对话

1. 我最近工作压力很大，感觉很焦虑
2. 你有什么具体的建议吗？
3. 这些方法真的有效吗？

### 6.3 Markdown 渲染测试

- 请列举三个放松的方法，用列表形式（测试列表渲染）
- 用 **加粗** 强调重要的部分（测试加粗）
- 给我一段 Python 代码示例（测试代码块）
