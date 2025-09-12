# 多策略多账户交易系统使用指南

## 系统概述

多策略多账户交易系统是一个灵活的交易执行框架，支持：

- **多种交易策略**：新市场Split策略、LP做市策略等
- **多账户管理**：独立的账户配置和风险控制
- **灵活配置**：策略参数可按账户定制
- **实时监控**：命令行界面提供实时状态监控
- **事件驱动**：基于事件的策略执行和通知

## 核心组件

### 1. 策略类型

#### 策略A: 新市场Split策略 (NewMarketSplit)
- **功能**：实时监控市场，发现新市场时自动执行Split操作
- **特点**：
  - 将指定金额的USDC分割成等量的YES和NO代币
  - 基于市场评分筛选优质新市场
  - 支持冷却期和并发限制
  - 避免与其他split策略冲突

#### 策略B: LP做市策略 (LPMaking)
- **功能**：选择合适市场购买份额，然后进行LP做市
- **特点**：
  - 初始购买指定份额
  - 设置限价订单进行LP做市
  - 动态调整价格以获得LP奖励
  - 达到止盈率时允许订单成交

### 2. 账户管理

每个账户包含：
- **独立的私钥和钱包**
- **独立的风险限制**
- **自定义的策略配置**
- **独立的执行状态**

### 3. 执行引擎

负责：
- **策略调度**：按配置执行各账户的策略
- **风险控制**：检查账户风险限制
- **事件处理**：处理策略事件和通知
- **状态管理**：维护系统运行状态

## 快速开始

### 1. 环境配置

确保 `.env` 文件包含必要的配置：

```bash
# API配置
API_BASE_URL=https://api.limitless.exchange
RPC_URL=https://mainnet.base.org

# 账户私钥
AUTH_PRIVATE_KEY=your_private_key_here
AUTH_PRIVATE_KEY_2=your_second_private_key_here
AUTH_PRIVATE_KEY_3=your_third_private_key_here

# 市场发现配置
MARKET_SCAN_INTERVAL=30
MARKET_DISCOVERY_INTERVAL=300
MIN_MARKET_SCORE=60
```

### 2. 启动系统

#### 方式1: 使用命令行界面 (推荐)
```bash
npm run multi-strategy
```

这将启动交互式CLI界面，支持：
- 实时配置管理
- 账户添加/移除
- 策略状态监控
- 系统控制

#### 方式2: 运行演示
```bash
npm run demo:multi
```

这将运行一个5分钟的演示，展示系统功能。

### 3. CLI命令

启动CLI后，可以使用以下命令：

```bash
# 引擎控制
start                    # 启动交易引擎
stop                     # 停止交易引擎
status                   # 显示引擎状态

# 账户管理
accounts                 # 显示所有账户
add-account              # 添加新账户
remove-account <id>      # 移除账户
activate-account <id>    # 激活账户
deactivate-account <id>  # 停用账户

# 策略管理
strategies               # 显示策略状态
stats                    # 显示执行统计

# 其他
help                     # 显示帮助
clear                    # 清屏
exit                     # 退出系统
```

## 配置示例

### 基础配置 - 单账户多策略

```javascript
const configuration = {
    accounts: [
        {
            id: 'main_account',
            name: '主账户',
            privateKey: 'your_private_key_here',
            maxRisk: 1000, // 最大风险1000 USDC
            strategies: ['NewMarketSplit', 'LPMaking'],
            strategyConfigs: [
                {
                    type: 'NewMarketSplit',
                    config: {
                        splitAmount: 100,        // 每次split 100 USDC
                        minMarketScore: 70,      // 最小市场评分70
                        maxConcurrentSplits: 3,  // 最大并发split数量
                        cooldownPeriod: 300000   // 5分钟冷却期
                    }
                },
                {
                    type: 'LPMaking',
                    config: {
                        initialPurchase: 50,      // 初始购买50份额
                        targetProfitRate: 0.15,   // 15%止盈率
                        maxConcurrentMarkets: 5,  // 最大并发市场数
                        priceAdjustmentInterval: 300000 // 5分钟价格调整
                    }
                }
            ]
        }
    ]
};
```

### 多账户配置 - 按需求分配

```javascript
const configuration = {
    accounts: [
        {
            id: 'account1',
            name: '账户1 - 全策略',
            privateKey: 'private_key_1',
            maxRisk: 1500,
            strategies: ['NewMarketSplit', 'LPMaking']
            // ... 策略配置
        },
        {
            id: 'account2',
            name: '账户2 - 仅Split策略',
            privateKey: 'private_key_2',
            maxRisk: 800,
            strategies: ['NewMarketSplit']
            // ... 策略配置
        },
        {
            id: 'account3',
            name: '账户3 - 仅LP策略',
            privateKey: 'private_key_3',
            maxRisk: 1200,
            strategies: ['LPMaking']
            // ... 策略配置
        }
    ]
};
```

## 策略配置详解

### NewMarketSplit策略配置

```javascript
{
    type: 'NewMarketSplit',
    config: {
        splitAmount: 100,           // Split金额 (USDC)
        minMarketScore: 70,         // 最小市场评分阈值
        maxConcurrentSplits: 3,     // 最大并发Split数量
        cooldownPeriod: 300000      // 冷却期 (毫秒)
    }
}
```

**参数说明：**
- `splitAmount`: 每次Split操作的USDC金额
- `minMarketScore`: 只有评分达到此阈值的新市场才会触发Split
- `maxConcurrentSplits`: 同时进行的Split操作数量限制
- `cooldownPeriod`: 两次Split操作之间的最小间隔时间

### LPMaking策略配置

```javascript
{
    type: 'LPMaking',
    config: {
        initialPurchase: 50,        // 初始购买份额
        targetProfitRate: 0.15,     // 目标止盈率 (15%)
        maxConcurrentMarkets: 5,    // 最大并发市场数
        priceAdjustmentInterval: 300000  // 价格调整间隔 (毫秒)
    }
}
```

**参数说明：**
- `initialPurchase`: 初始购买的代币份额数量
- `targetProfitRate`: 止盈率，达到此盈利率时允许订单成交
- `maxConcurrentMarkets`: 同时进行LP做市的市场数量限制
- `priceAdjustmentInterval`: 限价订单价格调整的时间间隔

## 使用场景

### 场景1: 保守投资策略

```javascript
// 账户配置
{
    id: 'conservative',
    maxRisk: 500,
    strategies: ['NewMarketSplit'],
    strategyConfigs: [{
        type: 'NewMarketSplit',
        config: {
            splitAmount: 50,         // 较小金额
            minMarketScore: 80,      // 高评分要求
            maxConcurrentSplits: 1,  // 单一操作
            cooldownPeriod: 900000   // 15分钟冷却
        }
    }]
}
```

### 场景2: 激进投资策略

```javascript
// 账户配置
{
    id: 'aggressive',
    maxRisk: 2000,
    strategies: ['NewMarketSplit', 'LPMaking'],
    strategyConfigs: [
        {
            type: 'NewMarketSplit',
            config: {
                splitAmount: 150,        // 较大金额
                minMarketScore: 60,      // 较低评分要求
                maxConcurrentSplits: 5,  // 多重操作
                cooldownPeriod: 120000   // 2分钟冷却
            }
        },
        {
            type: 'LPMaking',
            config: {
                initialPurchase: 100,    // 大额购买
                targetProfitRate: 0.20,  // 高止盈率
                maxConcurrentMarkets: 8  // 多市场操作
            }
        }
    ]
}
```

### 场景3: 平衡投资策略

```javascript
// 多账户分散风险
{
    accounts: [
        {
            id: 'split_account',
            strategies: ['NewMarketSplit'],
            maxRisk: 800
        },
        {
            id: 'lp_account', 
            strategies: ['LPMaking'],
            maxRisk: 1200
        }
    ]
}
```

## 监控和管理

### 实时状态监控

系统提供多层次的状态监控：

1. **引擎状态**：运行状态、执行统计、错误信息
2. **账户状态**：余额、风险使用情况、活跃状态
3. **策略状态**：执行进度、活跃操作、性能指标

### 事件通知

系统会实时通知以下事件：
- Split操作完成
- 购买操作完成
- LP做市启动
- 订单价格调整
- 止盈触发
- 错误和异常

### 风险控制

每个账户都有独立的风险控制：
- **最大风险限制**：防止单个账户过度投资
- **并发操作限制**：控制同时进行的操作数量
- **冷却期机制**：防止过于频繁的操作
- **市场评分筛选**：只选择高质量的交易机会

## 安全注意事项

### 1. 私钥管理
- 使用环境变量存储私钥
- 不要在代码中硬编码私钥
- 定期轮换私钥

### 2. 风险控制
- 设置合理的最大风险限制
- 从小金额开始测试
- 监控账户余额变化

### 3. 测试建议
- 先在测试环境运行
- 使用小金额进行实际测试
- 观察策略行为是否符合预期

### 4. 操作安全
- 所有真实交易都需要明确确认
- 系统包含安全检查机制
- 可以随时停止系统运行

## 故障排除

### 常见问题

1. **系统启动失败**
   - 检查环境变量配置
   - 确认私钥格式正确
   - 检查网络连接

2. **策略不执行**
   - 检查账户是否激活
   - 确认市场评分是否达到阈值
   - 检查风险限制设置

3. **订单创建失败**
   - 检查账户余额
   - 确认市场状态
   - 检查API连接

### 调试方法

1. **查看详细日志**：系统会输出详细的执行日志
2. **使用演示模式**：先运行演示了解系统行为
3. **单步测试**：使用CLI命令逐步测试功能
4. **状态检查**：定期检查系统和策略状态

## 扩展开发

### 添加新策略

1. 创建策略类继承EventEmitter
2. 实现必要的方法：initialize, executeStrategy, stop, getStatus
3. 在ExecutionEngine中注册策略工厂
4. 更新配置验证逻辑

### 自定义事件处理

系统支持自定义事件处理器，可以：
- 添加自定义通知
- 集成外部监控系统
- 实现自定义风险控制逻辑

### 配置扩展

可以扩展配置系统以支持：
- 更多策略参数
- 动态配置更新
- 配置模板和预设

## 总结

多策略多账户交易系统提供了一个灵活、安全、可扩展的交易执行框架。通过合理的配置和监控，可以实现复杂的交易策略组合，同时保持良好的风险控制和系统稳定性。

建议从简单配置开始，逐步熟悉系统功能，然后根据实际需求调整策略参数和账户配置。