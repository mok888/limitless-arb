# 每小时套利策略指南

## 概述

每小时套利策略是一个专门针对每小时结算市场的自动化套利系统。该策略监控带有 `hourly` 标识的市场，在结算前10分钟检测价格在90%-98.5%区间的套利机会，自动购买10u份额等待结算获利。

## 核心特性

### 🔄 全局监控器（单例模式）
- **避免重复监控**: 多个账户使用该策略时，只运行一个全局监控实例
- **资源优化**: 减少API调用和系统资源消耗
- **统一管理**: 所有策略实例共享同一个监控器状态

### ⏰ 智能时间管理
- **精确时间计算**: 自动计算距离下一个整点结算的时间
- **缓冲时间控制**: 默认在结算前10分钟开始检测机会
- **周期防重复**: 避免在同一结算周期内重复处理相同市场

### 🎯 套利机会检测
- **价格区间过滤**: 只关注90%-98.5%价格区间的机会
- **预期收益计算**: 基于概率和价格计算预期收益
- **风险控制**: 限制最大并发仓位数量

## 配置参数

```javascript
const config = {
    arbitrageAmount: 10,              // 每次套利金额（USDC）
    minPriceThreshold: 0.90,          // 最低价格阈值（90%）
    maxPriceThreshold: 0.985,         // 最高价格阈值（98.5%）
    settlementBuffer: 10 * 60 * 1000, // 结算前缓冲时间（10分钟）
    scanInterval: 60000,              // 扫描间隔（1分钟）
    maxConcurrentPositions: 5         // 最大并发仓位数
};
```

### 参数说明

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `arbitrageAmount` | number | 10 | 每次套利投入的USDC金额 |
| `minPriceThreshold` | number | 0.90 | 最低价格阈值，低于此价格不参与套利 |
| `maxPriceThreshold` | number | 0.985 | 最高价格阈值，高于此价格不参与套利 |
| `settlementBuffer` | number | 600000 | 结算前多长时间开始检测（毫秒） |
| `scanInterval` | number | 60000 | 市场扫描间隔（毫秒） |
| `maxConcurrentPositions` | number | 5 | 同时持有的最大仓位数量 |

## 使用方法

### 1. 基础使用

```javascript
import { HourlyArbitrageStrategy } from '../src/strategies/hourly-arbitrage-strategy.js';
import { LimitlessApiClient } from '../src/core/api-client.js';

// 创建API客户端
const apiClient = new LimitlessApiClient();

// 创建策略实例
const strategy = new HourlyArbitrageStrategy(apiClient, {
    arbitrageAmount: 10,
    minPriceThreshold: 0.90,
    maxPriceThreshold: 0.985
});

// 初始化并启动
await strategy.initialize();
```

### 2. 多账户使用

```javascript
// 账户1
const strategy1 = new HourlyArbitrageStrategy(apiClient1, config);
await strategy1.initialize();

// 账户2 - 自动使用同一个全局监控器
const strategy2 = new HourlyArbitrageStrategy(apiClient2, config);
await strategy2.initialize();

// 两个策略实例共享同一个监控器，避免重复扫描
```

### 3. 事件监听

```javascript
// 监听套利交易执行
strategy.on('arbitrageTradeExecuted', (data) => {
    console.log(`套利交易执行: ${data.market.title}`);
    console.log(`方向: ${data.opportunity.side}`);
    console.log(`价格: ${data.opportunity.price * 100}%`);
    console.log(`预期收益: ${data.opportunity.expectedReturn} USDC`);
});

// 监听仓位结算
strategy.on('positionSettled', (data) => {
    console.log(`仓位结算: ${data.settlementResult.isWin ? '获胜' : '失败'}`);
    console.log(`实际收益: ${data.settlementResult.actualReturn} USDC`);
});

// 监听交易失败
strategy.on('arbitrageTradeFailed', (data) => {
    console.error(`套利交易失败: ${data.error.message}`);
});
```

## 工作流程

### 1. 市场发现
```
扫描所有市场 → 筛选hourly标识 → 检查是否接近结算时间
```

### 2. 机会评估
```
获取市场价格 → 检查价格区间 → 计算预期收益 → 验证风险限制
```

### 3. 交易执行
```
创建订单数据 → 记录仓位信息 → 发送交易事件 → 等待结算
```

### 4. 结算处理
```
检查结算时间 → 查询结算结果 → 计算实际收益 → 更新统计信息
```

## 策略逻辑

### 套利条件
1. **市场类型**: 必须包含 `hourly` 标签
2. **时间窗口**: 距离结算时间小于缓冲时间
3. **价格区间**: 价格在90%-98.5%之间
4. **仓位限制**: 未达到最大并发仓位数
5. **重复检查**: 未在当前结算周期处理过

### 收益计算

**买入YES代币**:
```
预期收益 = (投资额 / 价格 - 投资额) × 价格
```

**买入NO代币**:
```
预期收益 = (投资额 / (1-价格) - 投资额) × (1-价格)
```

### 风险控制
- **价格区间限制**: 避免价格过低或过高的高风险交易
- **时间窗口控制**: 只在结算前短时间内交易，减少价格波动风险
- **仓位数量限制**: 控制同时持有的仓位数量
- **重复交易防护**: 避免在同一结算周期重复交易

## 配置建议

### 保守配置
```javascript
const conservativeConfig = {
    arbitrageAmount: 5,               // 较小金额
    minPriceThreshold: 0.92,          // 较高最低阈值
    maxPriceThreshold: 0.98,          // 较低最高阈值
    settlementBuffer: 15 * 60 * 1000, // 更长缓冲时间
    maxConcurrentPositions: 2         // 较少并发仓位
};
```

### 激进配置
```javascript
const aggressiveConfig = {
    arbitrageAmount: 20,              // 较大金额
    minPriceThreshold: 0.88,          // 较低最低阈值
    maxPriceThreshold: 0.99,          // 较高最高阈值
    settlementBuffer: 5 * 60 * 1000,  // 较短缓冲时间
    maxConcurrentPositions: 8         // 更多并发仓位
};
```

## 监控和调试

### 状态查询
```javascript
const status = strategy.getStatus();
console.log('策略状态:', status);
```

### 手动触发扫描
```javascript
await strategy.triggerScan();
```

### 统计信息
```javascript
const status = strategy.getStatus();
console.log('总扫描次数:', status.stats.totalScans);
console.log('检测机会数:', status.stats.opportunitiesDetected);
console.log('开仓数量:', status.stats.positionsOpened);
console.log('总收益:', status.stats.totalProfit);
```

## 注意事项

### ⚠️ 安全提醒
1. **真实交易**: 该策略会执行真实的交易订单，请确保配置正确
2. **资金风险**: 套利存在失败风险，请合理配置投资金额
3. **网络延迟**: 考虑网络延迟对时间窗口的影响
4. **市场流动性**: 确保目标市场有足够的流动性

### 🔧 技术限制
1. **单例模式**: 全局只有一个监控器实例，配置变更会影响所有策略
2. **时间依赖**: 依赖系统时间准确性，建议使用NTP同步
3. **API限制**: 受到交易所API调用频率限制
4. **结算检测**: 目前使用模拟结算检测，实际使用需要实现真实检测

## 集成示例

### 与多策略系统集成
```javascript
// 在CLI界面中添加策略
const strategyConfig = {
    type: 'HourlyArbitrage',
    config: {
        arbitrageAmount: 10,
        minPriceThreshold: 0.90,
        maxPriceThreshold: 0.985,
        maxConcurrentPositions: 3
    }
};

// 添加到账户配置
const accountConfig = {
    id: 'account1',
    name: '套利账户',
    strategies: ['HourlyArbitrage'],
    strategyConfigs: [strategyConfig]
};
```

### 与执行引擎集成
```javascript
// 执行引擎会自动识别和创建HourlyArbitrage策略
const executionEngine = new ExecutionEngine(apiClient);
await executionEngine.initialize(configuration);
await executionEngine.start();
```

## 性能优化

### 减少API调用
- 使用全局监控器避免重复扫描
- 批量获取市场数据
- 缓存市场信息

### 内存管理
- 定期清理过期的处理记录
- 限制活跃仓位数量
- 及时释放已结算仓位

### 错误处理
- 网络错误重试机制
- 交易失败回滚处理
- 异常情况日志记录

## 故障排除

### 常见问题

**Q: 策略不执行交易？**
A: 检查是否有符合条件的hourly市场，确认时间窗口和价格区间设置

**Q: 重复创建监控器？**
A: 确保使用单例模式，多个策略实例会自动共享监控器

**Q: 结算检测不准确？**
A: 当前使用模拟结算，实际使用需要实现真实的结算状态检测

**Q: 收益计算错误？**
A: 检查价格数据准确性，确认收益计算公式符合市场规则

### 调试技巧
1. 启用详细日志输出
2. 使用测试模式验证逻辑
3. 监控API调用频率
4. 检查系统时间同步

## 更新日志

### v1.0.0
- 初始版本发布
- 实现基础套利逻辑
- 支持全局监控器
- 集成多策略系统