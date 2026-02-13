# 投票后对话失败问题排查指南

## 问题现象

投票后尝试继续对话时,前端显示 Heroku Application Error 页面(503 错误)。

## 根本原因

从日志分析,问题出在投票后对话的情绪分类环节:

```
RuntimeError: chat_completion failed 503: <!DOCTYPE html>...Application Error...
```

**关键位置**: `app.py` 第 2850 行 (`post_vote_chat` 函数)

```python
classifier = await _classify_emotion(user_message, conversation_history=combined_history)
```

情绪分类 API 调用失败,导致整个请求超时(30秒后 Heroku 返回 H12 错误)。

## 排查步骤

### 1. 检查情绪分类模型配置

```bash
# 检查环境变量
heroku config:get EMOTION_MODEL_ID -a your-app-name
heroku config:get REPLY_API_BASE -a your-app-name
heroku config:get REPLY_API_KEY -a your-app-name
```

**预期**: 
- `EMOTION_MODEL_ID` 应指向一个可用的模型
- `REPLY_API_BASE` 应该是可访问的 API 端点
- `REPLY_API_KEY` 应该是有效的 API 密钥

### 2. 测试 API 端点可用性

```bash
# 手动测试 API 端点
curl -X POST https://your-api-base/v1/chat/completions \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "your-model-id",
    "messages": [{"role": "user", "content": "测试"}],
    "temperature": 0.0
  }'
```

### 3. 检查 API 配额和限流

- 检查 API 提供商控制台的使用情况
- 确认是否达到速率限制或配额上限
- 查看是否有欠费或账号被暂停

### 4. 检查网络连接

```bash
# 测试 Heroku dyno 到 API 端点的连接
heroku run curl -I https://your-api-base -a your-app-name
```

## 解决方案

### 方案 1: 修复情绪分类 API 配置

1. **更新 API 端点**:
```bash
heroku config:set REPLY_API_BASE=https://your-working-api-endpoint -a your-app-name
```

2. **更新 API 密钥**:
```bash
heroku config:set REPLY_API_KEY=your-valid-api-key -a your-app-name
```

3. **重启应用**:
```bash
heroku restart -a your-app-name
```

### 方案 2: 增加超时和重试机制 (代码修复)

在 `app.py` 的 `post_vote_chat` 函数中添加错误处理:

```python
# 第 2850 行附近
try:
    classifier = await _classify_emotion(user_message, conversation_history=combined_history)
    emo = str(classifier.get("emotion", CLASSIFICATION_ERROR))
    inten = str(classifier.get("intensity", CLASSIFICATION_ERROR))
    stype = str(classifier.get("support_type", CLASSIFICATION_ERROR))
except Exception as exc:
    # 分类失败时使用安全默认值
    log_error(
        error_type="post_vote_emotion_classification_failed",
        context={"session": session_id, "vote_id": vote_id},
        exc=exc
    )
    emo = "neutral"
    inten = "medium"
    stype = "both"
    comment = None
```

### 方案 3: 跳过投票后的情绪分类 (快速修复)

如果情绪分类不是投票后对话的核心功能,可以直接使用投票时的分类结果:

```python
# 第 2850 行附近,替换为:
# 使用会话中缓存的情绪分类结果
emo = sess.get("emotion", "neutral")
inten = sess.get("intensity", "medium")
stype = sess.get("support_type", "both")
comment = sess.get("classifier_comment")
```

## 次要问题修复

### Google Drive 快照上传失败

**错误**: `Service Accounts do not have storage quota`

**解决方案**:

1. **使用共享云端硬盘**:
```bash
# 在 Google Drive 中创建共享云端硬盘
# 将 DRIVE_FOLDER_ID 设置为共享云端硬盘中的文件夹 ID
heroku config:set DRIVE_FOLDER_ID=shared-drive-folder-id -a your-app-name
```

2. **或者暂时禁用快照功能**:
```bash
heroku config:set ARCHIVE_ENABLED=false -a your-app-name
```

## 验证修复

### 1. 检查应用日志
```bash
heroku logs --tail -a your-app-name
```

### 2. 测试投票后对话流程

1. 访问应用并发起对话
2. 投票选择获胜方
3. 尝试继续对话
4. 检查是否能正常收到回复

### 3. 监控错误率

```bash
# 查看最近的错误
heroku logs --tail -a your-app-name | grep ERROR
```

## 预防措施

### 1. 添加健康检查

在部署配置中添加 API 端点健康检查:

```python
@app.get("/health/dependencies")
async def health_check_dependencies():
    """检查外部依赖可用性"""
    results = {}
    
    # 测试情绪分类 API
    try:
        endpoint = _get_endpoint(EMOTION_MODEL_ID)
        # 简单的 ping 测试
        results["emotion_classifier"] = "ok"
    except Exception as exc:
        results["emotion_classifier"] = f"error: {str(exc)}"
    
    return results
```

### 2. 设置告警

使用 Heroku 插件或第三方服务监控:
- API 响应时间
- 错误率
- 503/504 错误频率

### 3. 实施降级策略

在代码中添加自动降级逻辑:

```python
async def _classify_emotion_with_fallback(prompt, conversation_history=None):
    """带降级的情绪分类"""
    try:
        return await _classify_emotion(prompt, conversation_history)
    except Exception as exc:
        log_error("emotion_classification_failed", {"error": str(exc)}, exc)
        # 返回安全默认值
        return {
            "emotion": "neutral",
            "intensity": "medium",
            "support_type": "both",
            "comment": "分类服务不可用,使用默认值"
        }
```

## 相关日志关键字

排查时搜索这些关键字:

- `chat_completion failed 503`
- `post_vote_chat_exception`
- `H12 desc="Request timeout"`
- `emotion_classification_failed`
- `RuntimeError: chat_completion failed`

## 技术支持

如果问题持续存在:

1. 检查 `EMOTION_MODEL_ID` 对应的 API 服务状态页
2. 联系 API 提供商支持团队
3. 考虑切换到备用 API 端点
4. 增加请求超时时间(不推荐,会导致用户等待过长)
