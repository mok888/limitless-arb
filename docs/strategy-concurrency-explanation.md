# 策略并发限制详解

## 核心概念澄清

### 并发限制的作用范围

**重要理解**：环境变量中的并发限制配置是针对**每个策略实例**的，而不是全局限制或账户限制。

```env
LP_MAKING_MAX_CONCURRENT_MARKETS=5          # 每个LP策略实例最多5个并发市场
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=5 # 每个套利策略实例最多5个并发仓位
```

### 系统架构

```
系统总体
├── 账户1
│   ├── LP策略实例1 (最多5个并发市场)
│   └── 套利策略实例1 (最多5个并发仓位)
├── 账户2
│   ├── LP策略实例2 (最多5个并发市场)
│   └── 套利策略实例2 (最多5个并发仓位)
└── 账户3
    ├── LP策略实例3 (最多5个并发市场)
    └── 套利策略实例3 (最多5个并发仓位)
```

**总并发能力**：
- LP做市：3个账户 × 5个并发 = 15个市场
- 每小时套利：3个账户 × 5个并发 = 15个仓位

## 代码实现验证

### 策略实例创建

每个账户都会创建独立的策略实例：

```javascript
// 在 AccountStrategyExecutor 中
async registerStrategy(strategyType, config) {
    // 每个账户注册策略时，都会有自己的配置
    this.activeStrategies.set(strategyType, {
        ...config,  // 包含 maxConcurrentMarkets 等配置
        registeredAt: Date.now(),
        lastActive: Date.now()
    });
}
```

### 并发检查

每个策略实例独立检查自己的并发限制：

```javascript
// LP做市策略中
if (this.activePositions.size >= this.config.maxConcurrentMarkets) {
    console.log(`🚫 达到最大并发市场限制 (${this.config.maxConcurrentMarkets})`);
    return { action: 'skipped', reason: 'max_concurrent_reached' };
}

// 每小时套利策略中
if (this.activePositions.size >= this.config.maxConcurrentPositions) {
    console.log(`🚫 达到最大并发仓位限制 (${this.config.maxConcurrentPositions})`);
    break;
}
```

## 实际应用示例

### 场景1：单账户多策略

```bash
# 添加一个账户，启用多个策略
npm run account add trader1 \
  --private-key "0x..." \
  --strategies "LP_MAKING,HOURLY_ARBITRAGE"
```

**结果**：
- 该账户的LP策略实例：最多5个并发市场
- 该账户的套利策略实例：最多5个并发仓位
- 总计：最多10个并发交易

### 场景2：多账户同策略

```bash
# 添加3个账户，都启用LP策略
npm run account add trader1 --strategies "LP_MAKING"
npm run account add trader2 --strategies "LP_MAKING"  
npm run account add trader3 --strategies "LP_MAKING"
```

**结果**：
- 系统总共可以同时处理：3 × 5 = 15个LP做市市场
- 每个账户独立运行，互不影响

### 场景3：混合配置

```bash
# 不同账户启用不同策略组合
npm run account add conservative --strategies "LP_MAKING"           # 5个LP市场
npm run account add balanced --strategies "LP_MAKING,HOURLY_ARBITRAGE" # 5个LP + 5个套利
npm run account add aggressive --strategies "LP_MAKING,HOURLY_ARBITRAGE,NEW_MARKET" # 全策略
```

**结果**：
- LP做市总并发：3 × 5 = 15个市场
- 每小时套利总并发：2 × 5 = 10个仓位
- 新市场策略总并发：1 × 3 = 3个Split操作

## 配置调优建议

### 基于策略实例资金的配置

```env
# 如果每个策略实例分配的资金较少
LP_MAKING_MAX_CONCURRENT_MARKETS=2
LP_MAKING_INITIAL_PURCHASE=25
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=2
HOURLY_ARBITRAGE_AMOUNT=5

# 如果每个策略实例分配的资金较多
LP_MAKING_MAX_CONCURRENT_MARKETS=10
LP_MAKING_INITIAL_PURCHASE=100
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=8
HOURLY_ARBITRAGE_AMOUNT=25
```

### 风险控制考虑

1. **策略实例级别风险**：
   - 每个策略实例的最大风险 = 并发数 × 单次投资额
   - LP策略风险 = 5 × 50 = 250 USDC
   - 套利策略风险 = 5 × 10 = 50 USDC

2. **账户级别风险**：
   - 账户总风险 = 所有策略实例风险之和
   - 单账户风险 = 250 + 50 = 300 USDC

3. **系统级别风险**：
   - 系统总风险 = 所有账户风险之和
   - 3账户系统风险 = 3 × 300 = 900 USDC

## 监控和管理

### 查看当前并发使用情况

系统运行时会显示每个策略实例的并发使用情况：

```
📊 账户状态摘要:
├── trader1
│   ├── LP策略: 3/5 市场活跃
│   └── 套利策略: 2/5 仓位活跃
├── trader2  
│   ├── LP策略: 5/5 市场活跃 (已达上限)
│   └── 套利策略: 1/5 仓位活跃
└── trader3
    └── LP策略: 2/5 市场活跃
```

### 动态调整策略

如果需要为特定账户调整并发限制，目前需要：

1. **修改全局配置**（影响所有新创建的策略实例）
2. **重启系统**（让新配置生效）
3. **或者通过代码直接修改策略实例配置**（高级用法）

## 常见误解

### ❌ 错误理解
"设置 `LP_MAKING_MAX_CONCURRENT_MARKETS=5` 意味着整个系统最多只能有5个LP市场"

### ✅ 正确理解  
"设置 `LP_MAKING_MAX_CONCURRENT_MARKETS=5` 意味着每个LP策略实例最多可以同时处理5个市场，如果有多个账户启用LP策略，系统总并发能力是 账户数 × 5"

## 总结

- **配置作用域**：每个策略实例，不是全局或账户级别
- **扩展性**：添加更多账户可以线性增加系统并发能力
- **独立性**：每个账户的策略实例独立运行，互不影响
- **风险控制**：需要从策略实例、账户、系统三个层面考虑风险管理

这种设计允许系统通过增加账户来扩展处理能力，同时保持每个策略实例的风险可控。