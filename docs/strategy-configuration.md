# 交易策略配置指南

本文档介绍如何配置和使用交易策略系统。

## 概述

交易策略系统现在支持通过 `.env` 文件进行完全配置化管理，包括：

- **LP做市策略**: 在有奖励的市场提供流动性
- **每小时套利策略**: 监控每小时结算市场的套利机会
- **风险管理**: 全局风险控制和限制
- **执行控制**: 定时器间隔和执行频率控制

## 快速开始

### 1. 生成配置文件

使用交互式配置生成器创建 `.env` 文件：

```bash
node tools/config-generator.js
```

或者复制示例配置文件：

```bash
cp .env.example .env
```

### 2. 验证配置

验证配置文件的有效性：

```bash
node tools/config-validator.js
```

查看详细配置信息：

```bash
node tools/config-validator.js --detailed
```

### 3. 运行演示

查看配置系统的工作方式：

```bash
node examples/demo-strategy-config.js
```

## 配置参数详解

### 通用策略配置

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `STRATEGIES_ENABLED` | `true` | 全局策略开关 |
| `MAX_TOTAL_INVESTMENT` | `1000` | 最大总投资额 (USDC) |
| `MAX_DAILY_LOSS` | `100` | 最大日损失限制 (USDC) |
| `EMERGENCY_STOP_LOSS` | `0.20` | 紧急止损率 (20%) |
| `MIN_MARKET_LIQUIDITY` | `1000` | 最小市场流动性要求 (USDC) |
| `MAX_MARKET_AGE_DAYS` | `30` | 最大市场年龄 (天) |
| `STRATEGY_COOLDOWN_PERIOD` | `5000` | 策略执行冷却期 (毫秒) |
| `MAX_EXECUTIONS_PER_HOUR` | `60` | 每小时最大执行次数 |

### LP做市策略配置

#### 基础配置
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `LP_MAKING_ENABLED` | `true` | 启用LP做市策略 |
| `LP_MAKING_MAX_RETRIES` | `3` | 最大重试次数 |
| `LP_MAKING_RETRY_DELAY` | `1000` | 重试延迟 (毫秒) |

#### 交易参数
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `LP_MAKING_INITIAL_PURCHASE` | `50` | 初始购买金额 (USDC) |
| `LP_MAKING_TARGET_PROFIT_RATE` | `0.15` | 目标止盈率 (15%) |
| `LP_MAKING_MIN_MARKET_SCORE` | `60` | 最小市场评分 |
| `LP_MAKING_MAX_CONCURRENT_MARKETS` | `5` | 最大并发市场数 |
| `LP_MAKING_REWARD_THRESHOLD` | `0.7` | 奖励倍数阈值 |

#### 时间间隔配置
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `LP_MAKING_PRICE_ADJUSTMENT_INTERVAL` | `300000` | 价格调整间隔 (5分钟) |
| `LP_MAKING_MAX_ORDER_AGE` | `3600000` | 最大订单年龄 (1小时) |
| `LP_MAKING_EXECUTION_INTERVAL` | `60000` | 执行间隔 (1分钟) |
| `LP_MAKING_POSITION_CHECK_INTERVAL` | `30000` | 仓位检查间隔 (30秒) |

### 每小时套利策略配置

#### 基础配置
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `HOURLY_ARBITRAGE_ENABLED` | `true` | 启用每小时套利策略 |
| `HOURLY_ARBITRAGE_MAX_RETRIES` | `3` | 最大重试次数 |
| `HOURLY_ARBITRAGE_RETRY_DELAY` | `1000` | 重试延迟 (毫秒) |

#### 交易参数
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `HOURLY_ARBITRAGE_AMOUNT` | `10` | 每次套利金额 (USDC) |
| `HOURLY_ARBITRAGE_MIN_PRICE_THRESHOLD` | `0.90` | 最低价格阈值 (90%) |
| `HOURLY_ARBITRAGE_MAX_PRICE_THRESHOLD` | `0.985` | 最高价格阈值 (98.5%) |
| `HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS` | `5` | 最大并发仓位数 |

#### 时间配置
| 参数 | 默认值 | 说明 |
|------|--------|------|
| `HOURLY_ARBITRAGE_SETTLEMENT_BUFFER` | `600000` | 结算前缓冲时间 (10分钟) |
| `HOURLY_ARBITRAGE_SCAN_INTERVAL` | `60000` | 市场扫描间隔 (1分钟) |
| `HOURLY_ARBITRAGE_MIN_TIME_TO_SETTLEMENT` | `300000` | 最小结算时间 (5分钟) |
| `HOURLY_ARBITRAGE_POSITION_CHECK_INTERVAL` | `30000` | 仓位检查间隔 (30秒) |

## 使用方法

### 在代码中使用配置

```javascript
import { lpMakingConfig, hourlyArbitrageConfig, generalStrategyConfig } from './src/config/strategy-config.js';

// 访问LP做市策略配置
console.log('初始购买金额:', lpMakingConfig.initialPurchase);
console.log('目标止盈率:', lpMakingConfig.targetProfitRate);

// 访问每小时套利策略配置
console.log('套利金额:', hourlyArbitrageConfig.arbitrageAmount);
console.log('价格阈值:', hourlyArbitrageConfig.minPriceThreshold);

// 访问通用配置
console.log('策略启用:', generalStrategyConfig.strategiesEnabled);
console.log('最大投资:', generalStrategyConfig.maxTotalInvestment);
```

### 使用策略管理器

```javascript
import StrategyManager from './src/managers/strategy-manager.js';
import LimitlessApiClient from './src/api-client.js';

// 创建API客户端和策略管理器
const apiClient = new LimitlessApiClient();
const strategyManager = new StrategyManager(apiClient);

// 初始化和启动
await strategyManager.initialize();
await strategyManager.startAll();

// 监听事件
strategyManager.on('strategyExecuted', ({ strategy, result }) => {
    console.log(`策略执行: ${strategy} - ${result.action}`);
});

strategyManager.on('riskLimitReached', ({ type, value }) => {
    console.log(`风险限制触发: ${type} = ${value}`);
});
```

## 配置验证

配置系统包含内置验证功能：

```javascript
import { validateConfigs } from './src/config/strategy-config.js';

const errors = validateConfigs();
if (errors.length > 0) {
    console.log('配置错误:', errors);
}
```

常见验证规则：
- 金额参数必须大于0
- 百分比参数必须在0-1之间
- 评分参数必须在0-100之间
- 价格阈值必须符合逻辑关系

## 风险管理

系统内置多层风险管理机制：

### 1. 日损失限制
- 当日累计损失达到 `MAX_DAILY_LOSS` 时自动暂停所有策略
- 每日午夜自动重置计数器

### 2. 执行频率限制
- 每小时执行次数不超过 `MAX_EXECUTIONS_PER_HOUR`
- 达到限制时自动暂停策略

### 3. 紧急止损
- 单笔损失达到 `EMERGENCY_STOP_LOSS` 比例时触发紧急停止

### 4. 投资总额限制
- 总投资金额不超过 `MAX_TOTAL_INVESTMENT`

## 最佳实践

### 1. 配置调优建议

**保守配置** (适合新手):
```env
LP_MAKING_INITIAL_PURCHASE=20
LP_MAKING_TARGET_PROFIT_RATE=0.10
HOURLY_ARBITRAGE_AMOUNT=5
MAX_TOTAL_INVESTMENT=500
MAX_DAILY_LOSS=50
```

**积极配置** (适合有经验的用户):
```env
LP_MAKING_INITIAL_PURCHASE=100
LP_MAKING_TARGET_PROFIT_RATE=0.20
HOURLY_ARBITRAGE_AMOUNT=25
MAX_TOTAL_INVESTMENT=2000
MAX_DAILY_LOSS=200
```

### 2. 监控建议

- 定期检查策略执行日志
- 监控风险指标和限制触发情况
- 根据市场条件调整配置参数
- 定期备份配置文件

### 3. 安全建议

- 不要在配置文件中硬编码私钥
- 使用合理的风险限制参数
- 在测试环境中验证配置更改
- 保持配置文件的版本控制

## 故障排除

### 常见问题

1. **配置验证失败**
   - 检查参数类型和范围
   - 确保必需的环境变量已设置

2. **策略无法启动**
   - 验证 `STRATEGIES_ENABLED=true`
   - 检查具体策略的 `*_ENABLED` 参数

3. **执行频率过高**
   - 调整各种 `*_INTERVAL` 参数
   - 增加 `STRATEGY_COOLDOWN_PERIOD`

4. **风险限制频繁触发**
   - 调整 `MAX_DAILY_LOSS` 和 `MAX_EXECUTIONS_PER_HOUR`
   - 检查策略参数是否过于激进

### 调试工具

```bash
# 验证配置
node tools/config-validator.js

# 查看详细配置
node tools/config-validator.js --detailed

# 运行配置演示
node examples/demo-strategy-config.js
```

## 更新日志

- **v1.0.0**: 初始配置系统实现
  - 支持LP做市和每小时套利策略配置
  - 内置风险管理和验证功能
  - 提供配置生成和验证工具