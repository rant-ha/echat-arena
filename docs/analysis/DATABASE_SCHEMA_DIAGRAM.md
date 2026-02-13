# eChat Arena 数据库 Schema 可视化图

## 1. 完整 ER 图

```mermaid
erDiagram
    votes ||--o{ post_vote_turns : "vote_id (soft)"
    votes ||--o| arena_sessions : "session_id (soft)"
    draft_conversations }o--|| auth.users : "user_id (hard)"

    votes {
        uuid id PK
        text session_id UK
        uuid user_id
        text prompt
        text reply_a
        text reply_b
        jsonb model_config
        text user_vote
        jsonb user_tags
        text user_comment
        jsonb ai_scores
        jsonb client_info
        text base_model_name
        text template_id
        text strategy_name
        jsonb conversation_history
        integer turn_count
        varchar winner_type
        timestamptz created_at
    }

    post_vote_turns {
        uuid id PK
        uuid vote_id FK
        uuid user_id
        text winner_side
        integer turn_index
        text user_message
        text assistant_message
        timestamptz created_at
    }

    arena_sessions {
        text session_id PK
        jsonb session_data
        bigint version
        timestamptz expires_at
        timestamptz deleted_at
        timestamptz created_at
        timestamptz updated_at
    }

    draft_conversations {
        uuid id PK
        text session_id UK
        uuid user_id FK
        text user_email
        text prompt
        text reply_a
        text reply_b
        text model_a
        text model_b
        jsonb conversation_history
        integer turn_count
        jsonb model_config
        timestamptz created_at
        timestamptz updated_at
    }

    admin_sessions {
        uuid id PK
        text token UK
        timestamptz expires_at
        timestamptz created_at
        text ip_address
        text user_agent
    }

    model_configs {
        uuid id PK
        text model_key UK
        text model_name
        text api_type
        text api_base
        text api_key_encrypted
        boolean is_enabled
        boolean anony_only
        integer weight
        text description
        timestamptz created_at
        timestamptz updated_at
        timestamptz deleted_at
        boolean is_default
    }

    admin_audit_log {
        uuid id PK
        text action_type
        text target_type
        text target_id
        jsonb details
        text ip_address
        text user_agent
        timestamptz created_at
    }
```

## 2. 数据流图

```mermaid
graph TD
    A[用户输入] --> B[arena_sessions.session_data]
    B --> C{用户继续对话?}
    C -->|是| B
    C -->|否| D[用户投票]
    D --> E[votes 表]
    E --> F[后台任务]
    F --> G[AI 评分]
    F --> H[Google Drive 快照]
    E --> I{用户继续对话?}
    I -->|是| J[post_vote_turns 表]
    I -->|否| K[结束]

    style B fill:#e1f5ff
    style E fill:#fff4e1
    style J fill:#ffe1f5
```

## 3. Session 数据结构图

```mermaid
graph LR
    A[arena_sessions.session_data] --> B[conversation_history]
    A --> C[turn_count]
    A --> D[left.context]
    A --> E[right.context]
    A --> F[version]
    A --> G[template_id]
    A --> H[strategy_name]
    A --> I[emotion]
    A --> J[intensity]
    A --> K[support_type]

    B --> B1[turn 1]
    B --> B2[turn 2]
    B --> B3[turn N]

    B1 --> B1a[user]
    B1 --> B1b[reply_a]
    B1 --> B1c[reply_b]
    B1 --> B1d[timestamp]

    D --> D1[role: user]
    D --> D2[role: assistant]
    D --> D3[role: user]
    D --> D4[role: assistant]

    E --> E1[role: user]
    E --> E2[role: assistant]
    E --> E3[role: user]
    E --> E4[role: assistant]

    style A fill:#e1f5ff
    style B fill:#fff4e1
    style D fill:#ffe1f5
    style E fill:#ffe1f5
```

## 4. 投票流程图

```mermaid
sequenceDiagram
    participant U as 用户
    participant S as arena_sessions
    participant V as votes
    participant P as post_vote_turns
    participant B as 后台任务

    U->>S: 创建会话
    S-->>U: session_id

    U->>S: 输入消息
    S->>S: 追加到 conversation_history
    S->>S: 更新 turn_count

    U->>S: 继续对话（多轮）
    S->>S: 追加到 conversation_history
    S->>S: 更新 turn_count

    U->>V: 投票
    V->>V: 插入投票记录
    V->>V: 存储 conversation_history
    V->>V: 存储 turn_count
    V-->>U: vote_id

    V->>B: 触发后台任务
    B->>B: AI 评分
    B->>V: 更新 ai_scores

    U->>P: 继续对话（投票后）
    P->>P: 插入 post_vote_turn
    P-->>U: 流式响应

    U->>P: 继续对话
    P->>P: 插入 post_vote_turn
    P-->>U: 流式响应
```

## 5. 数据丢失风险图

```mermaid
graph TD
    A[数据丢失风险] --> B[Session Store 内存回退]
    A --> C[CAS 更新失败]
    A --> D[Post-vote Turn 保存失败]
    A --> E[异步任务失败]
    A --> F[Session 过期清理]

    B --> B1[Supabase 不可用]
    B --> B2[网络超时]
    B --> B3[Heroku dyno 重启]

    C --> C1[版本冲突]
    C --> C2[重试次数有限]
    C --> C3[不允许回退]

    D --> D1[数据库连接失败]
    D --> D2[数据库写入错误]
    D --> D3[无重试机制]

    E --> E1[AI 评分失败]
    E --> E2[Google Drive 上传失败]
    E --> E3[仅打印日志]

    F --> F1[TTL 过期]
    F --> F2[大小限制]
    F --> F3[Supabase 不可用]

    style B fill:#ffcccc
    style C fill:#ffcccc
    style D fill:#ffcccc
    style E fill:#ffcccc
    style F fill:#ffcccc
```

## 6. 数据不一致风险图

```mermaid
graph TD
    A[数据不一致风险] --> B[乐观锁版本冲突]
    A --> C[幂等性检查竞态]
    A --> D[turn_index 计算冲突]
    A --> E[Session 重建不完整]

    B --> B1[并发更新]
    B --> B2[无自动合并]
    B --> B3[重试次数有限]

    C --> C1[检查-插入时间窗口]
    C --> C2[并发请求]
    C --> C3[UNIQUE 约束冲突]

    D --> D1[基于本地数据计算]
    D --> D2[并发请求]
    D --> D3[可能跳号]

    E --> E1[arena_sessions 已清理]
    E --> E2[临时数据丢失]
    E --> E3[单侧上下文无法恢复]

    style B fill:#ffffcc
    style C fill:#ffffcc
    style D fill:#ffffcc
    style E fill:#ffffcc
```

## 7. 索引结构图

```mermaid
graph TD
    A[votes 表索引] --> A1[idx_votes_session_id]
    A --> A2[idx_votes_turn_count]
    A --> A3[idx_votes_conversation_history_gin]
    A --> A4[idx_votes_user_turn]
    A --> A5[idx_votes_created_at]
    A --> A6[idx_votes_winner_type]

    B[post_vote_turns 表索引] --> B1[idx_post_vote_turns_vote_id_turn]
    B --> B2[idx_post_vote_turns_vote_id_created]
    B --> B3[idx_post_vote_turns_user_id]

    C[arena_sessions 表索引] --> C1[idx_arena_sessions_expires_at]
    C --> C2[idx_arena_sessions_deleted_at]

    D[draft_conversations 表索引] --> D1[idx_draft_user_id]
    D --> D2[idx_draft_session_id]

    E[admin_sessions 表索引] --> E1[idx_admin_sessions_token]
    E --> E2[idx_admin_sessions_expires_at]

    F[model_configs 表索引] --> F1[idx_model_configs_model_key]
    F --> F2[idx_model_configs_is_enabled]
    F --> F3[idx_model_configs_deleted_at]
    F --> F4[idx_model_configs_single_default]

    G[admin_audit_log 表索引] --> G1[idx_admin_audit_log_action]
    G --> G2[idx_admin_audit_log_created]

    style A fill:#e1f5ff
    style B fill:#e1f5ff
    style C fill:#e1f5ff
    style D fill:#e1f5ff
    style E fill:#e1f5ff
    style F fill:#e1f5ff
    style G fill:#e1f5ff
```

## 8. 约束结构图

```mermaid
graph TD
    A[约束] --> B[UNIQUE 约束]
    A --> C[FOREIGN KEY 约束]
    A --> D[CHECK 约束]
    A --> E[PARTIAL UNIQUE 约束]

    B --> B1[votes_session_id_unique]
    B --> B2[unique_vote_turn]
    B --> B3[model_configs_model_key_unique]
    B --> B4[admin_sessions_token_unique]
    B --> B5[draft_conversations_session_id_unique]

    C --> C1[draft_conversations_user_id_fkey]

    D --> D1[post_vote_turns_winner_side_check]
    D --> D2[post_vote_turns_turn_index_check]

    E --> E1[idx_model_configs_single_default]

    style B fill:#e1ffe1
    style C fill:#e1ffe1
    style D fill:#e1ffe1
    style E fill:#e1ffe1
```

## 9. RLS 策略图

```mermaid
graph TD
    A[RLS 策略] --> B[post_vote_turns]
    A --> C[draft_conversations]
    A --> D[admin_sessions]
    A --> E[model_configs]
    A --> F[admin_audit_log]

    B --> B1[Service role: 完全访问]
    B --> B2[Authenticated: 读取自己的记录]
    B --> B3[Anonymous: 可以读取]

    C --> C1[Users: 只能访问自己的草稿]
    C --> C2[Service role: 完全访问]

    D --> D1[Service role: 完全访问]

    E --> E1[Service role: 完全访问]

    F --> F1[Service role: 完全访问]

    style B fill:#ffe1f5
    style C fill:#ffe1f5
    style D fill:#ffe1f5
    style E fill:#ffe1f5
    style F fill:#ffe1f5
```

## 10. 完整数据生命周期图

```mermaid
stateDiagram-v2
    [*] --> 创建会话: 用户开始对话
    创建会话 --> 临时存储: arena_sessions
    临时存储 --> 追加对话: 用户输入
    追加对话 --> 临时存储: 更新 conversation_history
    追加对话 --> 追加对话: 继续对话
    临时存储 --> 投票: 用户投票
    投票 --> 持久化: votes 表
    持久化 --> 后台任务: AI 评分
    后台任务 --> [*]: 完成
    持久化 --> 投票后对话: 用户继续对话
    投票后对话 --> Post-vote 存储: post_vote_turns 表
    Post-vote 存储 --> 投票后对话: 继续对话
    投票后对话 --> [*]: 结束
    临时存储 --> 过期清理: TTL 过期
    过期清理 --> [*]: 数据丢失
    投票后对话 --> 保存失败: 数据库错误
    保存失败 --> [*]: 数据丢失
```

---

**文档结束**
