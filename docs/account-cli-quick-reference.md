# 账户管理CLI快速参考

## 常用命令

```bash
# 查看帮助
npm run account -- --help

# 查看可用策略
npm run account -- strategies-list

# 列出所有账户
npm run account -- list

# 添加账户
npm run account -- add <id> -k <private-key> -n <name> -b <balance> -r <max-risk> -s <strategies>

# 显示账户详情
npm run account -- show <id>

# 更新策略
npm run account -- strategies <id> <strategies> [--replace]

# 激活/停用
npm run account -- activate <id>
npm run account -- deactivate <id>

# 更新余额
npm run account -- balance <id> <amount>

# 删除账户
npm run account -- remove <id> --force
```

## 策略类型

- `hourly_arbitrage` - 小时套利
- `lp_making` - LP做市
- `new_market` - 新市场
- `price_arbitrage` - 价格套利
- `spread_making` - 价差做市
- `momentum` - 动量策略
- `mean_reversion` - 均值回归
- `volume_spike` - 成交量激增
- `multi_strategy` - 多策略

## 示例

```bash
# 完整添加账户
npm run account -- add trader1 \
  --private-key "0x1234..." \
  --name "主交易账户" \
  --balance 5000 \
  --max-risk 2000 \
  --strategies "hourly_arbitrage,lp_making"

# 批量操作
npm run account -- list
npm run account -- strategies trader1 "new_market" 
npm run account -- balance trader1 6000
npm run account -- show trader1
```