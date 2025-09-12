# 每小时套利策略完整调用过程

## 概述

本文档详细描述每小时套利策略 (`HourlyArbitrageStrategy`) 的完整调用过程，包括涉及的所有文件、方法和数据流。

## 核心文件结构

```
src/
├── strategies/
│   ├── hourly-arbitrage.js          # 主策略类
│   ├── base-strategy.js             # 基础策略类
│   └── strategy-types.js            # 策略类型定义
├── services/
│   └── market-evaluation-service.js # 市场评估服务
├── core/
│   ├── api-client.js               # API客户端
│   ├── market-utils.js             # 市场工具类
│   └── config.js                   # 配置管理
└── config/
    └── strategy-config.js          # 策略配置
```

## 完整调用流程

### 1. 策略初始化阶段

#### 1.1 构造函数调用
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `constructor(apiClient, config = {})`

```javascript
// 调用链：
new HourlyArbitrageStrategy(apiClient, config)
  ↓
super('每小时套利策略', apiClient, config)  // 调用BaseStrategy构造函数
  ↓
this.getDefaultConfig()  // 获取默认配置
  ↓
hourlyArbitrageConfig from src/config/strategy-config.js
```

**涉及的文件和方法**:
- `src/strategies/base-strategy.js` → `constructor()`
- `src/strategies/hourly-arbitrage.js` → `getDefaultConfig()`
- `src/config/strategy-config.js` → `hourlyArbitrageConfig`

#### 1.2 策略初始化
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `initialize()` → `onInitialize()`

```javascript
// 调用链：
strategy.initialize()
  ↓
BaseStrategy.initialize()  // 基类方法
  ↓
this.setState(StrategyState.INITIALIZING)
  ↓
this.onInitialize()  // 子类实现
  ↓
new MarketEvaluationService(this.apiClient)
  ↓
this.setState(StrategyState.IDLE)
```

**涉及的文件和方法**:
- `src/strategies/base-strategy.js` → `initialize()`, `setState()`
- `src/strategies/hourly-arbitrage.js` → `onInitialize()`
- `src/services/market-evaluation-service.js` → `constructor()`

### 2. 策略启动阶段

#### 2.1 策略启动
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `start()` → `onStart()`

```javascript
// 调用链：
strategy.start()
  ↓
BaseStrategy.start()  // 基类方法
  ↓
this.setState(StrategyState.RUNNING)
  ↓
this.onStart()  // 子类实现
  ↓
this.execute()  // 立即执行一次
  ↓
this.setTimer('marketScan', callback, interval)  // 设置定期扫描
  ↓
this.setTimer('positionCheck', callback, interval)  // 设置仓位检查
```

**涉及的文件和方法**:
- `src/strategies/base-strategy.js` → `start()`, `setState()`, `setTimer()`
- `src/strategies/hourly-arbitrage.js` → `onStart()`, `execute()`

### 3. 策略执行阶段

#### 3.1 主执行流程
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `execute()` → `onExecute()`

```javascript
// 调用链：
strategy.execute()
  ↓
BaseStrategy.execute()  // 基类方法
  ↓
this.onExecute()  // 子类实现
  ↓
this.apiClient.getMarkets()  // 获取所有市场
  ↓
this.filterHourlyMarkets(markets)  // 筛选每小时市场
  ↓
for each market:
    this.isNearSettlement(market)  // 检查是否接近结算
    ↓
    this.getMarketCycleId(market)  // 生成市场周期ID
    ↓
    this.evaluateArbitrageOpportunity(market)  // 评估套利机会
    ↓
    this.executeArbitrageTrade(market, opportunity)  // 执行交易
```

**涉及的文件和方法**:
- `src/strategies/base-strategy.js` → `execute()`
- `src/strategies/hourly-arbitrage.js` → `onExecute()`, `filterHourlyMarkets()`, `isNearSettlement()`, `getMarketCycleId()`, `evaluateArbitrageOpportunity()`, `executeArbitrageTrade()`
- `src/core/api-client.js` → `getMarkets()`

#### 3.2 市场筛选流程
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `filterHourlyMarkets(markets)`

```javascript
// 调用链：
this.filterHourlyMarkets(markets)
  ↓
markets.filter(market => {
    // 检查市场标签
    market.tags.some(tag => tag.toLowerCase().includes('hourly'))
    ↓
    // 检查市场状态
    !market.expired
    ↓
    // 检查结束时间模式
    new Date(market.endDate).getMinutes() === 0
})
```

**数据流**:
- 输入: `markets[]` (所有市场数据)
- 输出: `hourlyMarkets[]` (筛选后的每小时市场)

#### 3.3 结算时间检查
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `isNearSettlement(market)`

```javascript
// 调用链：
this.isNearSettlement(market)
  ↓
new Date(market.endDate)  // 获取结束时间
  ↓
endTime.getTime() - now.getTime()  // 计算时间差
  ↓
timeToSettlement <= this.config.settlementBuffer  // 检查缓冲时间
  ↓
timeToSettlement >= this.config.minTimeToSettlement  // 检查最小时间
```

**配置参数**:
- `settlementBuffer`: 结算缓冲时间 (默认10分钟)
- `minTimeToSettlement`: 最小结算时间 (默认5分钟)

#### 3.4 套利机会评估
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `evaluateArbitrageOpportunity(market)`

```javascript
// 调用链：
this.evaluateArbitrageOpportunity(market)
  ↓
this.marketEvaluationService.evaluateMarket(market, null, {silent: true})
  ↓
MarketEvaluationService.evaluateMarket()
  ↓
MarketUtils.extractPriceData(market, orderbook)
  ↓
this.findOpportunity(market, bestBid, bestAsk)
  ↓
MarketUtils.calculateOptimalPrices()
  ↓
MarketUtils.calculateMarketScore()
  ↓
// 回到HourlyArbitrageStrategy
price >= this.config.minPriceThreshold && price <= this.config.maxPriceThreshold
  ↓
this.calculateExpectedReturn(price, side)
```

**涉及的文件和方法**:
- `src/services/market-evaluation-service.js` → `evaluateMarket()`, `findOpportunity()`, `extractMarketConfig()`
- `src/core/market-utils.js` → `extractPriceData()`, `calculateOptimalPrices()`, `calculateMarketScore()`
- `src/strategies/hourly-arbitrage.js` → `calculateExpectedReturn()`

#### 3.5 预期收益计算
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `calculateExpectedReturn(price, side)`

```javascript
// 调用链：
this.calculateExpectedReturn(price, side)
  ↓
if (side === 'buy'):
    potentialReturn = (investment / price) - investment
    probability = price
    return potentialReturn * probability
else:
    potentialReturn = (investment / (1 - price)) - investment
    probability = 1 - price
    return potentialReturn * probability
```

**计算逻辑**:
- **买入YES**: 收益 = (投资额 / 价格 - 投资额) × 价格概率
- **买入NO**: 收益 = (投资额 / (1-价格) - 投资额) × (1-价格)概率

### 4. 交易执行阶段

#### 4.1 套利交易执行
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `executeArbitrageTrade(market, opportunity)`

```javascript
// 调用链：
this.executeArbitrageTrade(market, opportunity)
  ↓
this.apiClient.getWalletAddress()  // 获取钱包地址
  ↓
this.apiClient.getUserId()  // 获取用户ID
  ↓
this.marketEvaluationService.createOrderData(market, opportunity, walletAddress, userId)
  ↓
MarketEvaluationService.createOrderData()
  ↓
MarketUtils.createOrderData(market, opportunity, walletAddress, userId, marketConfig)
  ↓
// 记录仓位
this.activePositions.set(positionId, positionData)
  ↓
// 发出事件
this.emit('arbitrageTradeExecuted', eventData)
```

**涉及的文件和方法**:
- `src/core/api-client.js` → `getWalletAddress()`, `getUserId()`
- `src/services/market-evaluation-service.js` → `createOrderData()`
- `src/core/market-utils.js` → `createOrderData()`
- `src/strategies/base-strategy.js` → `emit()` (EventEmitter)

#### 4.2 订单数据创建
**文件**: `src/core/market-utils.js`
**方法**: `createOrderData(market, opportunity, walletAddress, userId, marketConfig)`

```javascript
// 调用链：
MarketUtils.createOrderData()
  ↓
// 计算订单参数
salt = Date.now()
tokenId = market.tokenId
makerAmount = opportunity.amount * 1000000  // 转换为wei
takerAmount = calculateTakerAmount(opportunity)
expiration = Date.now() + 24 * 60 * 60 * 1000  // 24小时后过期
  ↓
// 创建订单对象
order = {
    salt, maker, signer, taker, tokenId,
    makerAmount, takerAmount, expiration,
    nonce, feeRateBps, side, signatureType
}
  ↓
// 返回订单数据
return {
    conditionId: market.conditionId,
    orderType: 'MARKET',
    amount: opportunity.amount,
    shares: makerAmount / 1000000,
    timestamp: Date.now(),
    order: order
}
```

### 5. 仓位管理阶段

#### 5.1 仓位检查
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `checkPositions()`

```javascript
// 调用链：
this.checkPositions()  // 定时器触发
  ↓
for each position in this.activePositions:
    now >= position.expectedSettlementTime + 60000  // 检查是否过结算时间
    ↓
    this.simulateSettlement(position)  // 模拟结算
    ↓
    this.handlePositionSettlement(positionId, position, settlementResult)
```

#### 5.2 结算处理
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `handlePositionSettlement(positionId, position, settlementResult)`

```javascript
// 调用链：
this.handlePositionSettlement(positionId, position, settlementResult)
  ↓
// 更新统计信息
this.strategyStats.positionsSettled++
this.strategyStats.totalProfit += settlementResult.actualReturn
  ↓
// 发出结算事件
this.emit('positionSettled', eventData)
  ↓
// 从活跃仓位中移除
this.activePositions.delete(positionId)
```

### 6. 状态管理和监控

#### 6.1 状态获取
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `getStatus()`

```javascript
// 调用链：
this.getStatus()
  ↓
super.getStatus()  // 获取基础状态
  ↓
// 添加策略特定状态
return {
    ...baseStatus,
    strategyType: this.strategyType,
    activePositions: this.activePositions.size,
    processedMarkets: this.processedMarkets.size,
    strategyStats: {...this.strategyStats},
    positionDetails: Array.from(this.activePositions.values()).map(...)
}
```

#### 6.2 手动触发扫描
**文件**: `src/strategies/hourly-arbitrage.js`
**方法**: `triggerScan()`

```javascript
// 调用链：
this.triggerScan()
  ↓
if (this.state !== StrategyState.RUNNING) throw Error
  ↓
this.execute()  // 手动执行策略
```

## 配置参数详解

### 环境变量配置
**文件**: `src/config/strategy-config.js`

```javascript
export const hourlyArbitrageConfig = {
    // 基础配置
    enabled: HOURLY_ARBITRAGE_ENABLED,                    // 策略启用状态
    maxRetries: HOURLY_ARBITRAGE_MAX_RETRIES,            // 最大重试次数
    retryDelay: HOURLY_ARBITRAGE_RETRY_DELAY,            // 重试延迟
    
    // 交易参数
    arbitrageAmount: HOURLY_ARBITRAGE_AMOUNT,            // 套利金额 (默认10 USDC)
    minPriceThreshold: HOURLY_ARBITRAGE_MIN_PRICE_THRESHOLD, // 最低价格阈值 (默认90%)
    maxPriceThreshold: HOURLY_ARBITRAGE_MAX_PRICE_THRESHOLD, // 最高价格阈值 (默认98.5%)
    maxConcurrentPositions: HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS, // 最大并发仓位
    
    // 时间配置
    settlementBuffer: HOURLY_ARBITRAGE_SETTLEMENT_BUFFER,     // 结算缓冲时间 (默认10分钟)
    scanInterval: HOURLY_ARBITRAGE_SCAN_INTERVAL,            // 扫描间隔 (默认1分钟)
    minTimeToSettlement: HOURLY_ARBITRAGE_MIN_TIME_TO_SETTLEMENT, // 最小结算时间 (默认5分钟)
    positionCheckInterval: HOURLY_ARBITRAGE_POSITION_CHECK_INTERVAL // 仓位检查间隔 (默认30秒)
};
```

## 事件系统

### 事件类型和触发时机

#### 1. `arbitrageTradeExecuted`
**触发位置**: `executeArbitrageTrade()` 方法
**事件数据**:
```javascript
{
    positionId: string,
    market: Object,
    opportunity: Object,
    orderData: Object,
    timestamp: number
}
```

#### 2. `arbitrageTradeFailed`
**触发位置**: `executeArbitrageTrade()` 方法 (catch块)
**事件数据**:
```javascript
{
    positionId: string,
    market: Object,
    error: Error
}
```

#### 3. `positionSettled`
**触发位置**: `handlePositionSettlement()` 方法
**事件数据**:
```javascript
{
    positionId: string,
    position: Object,
    settlementResult: Object,
    timestamp: number
}
```

## 数据结构

### 仓位数据结构
```javascript
{
    marketId: string,
    market: Object,
    opportunity: Object,
    orderData: Object,
    openTime: number,
    expectedSettlementTime: number,
    status: 'open' | 'settled',
    investment: number,
    expectedReturn: number
}
```

### 机会数据结构
```javascript
{
    side: 'buy' | 'sell',
    price: number,
    amount: number,
    expectedReturn: number,
    arbitrageAmount: number,
    isArbitrageOpportunity: boolean,
    marketScore: number,
    bonusMultiplier: number
}
```

## 错误处理

### 错误处理层级
1. **方法级错误处理**: 每个关键方法都有try-catch
2. **策略级错误处理**: BaseStrategy.handleError()
3. **事件级错误处理**: 通过事件系统通知错误

### 常见错误类型
- **网络错误**: API调用失败
- **数据错误**: 市场数据不完整或无效
- **配置错误**: 配置参数无效
- **业务逻辑错误**: 套利条件不满足

## 性能优化

### 缓存机制
- **已处理市场缓存**: `processedMarkets` Set
- **活跃仓位缓存**: `activePositions` Map
- **市场数据缓存**: API客户端级别缓存

### 并发控制
- **最大并发仓位**: `maxConcurrentPositions` 配置
- **定时器管理**: BaseStrategy 统一管理定时器
- **状态检查**: 执行前检查策略状态

## 总结

每小时套利策略的调用过程涉及多个层级和组件的协作：

1. **初始化阶段**: 策略配置加载、服务创建、状态设置
2. **启动阶段**: 定时器设置、立即执行、状态转换
3. **执行阶段**: 市场扫描、机会评估、交易执行
4. **管理阶段**: 仓位监控、结算处理、状态更新

整个流程通过事件系统实现松耦合，通过配置系统实现灵活性，通过状态管理实现可控性，是一个完整的、生产就绪的交易策略实现。