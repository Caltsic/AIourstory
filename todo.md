# Project TODO

## 说明

- 本文件已重建为 UTF-8 可读版本。
- 历史乱码备份文件：`todo.garbled.backup.md`。

## 当前优先事项

- [ ] 评估并决定是否修复以下高风险项：
  - [ ] API 明文 HTTP 传输风险
  - [ ] Refresh Token 与 Access Token 未区分用途
  - [ ] 管理后台“记住密码”本地明文存储
  - [ ] 前端部分 JSON 解析容错不足
- [ ] 补充服务端自动化测试（认证、审核分页、并发冲突）
- [ ] 清理 UI/文案中的历史乱码文本

## 已完成（本轮）

- [x] 修复注册并发时用户名唯一约束冲突处理（返回业务错误而非 500）
- [x] 审核列表接口增加分页能力（page/limit/total）
- [x] 管理后台增加分页控件（上一页/下一页）并适配新接口
- [x] Tester Key 改为哈希校验，目标口令为 `password`
- [x] README / TODO / BUG 相关文档重建为可读 UTF-8
