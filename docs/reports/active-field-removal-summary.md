# 市场 Active 字段移除总结

## 修改概述

成功移除了市场对象中的 `active` 字段，并更新了所有相关的判断逻辑，改为使用 `expired` 字段来判断市场状态。

## 修改的文件

### 1. 核心文件
- **src/core/api-client.js**
  - 移除了所有市场对象中的 `active: this.isMarketActive(item)` 字段设置
  - 删除了 `isMarketActive()` 方法
  - 更新了市场过滤逻辑：`market.active &&` → `!market.expired &&`
  - 更新了日志输出：`active markets` → `valid markets`

### 2. 服务文件
- **src/services/market-discovery-service.js**
  - 更新了市场状态检查：`market.active && !market.expired` → `!market.expired`
  - 修复了无法到达的代码问题
  - 在三个发现方法中都移除了对 `active` 字段的依赖

### 3. 策略文件
- **src/strategies/new-market.js**
  - 更新市场状态检查：`!market.active || market.expired` → `market.expired`

- **src/strategies/hourly-arbitrage.js**
  - 更新市场状态检查：`market.active && !market.expired` → `!market.expired`

### 4. 风险控制服务
- **src/services/risk-control-service.js**
  - 更新市场状态检查：`!market.active || market.expired` → `market.expired`

### 5. 工具文件
- **tools/hourly-arbitrage-tool.js**
  - 更新显示逻辑：`活跃: ${market.active ? '是' : '否'}` → `状态: ${market.expired ? '已过期' : '有效'}`

### 6. 文档文件
- **docs/migration-to-global-coordination.md**
  - 更新了示例代码中的市场状态检查逻辑

## 逻辑变更

### 原逻辑
```javascript
// 检查市场是否活跃
if (market.active && !market.expired) {
    // 处理活跃市场
}

// 过滤活跃市场
const activeMarkets = markets.filter(market => 
    market.active && new Date(market.endDate) > now
);
```

### 新逻辑
```javascript
// 检查市场是否有效（未过期）
if (!market.expired) {
    // 处理有效市场
}

// 过滤有效市场
const validMarkets = markets.filter(market => 
    !market.expired && new Date(market.endDate) > now
);
```

## 影响分析

### 正面影响
1. **简化逻辑**: 移除了冗余的 `active` 字段，简化了市场状态判断
2. **统一标准**: 所有地方都使用 `expired` 字段作为唯一的市场状态标准
3. **减少混淆**: 避免了 `active` 和 `expired` 两个字段可能产生的逻辑冲突
4. **性能提升**: 减少了 `isMarketActive()` 方法调用的开销

### 兼容性
- 由于我们使用的是 `/markets/active/` API 端点，返回的市场本身就是活跃的
- `expired` 字段提供了更准确的市场状态信息
- 所有现有的过滤和判断逻辑都已相应更新

## 测试验证

创建了测试文件 `tests/test-market-active-removal.js` 来验证：
1. 市场对象不再包含 `active` 字段
2. 市场发现服务正常工作
3. 所有相关功能正常运行

## 结论

成功移除了市场的 `active` 字段，所有相关代码已更新为使用 `expired` 字段进行市场状态判断。这个修改简化了代码逻辑，提高了一致性，并且不会影响现有功能的正常运行。