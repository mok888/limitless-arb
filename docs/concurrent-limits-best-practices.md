# 并发限制最佳实践指南

## 重要澄清

**关键理解**：`LP_MAKING_MAX_CONCURRENT_MARKETS=5` 和 `HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=5` 这些配置参数是针对**每个策略实例**的并发限制，而不是针对单个账户的限制。

### 系统架构说明

在当前的多账户系统中：
- 每个账户都会创建自己独立的策略实例
- 每个策略实例都有自己的并发限制
- 如果有3个账户都启用了LP做市策略，那么系统总共可以同时处理 3 × 5 = 15 个LP做市市场

## 概述

合理设置每种策略实例的并发限制对于风险控制和资金效率至关重要。本指南提供了基于不同情况的配置建议。

## 配置原则

### 1. 基于策略实例的资金规模

**注意**：这些限制是针对每个策略实例的，不是针对账户的。

| 策略实例资金 | LP做市并发 | 每小时套利并发 | 说明 |
|-------------|-----------|---------------|------|
| < 500 USDC | 1-2 | 1-2 | 保守配置，降低风险 |
| 500-2000 USDC | 3-5 | 3-5 | 标准配置，平衡收益风险 |
| 2000-5000 USDC | 5-8 | 5-8 | 积极配置，追求收益 |
| > 5000 USDC | 8-15 | 8-12 | 高级配置，最大化收益 |

**实际影响**：
- 如果你有3个账户，每个账户的LP策略设置为5个并发市场
- 系统总共可以同时处理 3 × 5 = 15 个LP做市市场
- 每个账户的策略实例独立运行，互不影响

### 2. 基于风险承受能力

#### 保守型用户
```env
LP_MAKING_MAX_CONCURRENT_MARKETS=2
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=2
LP_MAKING_INITIAL_PURCHASE=20
HOURLY_ARBITRAGE_AMOUNT=5
```

#### 平衡型用户
```env
LP_MAKING_MAX_CONCURRENT_MARKETS=5
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=5
LP_MAKING_INITIAL_PURCHASE=50
HOURLY_ARBITRAGE_AMOUNT=10
```

#### 积极型用户
```env
LP_MAKING_MAX_CONCURRENT_MARKETS=10
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=8
LP_MAKING_INITIAL_PURCHASE=100
HOURLY_ARBITRAGE_AMOUNT=25
```

## 配置方法

### 1. 环境变量配置

在 `.env` 文件中设置：

```env
# LP做市策略
LP_MAKING_MAX_CONCURRENT_MARKETS=5

# 每小时套利策略
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=5
```

### 2. 账户级别配置

```bash
# 为不同账户分配不同策略
npm run account add conservative_account \
  --strategies "LP_MAKING" \
  --max-risk 200

npm run account add aggressive_account \
  --strategies "LP_MAKING,HOURLY_ARBITRAGE,NEW_MARKET" \
  --max-risk 1000
```

## 监控和调整

### 1. 实时监控

系统会显示当前并发使用情况：
- `🟢 LP做市: 3/5 市场活跃`
- `🟡 每小时套利: 4/5 仓位活跃`
- `🔴 达到最大并发限制`

### 2. 性能指标

关注以下指标来调整配置：
- **资金利用率**: 并发数 × 单次投资额 / 总资金
- **成功率**: 成功交易数 / 总尝试数
- **平均收益**: 总收益 / 交易次数

### 3. 动态调整

根据市场条件和表现调整：
- 牛市：适当增加并发数
- 熊市：降低并发数，保守操作
- 高波动期：减少并发，等待稳定

## 风险控制

### 1. 资金分配

确保并发限制不会导致资金过度集中：
```
总风险敞口 = LP并发数 × LP投资额 + 套利并发数 × 套利投资额
建议: 总风险敞口 ≤ 账户余额 × 80%
```

### 2. 相关性风险

避免在相关性高的市场同时开仓：
- 监控市场相关性
- 分散投资不同类型的市场
- 设置相关性阈值

### 3. 流动性风险

确保有足够资金应对：
- 保留20%资金作为缓冲
- 监控市场流动性变化
- 设置紧急止损机制

## 常见问题

### Q: 如何确定最适合的并发数？
A: 从保守配置开始，根据表现逐步调整。监控资金利用率和收益率。

### Q: 并发数设置过高会怎样？
A: 可能导致资金不足、风险过度集中、系统负载过高。

### Q: 不同策略的并发数应该如何平衡？
A: 根据策略的风险收益特征和市场机会分布来平衡。

### Q: 如何处理并发限制达到上限的情况？
A: 系统会自动跳过新机会，等待现有仓位平仓后再执行新交易。

## 配置示例

### 新手配置
```env
STRATEGIES_ENABLED=true
MAX_TOTAL_INVESTMENT=500
LP_MAKING_MAX_CONCURRENT_MARKETS=2
LP_MAKING_INITIAL_PURCHASE=25
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=2
HOURLY_ARBITRAGE_AMOUNT=5
```

### 专业配置
```env
STRATEGIES_ENABLED=true
MAX_TOTAL_INVESTMENT=5000
LP_MAKING_MAX_CONCURRENT_MARKETS=10
LP_MAKING_INITIAL_PURCHASE=100
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=8
HOURLY_ARBITRAGE_AMOUNT=25
```

记住：配置没有标准答案，需要根据个人情况和市场条件持续优化。