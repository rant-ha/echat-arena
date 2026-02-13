# 多轮对话功能部署检查清单

## 准备阶段
- [ ] 阅读 [`plans/MULTI_TURN_SPEC.md`](plans/MULTI_TURN_SPEC.md)
- [ ] 阅读 [`migrations/README.md`](migrations/README.md)
- [ ] 备份当前 Supabase 数据库（可选）

## 数据库迁移
- [ ] 登录 Supabase Dashboard
- [ ] 打开 SQL Editor
- [ ] 执行 [`migrations/add_conversation_history.sql`](migrations/add_conversation_history.sql:1)
- [ ] 执行 [`migrations/add_post_vote_chat.sql`](migrations/add_post_vote_chat.sql:1)
- [ ] 检查 `votes` 表是否有重复 `session_id`（参考 DEPLOYMENT_GUIDE.md 5.3.2）
- [ ] 如有重复，执行清洗 SQL 删除重复记录
- [ ] 执行 [`migrations/add_vote_idempotency.sql`](migrations/add_vote_idempotency.sql:1)
- [ ] 执行 [`migrations/verify_schema.sql`](migrations/verify_schema.sql:1) 验证
- [ ] 确认输出显示迁移成功

## 后端部署
- [ ] 在 [`app.py`](app.py:2037) 取消注释 Supabase insert（`await _insert_vote_supabase(row)`）
- [ ] 提交代码：`git add . && git commit -m "Enable multi-turn conversation"`
- [ ] 推送到 Heroku：`git push heroku main`
- [ ] 等待部署完成
- [ ] 检查 Heroku 日志：`heroku logs --tail`
- [ ] 确认无错误日志

## 前端部署
- [ ] 推送到 GitHub：`git push origin main`
- [ ] Vercel 自动部署触发
- [ ] 等待部署完成
- [ ] 访问部署的 URL 确认页面正常

## 功能测试
- [ ] 单轮对话测试（向后兼容）
- [ ] 多轮对话测试（2-3 轮）
- [ ] 轮次警告测试（5+ 轮）
- [ ] 投票功能测试
- [ ] 投票后继续对话测试（Phase 8.2）
- [ ] 刷新后恢复投票后对话测试
- [ ] 对话历史显示测试
- [ ] 历史页面显示投票后对话测试
- [ ] Markdown 渲染测试
- [ ] 移动端响应式测试

> 测试用例详见：[`plans/MULTI_TURN_TESTING.md`](plans/MULTI_TURN_TESTING.md)

## 数据验证
- [ ] 在 Supabase 查看 votes 表
- [ ] 检查最新投票记录
- [ ] 确认 conversation_history 字段包含完整对话
- [ ] 确认 turn_count 字段正确
- [ ] 确认 session_id 唯一约束生效（无重复）
- [ ] 在 Supabase 查看 post_vote_turns 表
- [ ] 确认投票后对话记录正确存储
- [ ] 确认 vote_id 正确关联到 votes 表
- [ ] 确认 turn_index 唯一性约束生效
- [ ] 确认其他字段（user_prompt、reply_a、reply_b 等）正常

## 回滚准备（如有问题）
- [ ] 准备回滚脚本：[`migrations/rollback_conversation_history.sql`](migrations/rollback_conversation_history.sql:1)
- [ ] 准备回滚代码：重新注释 [`app.py`](app.py:2037) 的 `await _insert_vote_supabase(row)`
- [ ] 回滚 Heroku：`heroku releases:rollback`
