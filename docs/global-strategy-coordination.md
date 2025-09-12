# 全局策略协调架构

## 问题分析

当前架构存在的问题：
1. **重复运行**：每个账户独立运行策略，导致相同的全局任务（如市场发现）被重复执行
2. **资源浪费**：多个实例同时扫描相同的市场数据
3. **缺乏协调**：无法有效分配任务和共享发现的机会

## 解决方案：全局协调器 + 策略分发模式

### 架构设计

```
全局策略协调器 (Global Strategy Coordinator)
├── 市场发现服务 (Market Discovery Service)
├── 机会评估服务 (Opportunity Evaluation Service)  
├── 策略分发器 (Strategy Dispatcher)
└── 账户管理器 (Account Manager)

账户策略执行器 (Account Strategy Executor)
├── 订单执行服务 (Order Execution Service)
├── 仓位管理服务 (Position Management Service)
└── 风险控制服务 (Risk Control Service)
```

### 核心原则

1. **全局任务单例运行**：市场发现、机会评估等全局任务只运行一个实例
2. **策略结果分发**：发现的机会分发给相关的账户执行器
3. **账户独立执行**：每个账户独立执行交易和管理仓位
4. **状态共享**：全局状态在协调器中统一管理

## 实现方案

### 1. 全局策略协调器

负责全局性任务的单例执行：

```javascript
class GlobalStrategyCoordinator {
    constructor() {
        this.marketDiscovery = new MarketDiscoveryService();
        this.strategyDispatcher = new StrategyDispatcher();
        this.accountManager = new AccountManager();
        
        // 策略订阅者管理
        this.strategySubscribers = new Map(); // strategyType -> Set<accountId>
        this.runningStrategies = new Set(); // 正在运行的全局策略
    }
    
    // 注册策略订阅者
    registerStrategySubscriber(strategyType, accountId, config) {
        if (!this.strategySubscribers.has(strategyType)) {
            this.strategySubscribers.set(strategyType, new Set());
        }
        this.strategySubscribers.get(strategyType).add({
            accountId,
            config,
            lastActive: Date.now()
        });
        
        // 如果是第一个订阅者，启动全局策略
        if (this.strategySubscribers.get(strategyType).size === 1) {
            this.startGlobalStrategy(strategyType);
        }
    }
    
    // 启动全局策略
    async startGlobalStrategy(strategyType) {
        if (this.runningStrategies.has(strategyType)) {
            return;
        }
        
        console.log(`🚀 启动全局策略: ${strategyType}`);
        this.runningStrategies.add(strategyType);
        
        switch (strategyType) {
            case 'HOURLY_ARBITRAGE':
                await this.startHourlyArbitrageDiscovery();
                break;
            case 'NEW_MARKET_DISCOVERY':
                await this.startNewMarketDiscovery();
                break;
            // 其他策略类型...
        }
    }
    
    // 每小时套利发现
    async startHourlyArbitrageDiscovery() {
        const interval = setInterval(async () => {
            try {
                // 1. 发现每小时市场
                const hourlyMarkets = await this.marketDiscovery.findHourlyMarkets();
                
                // 2. 评估套利机会
                // 直接将市场数据分发给策略执行器
                // 策略执行器内部处理机会评估
                for (const subscriber of subscribers) {
                    await subscriber.processMarketsForStrategy(StrategyType.HOURLY_ARBITRAGE, hourlyMarkets);
                }
                
                // 3. 分发给订阅的账户
                if (opportunities.length > 0) {
                    await this.dispatchOpportunities('HOURLY_ARBITRAGE', opportunities);
                }
                
            } catch (error) {
                console.error('每小时套利发现失败:', error);
            }
        }, 60000); // 每分钟扫描一次
        
        // 保存定时器引用以便清理
        this.strategyTimers.set('HOURLY_ARBITRAGE', interval);
    }
    
    // 分发机会给账户
    async dispatchOpportunities(strategyType, opportunities) {
        const subscribers = this.strategySubscribers.get(strategyType);
        if (!subscribers || subscribers.size === 0) {
            return;
        }
        
        console.log(`📤 分发 ${opportunities.length} 个机会给 ${subscribers.size} 个账户`);
        
        for (const subscriber of subscribers) {
            try {
                // 发送机会给账户执行器
                await this.strategyDispatcher.dispatchToAccount(
                    subscriber.accountId,
                    strategyType,
                    opportunities,
                    subscriber.config
                );
            } catch (error) {
                console.error(`分发给账户 ${subscriber.accountId} 失败:`, error);
            }
        }
    }
}
```

### 2. 账户策略执行器

每个账户运行一个执行器，接收全局协调器分发的机会：

```javascript
class AccountStrategyExecutor {
    constructor(accountId, apiClient) {
        this.accountId = accountId;
        this.apiClient = apiClient;
        this.activeStrategies = new Map();
        this.positionManager = new PositionManager(apiClient);
        this.riskController = new RiskController(apiClient);
    }
    
    // 注册策略
    async registerStrategy(strategyType, config) {
        // 向全局协调器注册
        await GlobalCoordinator.registerStrategySubscriber(
            strategyType, 
            this.accountId, 
            config
        );
        
        // 本地记录策略配置
        this.activeStrategies.set(strategyType, {
            config,
            positions: new Map(),
            stats: { opportunitiesReceived: 0, tradesExecuted: 0 }
        });
    }
    
    // 接收分发的机会
    async receiveOpportunities(strategyType, opportunities) {
        const strategy = this.activeStrategies.get(strategyType);
        if (!strategy) {
            return;
        }
        
        strategy.stats.opportunitiesReceived += opportunities.length;
        
        for (const { market, opportunity } of opportunities) {
            try {
                // 风险检查
                const riskCheck = await this.riskController.checkOpportunity(
                    market, 
                    opportunity, 
                    strategy.config
                );
                
                if (!riskCheck.approved) {
                    console.log(`🚫 风险检查未通过: ${riskCheck.reason}`);
                    continue;
                }
                
                // 执行交易
                const success = await this.executeOpportunity(
                    strategyType, 
                    market, 
                    opportunity
                );
                
                if (success) {
                    strategy.stats.tradesExecuted++;
                }
                
            } catch (error) {
                console.error(`执行机会失败:`, error);
            }
        }
    }
    
    // 执行具体机会
    async executeOpportunity(strategyType, market, opportunity) {
        const positionId = `${strategyType}_${market.id}_${Date.now()}`;
        
        try {
            // 创建订单
            const orderData = await this.createOrder(market, opportunity);
            
            // 记录仓位
            const strategy = this.activeStrategies.get(strategyType);
            strategy.positions.set(positionId, {
                market,
                opportunity,
                orderData,
                openTime: Date.now(),
                status: 'open'
            });
            
            console.log(`✅ 账户 ${this.accountId} 执行交易: ${positionId}`);
            return true;
            
        } catch (error) {
            console.error(`交易执行失败 ${positionId}:`, error);
            return false;
        }
    }
}
```

### 3. 策略分发器

负责将机会分发给合适的账户：

```javascript
class StrategyDispatcher {
    constructor() {
        this.accountExecutors = new Map(); // accountId -> AccountStrategyExecutor
    }
    
    // 注册账户执行器
    registerAccountExecutor(accountId, executor) {
        this.accountExecutors.set(accountId, executor);
    }
    
    // 分发机会到指定账户
    async dispatchToAccount(accountId, strategyType, opportunities, config) {
        const executor = this.accountExecutors.get(accountId);
        if (!executor) {
            console.warn(`账户执行器未找到: ${accountId}`);
            return;
        }
        
        // 根据配置过滤机会
        const filteredOpportunities = this.filterOpportunitiesForAccount(
            opportunities, 
            config
        );
        
        if (filteredOpportunities.length > 0) {
            await executor.receiveOpportunities(strategyType, filteredOpportunities);
        }
    }
    
    // 为账户过滤机会
    filterOpportunitiesForAccount(opportunities, config) {
        return opportunities.filter(({ market, opportunity }) => {
            // 根据账户配置过滤
            if (config.minExpectedReturn && opportunity.expectedReturn < config.minExpectedReturn) {
                return false;
            }
            
            if (config.maxRiskLevel && opportunity.riskLevel > config.maxRiskLevel) {
                return false;
            }
            
            // 其他过滤条件...
            return true;
        });
    }
}
```

## 使用示例

### 启动全局协调器

```javascript
// 启动全局协调器（整个系统只运行一个）
const globalCoordinator = new GlobalStrategyCoordinator();
await globalCoordinator.start();

// 启动策略分发器
const dispatcher = new StrategyDispatcher();
globalCoordinator.setDispatcher(dispatcher);
```

### 注册账户策略

```javascript
// 为每个账户创建执行器
const account1Executor = new AccountStrategyExecutor('account1', apiClient1);
const account2Executor = new AccountStrategyExecutor('account2', apiClient2);

// 注册到分发器
dispatcher.registerAccountExecutor('account1', account1Executor);
dispatcher.registerAccountExecutor('account2', account2Executor);

// 账户注册策略（会自动向全局协调器注册）
await account1Executor.registerStrategy('HOURLY_ARBITRAGE', {
    arbitrageAmount: 10,
    minExpectedReturn: 0.5,
    maxRiskLevel: 3
});

await account2Executor.registerStrategy('HOURLY_ARBITRAGE', {
    arbitrageAmount: 20,
    minExpectedReturn: 1.0,
    maxRiskLevel: 2
});
```

## 优势

1. **避免重复运行**：全局任务只运行一个实例
2. **资源高效**：共享市场发现和机会评估结果
3. **灵活配置**：每个账户可以有不同的策略配置
4. **易于扩展**：新增策略类型只需在协调器中添加
5. **故障隔离**：单个账户的问题不影响全局发现

## 迁移计划

1. **第一阶段**：实现全局协调器和基础分发机制
2. **第二阶段**：迁移现有的每小时套利策略
3. **第三阶段**：添加其他策略类型的支持
4. **第四阶段**：优化性能和添加监控