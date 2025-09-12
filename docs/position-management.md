# 仓位管理功能文档

## 概述

仓位管理模块提供了 Limitless 平台的 Split 和 Merge 功能，允许用户在 USDC 和 YES/NO 代币之间进行转换。

## 核心功能

### Split 操作
将 USDC 分割成等量的 YES 和 NO 代币。

**用途:**
- 当 YES + NO 代币的总价格 > 1 USDC 时进行套利
- 为交易策略提供代币流动性
- 降低持仓成本

**示例:**
- 投入 10 USDC
- 获得 10 YES + 10 NO 代币
- 如果市场价格为 YES=$0.65, NO=$0.40，总价值 $10.50
- 净利润 $0.50

### Merge 操作
将等量的 YES 和 NO 代币合并回 USDC。

**用途:**
- 当 YES + NO 代币的总价格 < 1 USDC 时进行套利
- 简化持仓结构
- 降低平仓成本

**示例:**
- 持有 10 YES + 10 NO 代币
- 如果市场价格为 YES=$0.45, NO=$0.35，总成本 $8.00
- Merge 获得 10 USDC
- 净利润 $2.00

## 技术实现

### PositionManager 类

主要方法：

```javascript
// Split 操作
await positionManager.splitPosition(conditionId, usdcAmount, confirmRealTransaction);

// Merge 操作
await positionManager.mergePositions(conditionId, tokenAmount, confirmRealTransaction);

// 创建测试数据
await positionManager.createTestSplitData(conditionId, usdcAmount);
await positionManager.createTestMergeData(conditionId, tokenAmount);

// Gas 估算
await positionManager.estimateSplitGas(conditionId, usdcAmount);
await positionManager.estimateMergeGas(conditionId, tokenAmount);
```

### 安全机制

所有真实交易操作都需要明确的确认参数：

```javascript
// 必须设置 confirmRealTransaction=true
await positionManager.splitPosition(conditionId, amount, true);
```

如果未设置确认参数，系统会抛出安全错误，防止意外执行真实交易。

## 使用方法

### 1. 编程接口

```javascript
import { PositionManager } from './src/position-manager.js';

const positionManager = new PositionManager();
await positionManager.initialize();

// 执行 Split
const result = await positionManager.splitPosition(
    "0x88973a09fa49e6429f18ed09f32db7fee26a79a3f3dd5f1e3e20c38885db53e8",
    1.5,  // 1.5 USDC
    true  // 确认真实交易
);
```

### 2. 命令行工具

```bash
# Split 操作
node tools/position-management-tool.js split <conditionId> <usdcAmount>

# Merge 操作
node tools/position-management-tool.js merge <conditionId> <tokenAmount>

# Gas 估算
node tools/position-management-tool.js estimate <conditionId> <amount>
```

### 3. NPM 脚本

```bash
# 运行测试
npm run test:position

# 运行演示
npm run demo:position
```

## 套利策略集成

### 正向套利 (Split)

当发现 YES + NO 价格 > 1 USDC 时：

1. 使用 Split 将 USDC 转换为 YES + NO 代币
2. 在市场上分别卖出 YES 和 NO 代币
3. 获得价差利润

### 反向套利 (Merge)

当发现 YES + NO 价格 < 1 USDC 时：

1. 在市场上分别买入 YES 和 NO 代币
2. 使用 Merge 将代币转换回 USDC
3. 获得价差利润

## 风险管理

### 主要风险

1. **Gas 费用**: 每次操作需要支付区块链 Gas 费用
2. **价格滑点**: 大额交易可能影响市场价格
3. **时间风险**: 操作执行期间价格可能变化
4. **流动性风险**: 市场可能缺乏足够的买家/卖家
5. **合约风险**: 智能合约执行可能失败

### 风险控制

1. **小额测试**: 先用小额资金验证策略
2. **Gas 监控**: 在 Gas 费用较低时执行操作
3. **快速执行**: 发现机会后立即执行
4. **分批操作**: 大额资金分批执行
5. **设置止损**: 设定最大可接受损失

## 最佳实践

### 操作前检查

1. 确认钱包有足够的 USDC 余额（Split）
2. 确认钱包有足够的 YES/NO 代币（Merge）
3. 确认钱包有足够的 ETH 支付 Gas 费用
4. 检查当前 Gas 价格是否合理
5. 验证套利机会是否仍然存在

### 监控指标

1. **套利利润率**: 扣除 Gas 费用后的净利润率
2. **执行时间**: 从发现机会到完成交易的时间
3. **成功率**: 交易成功执行的比例
4. **滑点影响**: 实际价格与预期价格的差异

## 故障排除

### 常见错误

1. **"ERC20: transfer amount exceeds allowance"**
   - 原因: USDC 授权额度不足
   - 解决: 增加对合约的 USDC 授权

2. **"SafeMath: subtraction overflow"**
   - 原因: 代币余额不足
   - 解决: 确保有足够的 YES/NO 代币余额

3. **Gas 估算失败**
   - 原因: 余额不足或授权问题
   - 解决: 检查余额和授权状态

### 调试方法

1. 使用测试数据创建功能验证逻辑
2. 使用 Gas 估算功能预检查操作
3. 查看区块链浏览器确认交易状态
4. 检查钱包余额和授权状态

## 技术参数

### 合约信息

- **合约地址**: `0xC9c98965297Bc527861c898329Ee280632B76e18`
- **USDC 地址**: `0x833589fcd6edb6e08f4c7c32d4f71b54bda02913` (Base 网络)
- **网络**: Base Mainnet
- **Partition**: `[1, 2]` (对应 YES 和 NO)

### 数据格式

- **USDC 精度**: 6 位小数
- **代币精度**: 6 位小数
- **最小操作金额**: 0.000001 USDC
- **Gas 限制**: 动态估算

## 更新日志

### v1.0.0
- 实现基础 Split 和 Merge 功能
- 添加安全检查机制
- 提供命令行工具
- 集成测试套件
- 添加演示程序