# 全局架构重构总结

## 重构目标

根据用户需求，重新组织代码结构，解决以下问题：
1. `trading-strategy.js` 中包含过多公共方法，其他策略不应该引用该文件
2. 需要设计全局方法，避免资源重复使用
3. 需要全局市场数据管理，只在全局启动定期获取
4. 需要全局监听管理表，记录哪些账户在监听哪些市场

## 重构内容

### 1. 新增全局管理器

#### `src/managers/market-data-manager.js`
- **功能**: 全局市场数据管理器
- **职责**: 
  - 定期获取和缓存所有市场数据
  - 避免重复API请求
  - 提供数据过期检查和强制刷新
  - 预处理市场配置参数

#### `src/managers/market-listener-manager.js`
- **功能**: 全局市场监听管理器
- **职责**:
  - 管理账户与市场的监听关系
  - 防止重复监听
  - 跟踪监听策略信息
  - 自动清理过期监听记录

#### `src/managers/global-manager.js`
- **功能**: 全局管理器协调器
- **职责**:
  - 统一管理所有全局资源
  - 提供统一的API接口
  - 系统健康检查和状态监控
  - 推荐市场功能

### 2. 新增工具类

#### `src/core/market-utils.js`
- **功能**: 市场工具类
- **职责**: 
  - 从 `trading-strategy.js` 提取的公共方法
  - 价格计算、奖励计算、订单处理等通用功能
  - 静态方法，可被任何策略使用

### 3. 重构现有策略类

#### `src/strategies/trading-strategy.js`
- **变化**: 
  - 移除所有公共方法，专注于策略逻辑
  - 接收全局管理器实例作为依赖
  - 通过全局管理器获取数据，而不是直接调用API
  - 使用 `MarketUtils` 进行通用计算

### 4. 新增示例和文档

#### `examples/demo-global-architecture.js`
- 演示新架构的使用方式
- 展示全局管理器的各种功能

#### `docs/global-architecture-guide.md`
- 详细的架构设计文档
- 使用指南和最佳实践

## 架构优势

### 1. 资源优化
- ✅ 全局市场数据管理，避免重复请求
- ✅ 统一的数据缓存，提高内存效率
- ✅ 定期批量更新，减少API调用频率

### 2. 监听管理
- ✅ 全局监听表，防止重复监听
- ✅ 清楚跟踪哪些账户在监听哪些市场
- ✅ 自动清理过期监听记录

### 3. 代码组织
- ✅ 职责分离，每个组件有明确职责
- ✅ 公共方法提取到工具类，便于复用
- ✅ 策略类更专注于策略逻辑
- ✅ 清晰的依赖关系

### 4. 监控和调试
- ✅ 详细的运行统计信息
- ✅ 系统级别的健康检查
- ✅ 统一的错误跟踪和报告

## 使用方式对比

### 旧方式
```javascript
// 每个策略都要自己获取市场数据
const strategy = new TradingStrategy();
const markets = await apiClient.getAllMarkets(); // 重复请求
const opportunity = strategy.findOpportunity(market, bid, ask);
```

### 新方式
```javascript
// 全局管理器统一管理数据
const globalManager = new GlobalManager(apiClient);
await globalManager.start(); // 启动定期更新

const strategy = new TradingStrategy(
    globalManager.getMarketDataManager(),
    globalManager.getMarketListenerManager()
);

// 从缓存获取数据，无需API请求
const markets = globalManager.getAllMarkets();
const opportunity = await strategy.evaluateMarket(market);

// 管理监听关系
globalManager.addMarketListener(tokenId, accountId, metadata);
```

## 配置更新

在 `src/core/config.js` 中新增配置项：

```javascript
MARKET_DATA: {
    UPDATE_INTERVAL: 30000,  // 市场数据更新间隔
    STALE_THRESHOLD: 60000,  // 数据过期阈值
},
MARKET_LISTENERS: {
    LISTENER_EXPIRY: 24 * 60 * 60 * 1000,  // 监听记录过期时间
    CLEANUP_INTERVAL: 60 * 60 * 1000,      // 清理间隔
}
```

## 迁移步骤

### 对于现有代码
1. 更新策略类实例化方式，传入全局管理器
2. 将直接的API调用改为从全局管理器获取数据
3. 将公共方法调用改为使用 `MarketUtils`
4. 添加监听管理逻辑

### 对于新策略
1. 继承或参考重构后的 `TradingStrategy` 结构
2. 使用全局管理器获取数据
3. 使用 `MarketUtils` 进行通用计算
4. 通过监听管理器注册市场监听

## 文件结构变化

### 新增文件
```
src/managers/
├── market-data-manager.js      # 全局市场数据管理器
├── market-listener-manager.js  # 全局监听管理器
└── global-manager.js           # 全局管理器协调器

src/core/
└── market-utils.js             # 市场工具类

examples/
└── demo-global-architecture.js # 架构演示

docs/
└── global-architecture-guide.md # 架构文档
```

### 修改文件
```
src/strategies/trading-strategy.js  # 重构，移除公共方法
src/core/config.js                  # 添加新配置项
```

## 测试建议

1. 运行 `examples/demo-global-architecture.js` 验证新架构
2. 测试全局管理器的启动和停止
3. 验证市场数据的定期更新
4. 测试监听管理的各种操作
5. 检查系统状态和健康检查功能

## 后续优化

1. 添加市场数据持久化存储
2. 实现更智能的推荐算法
3. 添加实时市场事件通知
4. 支持分布式部署

## 总结

这次重构成功解决了用户提出的所有问题：
- ✅ 将公共方法从 `trading-strategy.js` 提取到 `MarketUtils`
- ✅ 实现了全局市场数据管理，避免重复请求
- ✅ 创建了全局监听管理表，跟踪账户和市场的监听关系
- ✅ 提供了统一的全局管理器接口
- ✅ 改善了代码组织结构和可维护性

新架构更加模块化、高效，并且易于扩展和维护。