# 全局架构设计指南

## 概述

本文档描述了重构后的全局架构设计，解决了之前代码结构中的问题，提供了更好的资源管理和代码组织。

## 架构组件

### 1. 全局管理器 (Global Managers)

#### MarketDataManager (市场数据管理器)
- **职责**: 全局市场数据的获取、缓存和定期更新
- **特性**:
  - 定期自动更新所有市场数据（默认30秒间隔）
  - 内存缓存，避免重复API请求
  - 预处理市场配置参数
  - 提供数据过期检查和强制刷新功能
  - 统计信息和错误监控

#### MarketListenerManager (市场监听管理器)
- **职责**: 管理哪些账户在监听哪些市场
- **特性**:
  - 防止重复监听同一市场
  - 跟踪监听关系和策略信息
  - 支持批量操作
  - 自动清理过期监听记录
  - 提供监听统计和报告

#### GlobalManager (全局管理器协调器)
- **职责**: 统一管理所有全局资源
- **特性**:
  - 协调各个管理器的启动和停止
  - 提供统一的API接口
  - 系统健康检查和状态监控
  - 推荐市场功能
  - 批量操作支持

### 2. 工具类 (Utilities)

#### MarketUtils (市场工具类)
- **职责**: 提供通用的市场计算和分析方法
- **包含方法**:
  - 价格计算（中点价格、奖励价格区间）
  - 奖励计算（奖励倍数、预期收益）
  - 订单相关（最优价格、订单大小、订单数据创建）
  - 市场评分和验证
  - 价格数据提取和格式化

### 3. 重构后的策略类

#### TradingStrategy (交易策略)
- **变化**: 不再包含公共方法，专注于策略逻辑
- **依赖**: 接收全局管理器实例，通过它们获取数据
- **职责**: 
  - 策略特定的市场评估逻辑
  - 监听管理的策略接口
  - 策略统计信息

## 架构优势

### 1. 资源优化
- **避免重复请求**: 全局市场数据管理器确保数据只获取一次
- **内存效率**: 统一的数据缓存，避免多个策略重复存储相同数据
- **网络优化**: 定期批量更新，减少API调用频率

### 2. 监听管理
- **防止重复监听**: 全局监听表防止同一账户重复监听同一市场
- **资源跟踪**: 清楚知道哪些资源正在被使用
- **自动清理**: 定期清理过期的监听记录

### 3. 代码组织
- **职责分离**: 每个组件有明确的职责
- **代码复用**: 公共方法提取到工具类
- **易于维护**: 清晰的依赖关系和接口

### 4. 监控和调试
- **统计信息**: 各个组件提供详细的运行统计
- **健康检查**: 系统级别的健康状态监控
- **错误跟踪**: 统一的错误计数和报告

## 使用方式

### 基本设置

```javascript
import GlobalManager from '../src/managers/global-manager.js';
import TradingStrategy from '../src/strategies/trading-strategy.js';
import ApiClient from '../src/core/api-client.js';

// 1. 创建API客户端
const apiClient = new ApiClient();

// 2. 创建全局管理器
const globalManager = new GlobalManager(apiClient);

// 3. 启动全局管理器
await globalManager.start();

// 4. 创建策略（传入管理器）
const strategy = new TradingStrategy(
    globalManager.getMarketDataManager(),
    globalManager.getMarketListenerManager()
);
```

### 获取市场数据

```javascript
// 从全局管理器获取数据（已缓存，无需API调用）
const allMarkets = globalManager.getAllMarkets();
const rewardableMarkets = globalManager.getRewardableMarkets();
const specificMarket = globalManager.getMarket(tokenId);
```

### 管理市场监听

```javascript
// 添加监听
globalManager.addMarketListener(tokenId, accountId, {
    strategyType: 'LP奖励优化',
    targetReward: 10.5
});

// 查看监听状态
const listeners = globalManager.getMarketListeners(tokenId);
const accountMarkets = globalManager.getAccountListeners(accountId);

// 移除监听
globalManager.removeMarketListener(tokenId, accountId);
```

### 策略评估

```javascript
// 策略现在从全局管理器获取数据
const opportunity = await strategy.evaluateMarket(market, orderbook, {
    silent: false,
    detailed: true,
    index: 1
});
```

### 系统监控

```javascript
// 获取系统状态
const stats = globalManager.getSystemStats();

// 打印状态报告
globalManager.printSystemStatus();

// 健康检查
const health = await globalManager.healthCheck();
```

## 迁移指南

### 从旧架构迁移

1. **更新策略类实例化**:
   ```javascript
   // 旧方式
   const strategy = new TradingStrategy();
   
   // 新方式
   const strategy = new TradingStrategy(marketDataManager, marketListenerManager);
   ```

2. **更新市场数据获取**:
   ```javascript
   // 旧方式
   const markets = await apiClient.getAllMarkets();
   
   // 新方式
   const markets = globalManager.getAllMarkets(); // 已缓存
   ```

3. **使用工具类方法**:
   ```javascript
   // 旧方式
   const midpoint = strategy.calculateMidpoint(bid, ask);
   
   // 新方式
   const midpoint = MarketUtils.calculateMidpoint(bid, ask);
   ```

### 配置更新

在 `config.js` 中添加市场数据更新间隔配置：

```javascript
export const config = {
    // ... 其他配置
    MARKET_DATA: {
        UPDATE_INTERVAL: 30000, // 30秒更新间隔
    }
};
```

## 最佳实践

### 1. 启动顺序
1. 创建API客户端
2. 创建全局管理器
3. 启动全局管理器
4. 创建策略实例
5. 开始策略执行

### 2. 错误处理
- 使用全局管理器的健康检查功能
- 监控各组件的错误统计
- 实现适当的重试机制

### 3. 资源清理
- 在应用关闭时调用 `globalManager.stop()`
- 定期清理过期的监听记录
- 监控内存使用情况

### 4. 性能优化
- 根据需要调整市场数据更新间隔
- 使用批量操作处理大量监听关系
- 监控API调用频率

## 故障排除

### 常见问题

1. **市场数据未更新**
   - 检查全局管理器是否已启动
   - 查看市场数据管理器的错误统计
   - 验证API客户端配置

2. **监听关系丢失**
   - 检查是否有过期清理设置过于激进
   - 验证账户ID和市场ID的正确性

3. **内存使用过高**
   - 检查市场数据缓存大小
   - 清理不必要的监听关系
   - 调整更新间隔

### 调试工具

- 使用 `globalManager.printSystemStatus()` 查看系统状态
- 使用 `globalManager.healthCheck()` 进行健康检查
- 查看各组件的统计信息

## 未来扩展

### 计划中的功能
- 市场数据持久化存储
- 更智能的推荐算法
- 实时市场事件通知
- 分布式部署支持

### 扩展点
- 新的管理器类型
- 自定义市场过滤器
- 插件化的策略系统
- 外部数据源集成