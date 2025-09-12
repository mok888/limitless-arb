# 策略级协调机制 - 快速参考

## 核心概念

### 策略级仓位上限
- **定义**: 整个策略在所有账户中同时可执行的最大仓位数量
- **配置**: `maxConcurrentPositions`
- **示例**: 设置为1表示无论有多少账户，该策略同时只能有1个活跃仓位

### 账户轮换机制
- **原则**: 最久未执行账户优先
- **规则**: 
  - 优先选择最久未执行的账户
  - 多个账户都未执行过时随机选择
  - 自动跟踪每个账户的执行历史

## 快速配置

### 环境变量
```bash
# 每小时套利策略级仓位上限
HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS=1

# 其他策略
LP_MAKING_MAX_CONCURRENT_POSITIONS=5
NEW_MARKET_MAX_CONCURRENT_POSITIONS=3
```

### 代码配置
```javascript
const strategyConfig = {
    maxConcurrentPositions: 1,  // 策略级上限
    arbitrageAmount: 10,
    // ... 其他配置
};
```

## 工作流程示例

假设有账户A和B启用每小时套利策略，仓位上限为1：

| 周期 | 发现机会 | 当前仓位 | 选择账户 | 动作 | 说明 |
|------|----------|----------|----------|------|------|
| 1 | ✅ | 0/1 | 账户A | 执行 | 随机选择（都未执行过） |
| 2 | ✅ | 1/1 | - | 跳过 | 已达仓位上限 |
| 3 | ✅ | 0/1 | 账户B | 执行 | B最久未执行 |
| 4 | ✅ | 1/1 | - | 跳过 | 已达仓位上限 |
| 5 | ✅ | 0/1 | 账户A | 执行 | A最久未执行 |

## 常用命令

### 状态查看
```javascript
// 打印策略级详细报告
system.printStrategyLevelReport();

// 获取特定策略状态
const status = coordinator.getStrategyStatus('HOURLY_ARBITRAGE');
console.log(`仓位使用: ${status.currentPositions}/${status.maxPositions}`);
```

### 测试和调试
```javascript
// 测试账户轮换
system.testAccountRotation('HOURLY_ARBITRAGE');

// 运行完整测试
node tests/test-strategy-level-coordination.js

// 运行演示
node examples/demo-strategy-level-coordination.js
```

## 监控要点

### 关键指标
- **仓位利用率**: `currentPositions / maxPositions`
- **账户轮换次数**: 确保各账户公平获得机会
- **机会执行率**: `executed / (executed + skipped)`

### 状态检查
```javascript
const status = coordinator.getStatus();
console.log('总活跃仓位:', status.totalActivePositions);
console.log('账户轮换次数:', status.stats.accountRotationCount);
console.log('机会执行率:', 
    (status.stats.totalOpportunitiesExecuted / 
     status.stats.totalOpportunitiesReceived * 100).toFixed(1) + '%');
```

## 故障排除

### 常见问题

1. **账户轮换不工作**
   ```bash
   # 检查账户注册状态
   coordinator.accountExecutors.size  // 应该 > 0
   
   # 检查策略配置
   coordinator.strategyConfigs.has('HOURLY_ARBITRAGE')  // 应该为 true
   ```

2. **仓位上限不生效**
   ```bash
   # 检查配置
   echo $HOURLY_ARBITRAGE_MAX_CONCURRENT_POSITIONS
   
   # 检查仓位跟踪
   coordinator.strategyPositions.get('HOURLY_ARBITRAGE').size
   ```

3. **机会分发失败**
   ```bash
   # 启用调试日志
   export LOG_LEVEL=debug
   
   # 检查事件监听
   coordinator.listenerCount('strategyPositionOpened')  // 应该 > 0
   ```

## 最佳实践

### 配置建议
- **保守策略**: `maxConcurrentPositions = 1-2`
- **积极策略**: `maxConcurrentPositions = 3-5`
- **账户数量**: 2-5个账户启用同一策略

### 监控建议
- 定期检查仓位利用率
- 监控账户执行公平性
- 关注机会执行成功率

### 调试建议
- 使用演示脚本理解机制
- 启用详细日志进行调试
- 定期运行测试脚本验证功能

## 扩展配置

### 自定义策略级配置
```javascript
// 在 global-coordination-main.js 中
getDefaultStrategyConfig(strategyType) {
    const configs = {
        [StrategyType.CUSTOM_STRATEGY]: {
            maxConcurrentPositions: 2,  // 自定义策略级上限
            // ... 其他配置
        }
    };
    return configs[strategyType] || {};
}
```

### 动态调整配置
```javascript
// 运行时调整策略级配置
coordinator.setStrategyConfig('HOURLY_ARBITRAGE', {
    maxConcurrentPositions: 2,  // 调整为2个仓位
    // ... 其他配置
});
```

## 相关文件

- **核心实现**: `src/coordinators/strategy-level-coordinator.js`
- **集成代码**: `src/coordinators/global-strategy-coordinator.js`
- **配置文件**: `src/config/strategy-config.js`
- **测试脚本**: `tests/test-strategy-level-coordination.js`
- **演示脚本**: `examples/demo-strategy-level-coordination.js`
- **配置示例**: `strategy-level-config-example.env`