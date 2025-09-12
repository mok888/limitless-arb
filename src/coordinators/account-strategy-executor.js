/**
 * 账户策略执行器
 * 每个账户运行一个执行器，接收全局协调器分发的机会并执行交易
 */

import EventEmitter from 'events';
import { StrategyType } from '../strategies/strategy-types.js';

export class AccountStrategyExecutor extends EventEmitter {
    constructor(accountId, apiClient, globalCoordinator) {
        super();
        
        this.accountId = accountId;
        this.apiClient = apiClient;
        this.globalCoordinator = globalCoordinator;
        
        // 活跃策略配置 strategyType -> config
        this.activeStrategies = new Map();
        
        // 仓位管理 strategyType -> Map<positionId, position>
        this.positions = new Map();
        
        // 风险控制器
        this.riskController = null;
        
        // 执行统计
        this.executionStats = {
            totalOpportunitiesReceived: 0,
            totalOpportunitiesExecuted: 0,
            totalPositionsOpened: 0,
            totalPositionsClosed: 0,
            totalProfit: 0,
            strategyStats: new Map() // strategyType -> stats
        };
        
        this.isRunning = false;
    }
    
    /**
     * 设置风险控制器
     */
    setRiskController(riskController) {
        this.riskController = riskController;
    }
    
    /**
     * 启动执行器
     */
    async start() {
        if (this.isRunning) {
            console.log(`⚠️ 账户执行器已在运行: ${this.accountId}`);
            return;
        }
        
        console.log(`🚀 启动账户执行器: ${this.accountId}`);
        
        // 验证API客户端
        try {
            // 初始化钱包以验证API客户端
            await this.apiClient.initializeWallet();
            if (!this.apiClient.walletAddress) {
                throw new Error('钱包地址未初始化');
            }
        } catch (error) {
            throw new Error(`账户 ${this.accountId} API客户端验证失败: ${error.message}`);
        }
        
        this.isRunning = true;
        
        // 启动仓位监控
        this.startPositionMonitoring();
        
        console.log(`✅ 账户执行器启动完成: ${this.accountId}`);
        this.emit('started');
    }
    
    /**
     * 停止执行器
     */
    async stop() {
        if (!this.isRunning) {
            return;
        }
        
        console.log(`🛑 停止账户执行器: ${this.accountId}`);
        
        // 取消注册所有策略
        for (const strategyType of this.activeStrategies.keys()) {
            await this.unregisterStrategy(strategyType);
        }
        
        // 停止仓位监控
        if (this.positionMonitorTimer) {
            clearInterval(this.positionMonitorTimer);
            this.positionMonitorTimer = null;
        }
        
        this.isRunning = false;
        
        console.log(`✅ 账户执行器已停止: ${this.accountId}`);
        this.emit('stopped');
    }
    
    /**
     * 注册策略
     */
    async registerStrategy(strategyType, config) {
        console.log(`📝 账户 ${this.accountId} 注册策略: ${strategyType}`);
        
        // 验证策略类型
        if (!Object.values(StrategyType).includes(strategyType)) {
            throw new Error(`不支持的策略类型: ${strategyType}`);
        }
        
        // 保存策略配置
        this.activeStrategies.set(strategyType, {
            ...config,
            registeredAt: Date.now(),
            lastActive: Date.now()
        });
        
        // 初始化策略仓位管理
        if (!this.positions.has(strategyType)) {
            this.positions.set(strategyType, new Map());
        }
        
        // 初始化策略统计
        if (!this.executionStats.strategyStats.has(strategyType)) {
            this.executionStats.strategyStats.set(strategyType, {
                opportunitiesReceived: 0,
                opportunitiesExecuted: 0,
                positionsOpened: 0,
                positionsClosed: 0,
                totalProfit: 0,
                successRate: 0
            });
        }
        
        // 向全局协调器注册
        await this.globalCoordinator.registerStrategySubscriber(
            strategyType,
            this, // 传递策略执行器实例而不是 accountId
            config
        );
        
        this.emit('strategyRegistered', { strategyType, config });
    }
    
    /**
     * 取消注册策略
     */
    async unregisterStrategy(strategyType) {
        console.log(`📝 账户 ${this.accountId} 取消注册策略: ${strategyType}`);
        
        if (!this.activeStrategies.has(strategyType)) {
            return;
        }
        
        // 从全局协调器取消注册
        await this.globalCoordinator.unregisterStrategySubscriber(
            strategyType,
            this.accountId
        );
        
        // 清理本地状态
        this.activeStrategies.delete(strategyType);
        
        // 关闭该策略的所有仓位
        const strategyPositions = this.positions.get(strategyType);
        if (strategyPositions) {
            for (const [positionId, position] of strategyPositions.entries()) {
                if (position.status === 'open') {
                    await this.closePosition(strategyType, positionId, '策略取消注册');
                }
            }
        }
        
        this.emit('strategyUnregistered', { strategyType });
    }
    
    /**
     * 接收分发的机会
     */
    async receiveOpportunities(strategyType, opportunities) {
        if (!this.activeStrategies.has(strategyType)) {
            console.warn(`⚠️ 账户 ${this.accountId} 未注册策略: ${strategyType}`);
            return;
        }
        
        const strategy = this.activeStrategies.get(strategyType);
        const strategyStats = this.executionStats.strategyStats.get(strategyType);
        
        console.log(`📥 账户 ${this.accountId} 收到 ${opportunities.length} 个 ${strategyType} 机会`);
        
        // 更新统计
        this.executionStats.totalOpportunitiesReceived += opportunities.length;
        strategyStats.opportunitiesReceived += opportunities.length;
        strategy.lastActive = Date.now();
        
        let executedCount = 0;
        
        for (const { market, opportunity } of opportunities) {
            try {
                // 风险检查
                if (this.riskController) {
                    const riskCheck = await this.riskController.checkOpportunity(
                        market,
                        opportunity,
                        strategy,
                        this.accountId
                    );
                    
                    if (!riskCheck.approved) {
                        console.log(`🚫 风险检查未通过: ${riskCheck.reason}`);
                        continue;
                    }
                }
                
                // 执行机会
                const success = await this.executeOpportunity(
                    strategyType,
                    market,
                    opportunity
                );
                
                if (success) {
                    executedCount++;
                    this.executionStats.totalOpportunitiesExecuted++;
                    strategyStats.opportunitiesExecuted++;
                }
                
            } catch (error) {
                console.error(`❌ 执行机会失败:`, error);
                this.emit('executionError', {
                    strategyType,
                    market,
                    opportunity,
                    error,
                    timestamp: Date.now()
                });
            }
        }
        
        console.log(`✅ 账户 ${this.accountId} 执行了 ${executedCount}/${opportunities.length} 个机会`);
        
        this.emit('opportunitiesProcessed', {
            strategyType,
            totalReceived: opportunities.length,
            totalExecuted: executedCount,
            timestamp: Date.now()
        });
    }
    
    /**
     * 处理策略的市场数据（新架构）
     * 让策略内部处理市场筛选和机会评估
     */
    async processMarketsForStrategy(strategyType, allMarkets) {
        if (!this.activeStrategies.has(strategyType)) {
            console.warn(`⚠️ 账户 ${this.accountId} 未注册策略: ${strategyType}`);
            return { opportunitiesFound: 0 };
        }
        
        const strategy = this.activeStrategies.get(strategyType);
        const strategyStats = this.executionStats.strategyStats.get(strategyType);
        
        console.log(`🔍 账户 ${this.accountId} 处理 ${allMarkets.length} 个市场数据 (策略: ${strategyType})`);
        
        try {
            // 根据策略类型，让策略实例自己处理市场筛选和机会评估
            let opportunities = [];
            
            switch (strategyType) {
                case StrategyType.NEW_MARKET:
                    opportunities = await this.processNewMarketStrategy(allMarkets, strategy);
                    break;
                case StrategyType.HOURLY_ARBITRAGE:
                    opportunities = await this.processHourlyArbitrageStrategy(allMarkets, strategy);
                    break;
                case StrategyType.LP_MAKING:
                    opportunities = await this.processLPMakingStrategy(allMarkets, strategy);
                    break;
                default:
                    console.warn(`⚠️ 未知的策略类型: ${strategyType}`);
                    return { opportunitiesFound: 0 };
            }
            
            if (opportunities.length === 0) {
                console.log(`📊 账户 ${this.accountId} 策略 ${strategyType} 未发现机会`);
                return { opportunitiesFound: 0 };
            }
            
            console.log(`🎯 账户 ${this.accountId} 策略 ${strategyType} 发现 ${opportunities.length} 个机会`);
            
            // 执行发现的机会
            let executedCount = 0;
            
            for (const { market, opportunity } of opportunities) {
                try {
                    // 风险检查
                    if (this.riskController) {
                        const riskCheck = await this.riskController.checkOpportunity(
                            market,
                            opportunity,
                            strategy,
                            this.accountId
                        );
                        
                        if (!riskCheck.approved) {
                            console.log(`🚫 风险检查未通过: ${riskCheck.reason}`);
                            continue;
                        }
                    }
                    
                    // 执行机会
                    const success = await this.executeOpportunity(
                        strategyType,
                        market,
                        opportunity
                    );
                    
                    if (success) {
                        executedCount++;
                        this.executionStats.totalOpportunitiesExecuted++;
                        strategyStats.opportunitiesExecuted++;
                    }
                    
                } catch (error) {
                    console.error(`❌ 执行机会失败:`, error);
                    this.emit('executionError', {
                        strategyType,
                        market,
                        opportunity,
                        error,
                        timestamp: Date.now()
                    });
                }
            }
            
            // 更新统计
            this.executionStats.totalOpportunitiesReceived += opportunities.length;
            strategyStats.opportunitiesReceived += opportunities.length;
            strategy.lastActive = Date.now();
            
            console.log(`✅ 账户 ${this.accountId} 策略 ${strategyType} 执行了 ${executedCount}/${opportunities.length} 个机会`);
            
            return {
                opportunitiesFound: opportunities.length,
                opportunitiesExecuted: executedCount
            };
            
        } catch (error) {
            console.error(`❌ 账户 ${this.accountId} 处理策略 ${strategyType} 失败:`, error.message);
            return { opportunitiesFound: 0 };
        }
    }
    
    /**
     * 处理新市场策略
     */
    async processNewMarketStrategy(allMarkets, strategy) {
        const opportunities = [];
        
        // 筛选新市场
        const newMarkets = allMarkets.filter(market => {
            // 检查市场状态
            if (market.expired) return false;
            
            // 新市场策略需要有rewards的市场
            if (!market.isRewardable) return false;
            
            // 检查市场年龄（1小时内创建的市场）
            const createdTime = new Date(market.createdDate || market.startDate).getTime();
            const marketAge = Date.now() - createdTime;
            
            return marketAge <= 60 * 60 * 1000; // 1小时
        });
        
        // 评估每个新市场
        for (const market of newMarkets) {
            try {
                const opportunity = this.evaluateNewMarketOpportunity(market, strategy);
                if (opportunity) {
                    opportunities.push({ market, opportunity });
                }
            } catch (error) {
                // 跳过评估失败的市场
                continue;
            }
        }
        
        return opportunities;
    }
    
    /**
     * 处理每小时套利策略
     */
    async processHourlyArbitrageStrategy(allMarkets, strategy) {
        const opportunities = [];
        
        // 筛选每小时市场
        const hourlyMarkets = allMarkets.filter(market => {
            // 基础筛选
            if (market.expired) return false;
            
            const timeToExpiry = new Date(market.endDate) - new Date();
            return timeToExpiry > 0;
        });
        
        // 评估每个市场
        for (const market of hourlyMarkets) {
            try {
                const opportunity = this.evaluateHourlyArbitrageOpportunity(market, strategy);
                if (opportunity) {
                    opportunities.push({ market, opportunity });
                }
            } catch (error) {
                // 跳过评估失败的市场
                continue;
            }
        }
        
        return opportunities;
    }
    
    /**
     * 处理LP做市策略
     */
    async processLPMakingStrategy(allMarkets, strategy) {
        const opportunities = [];
        
        // 筛选有奖励的市场
        const rewardableMarkets = allMarkets.filter(market => {
            if (market.expired) return false;
            if (!market.isRewardable) return false;
            
            // 检查结束时间（至少还有1小时）
            const timeToEnd = new Date(market.endDate).getTime() - Date.now();
            return timeToEnd >= 60 * 60 * 1000;
        });
        
        // 评估每个市场
        for (const market of rewardableMarkets) {
            try {
                const opportunity = this.evaluateLPMakingOpportunity(market, strategy);
                if (opportunity) {
                    opportunities.push({ market, opportunity });
                }
            } catch (error) {
                // 跳过评估失败的市场
                continue;
            }
        }
        
        return opportunities;
    }
    
    /**
     * 评估新市场机会
     */
    evaluateNewMarketOpportunity(market, strategy) {
        // 检查到期时间
        const timeToExpiry = new Date(market.endDate) - new Date();
        if (timeToExpiry < 24 * 60 * 60 * 1000) { // 至少24小时
            return null;
        }
        
        // 简化的评估逻辑
        const midPrice = 0.5; // 新市场通常接近50%
        const marketScore = 70; // 新市场基础分较高
        
        if (marketScore < strategy.minMarketScore) {
            return null;
        }
        
        return {
            side: 'split',
            price: midPrice,
            amount: strategy.splitAmount || 100,
            marketScore: marketScore,
            expectedReward: { dailyReward: 2 }
        };
    }
    
    /**
     * 评估每小时套利机会
     */
    evaluateHourlyArbitrageOpportunity(market, strategy) {
        // 检查是否为 hourly 市场
        const hasHourlyTag = market.tags && 
            market.tags.some(tag => tag.toLowerCase().includes('hourly'));
        const endTime = new Date(market.endDate);
        const isHourlyPattern = endTime.getMinutes() === 0;
        
        if (!hasHourlyTag && !isHourlyPattern) {
            return null;
        }
        
        // 检查时间范围
        const timeToExpiry = new Date(market.endDate) - new Date();
        const minTime = strategy.minTimeToSettlement || 5 * 60 * 1000;
        const maxTime = strategy.settlementBuffer || 60 * 60 * 1000;
        
        if (timeToExpiry < minTime || timeToExpiry > maxTime) {
            return null;
        }
        
        // 简化的价格检查
        const midPrice = 0.6; // 假设价格
        const minPrice = strategy.minPriceThreshold || 0.4;
        const maxPrice = strategy.maxPriceThreshold || 0.95;
        
        if (midPrice < minPrice || midPrice > maxPrice) {
            return null;
        }
        
        return {
            side: 'buy',
            price: midPrice,
            amount: strategy.arbitrageAmount || 10,
            expectedReturn: 2.5
        };
    }
    
    /**
     * 评估LP做市机会
     */
    evaluateLPMakingOpportunity(market, strategy) {
        // 检查价格范围（LP策略偏好中等价格）
        const midPrice = 0.5; // 假设价格
        
        if (midPrice < 0.2 || midPrice > 0.8) {
            return null;
        }
        
        // 计算市场评分
        const marketScore = 75; // LP市场基础分
        
        if (marketScore < (strategy.minMarketScore || 60)) {
            return null;
        }
        
        return {
            side: midPrice > 0.5 ? 'sell' : 'buy',
            price: midPrice,
            amount: strategy.initialPurchase || 50,
            marketScore: marketScore,
            expectedReward: { dailyReward: 1.5 }
        };
    }
    
    /**
     * 执行具体机会
     */
    async executeOpportunity(strategyType, market, opportunity) {
        const positionId = `${strategyType}_${market.id}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        try {
            console.log(`💰 账户 ${this.accountId} 执行交易: ${positionId}`);
            
            // 创建订单数据
            const orderData = await this.createOrderData(market, opportunity);

            // 记录仓位
            const position = {
                positionId,
                market,
                opportunity,
                orderData,
                openTime: Date.now(),
                status: 'open',
                investment: opportunity.amount || opportunity.arbitrageAmount,
                expectedReturn: opportunity.expectedReturn,
                actualReturn: null,
                closeTime: null,
                closeReason: null
            };
            
            // 保存到策略仓位中
            const strategyPositions = this.positions.get(strategyType);
            strategyPositions.set(positionId, position);
            
            // 更新统计
            this.executionStats.totalPositionsOpened++;
            const strategyStats = this.executionStats.strategyStats.get(strategyType);
            strategyStats.positionsOpened++;
            
            console.log(`✅ 账户 ${this.accountId} 交易完成: ${positionId}`);
            console.log(`   市场: ${market.title.substring(0, 50)}...`);
            console.log(`   方向: ${opportunity.side.toUpperCase()}`);
            console.log(`   投资: ${position.investment} USDC`);
            console.log(`   预期收益: ${opportunity.expectedReturn.toFixed(2)} USDC`);
            
            // 发出交易完成事件
            this.emit('tradeExecuted', {
                accountId: this.accountId,
                strategyType,
                positionId,
                market,
                opportunity,
                orderData,
                timestamp: Date.now()
            });
            
            return true;
            
        } catch (error) {
            console.error(`❌ 账户 ${this.accountId} 交易失败 ${positionId}:`, error);
            
            this.emit('tradeFailed', {
                accountId: this.accountId,
                strategyType,
                positionId,
                market,
                opportunity,
                error,
                timestamp: Date.now()
            });
            
            return false;
        }
    }
    
    /**
     * 创建订单数据
     */
    async createOrderData(market, opportunity) {
        // 确保钱包已初始化
        if (!this.apiClient.walletAddress) {
            await this.apiClient.initializeWallet();
        }
        
        // 确保已认证以获取用户ID
        if (!this.apiClient.userId) {
            await this.apiClient.ensureAuthenticated();
        }
        
        return {
            marketId: market.id,
            side: opportunity.side,
            price: opportunity.price,
            amount: opportunity.amount || opportunity.arbitrageAmount,
            walletAddress: this.apiClient.walletAddress,
            userId: this.apiClient.userId,
            timestamp: Date.now()
        };
    }
    
    /**
     * 启动仓位监控
     */
    startPositionMonitoring() {
        console.log(`🔍 启动账户 ${this.accountId} 仓位监控...`);
        
        this.positionMonitorTimer = setInterval(async () => {
            try {
                await this.checkPositions();
            } catch (error) {
                console.error(`❌ 账户 ${this.accountId} 仓位检查失败:`, error);
            }
        }, 30000); // 每30秒检查一次
    }
    
    /**
     * 检查仓位状态
     */
    async checkPositions() {
        let totalChecked = 0;
        let totalSettled = 0;
        
        for (const [strategyType, strategyPositions] of this.positions.entries()) {
            for (const [positionId, position] of strategyPositions.entries()) {
                if (position.status !== 'open') {
                    continue;
                }
                
                totalChecked++;
                
                try {
                    // 检查是否需要结算
                    const shouldSettle = await this.shouldSettlePosition(position);
                    
                    if (shouldSettle) {
                        const settlementResult = await this.simulateSettlement(position);
                        await this.settlePosition(strategyType, positionId, position, settlementResult);
                        totalSettled++;
                    }
                    
                } catch (error) {
                    console.error(`❌ 检查仓位失败 ${positionId}:`, error);
                }
            }
        }
        
        if (totalChecked > 0) {
            console.log(`🔍 账户 ${this.accountId} 检查了 ${totalChecked} 个仓位，结算了 ${totalSettled} 个`);
        }
    }
    
    /**
     * 判断是否应该结算仓位
     */
    async shouldSettlePosition(position) {
        const now = Date.now();
        const market = position.market;
        
        // 检查市场是否已结束
        const endTime = new Date(market.endDate).getTime();
        return now >= endTime + 60000; // 结束后1分钟
    }
    
    /**
     * 模拟结算结果
     */
    async simulateSettlement(position) {
        // 模拟结算结果（实际应用中需要查询真实结算结果）
        const isWin = Math.random() > 0.4; // 60%胜率
        const actualReturn = isWin ? position.expectedReturn : -position.investment;
        
        return {
            isSettled: true,
            isWin: isWin,
            actualReturn: actualReturn,
            settlementTime: Date.now()
        };
    }
    
    /**
     * 结算仓位
     */
    async settlePosition(strategyType, positionId, position, settlementResult) {
        try {
            console.log(`📊 账户 ${this.accountId} 结算仓位: ${positionId}`);
            console.log(`   结果: ${settlementResult.isWin ? '✅ 获胜' : '❌ 失败'}`);
            console.log(`   收益: ${settlementResult.actualReturn.toFixed(2)} USDC`);
            
            // 更新仓位状态
            position.status = 'closed';
            position.actualReturn = settlementResult.actualReturn;
            position.closeTime = settlementResult.settlementTime;
            position.closeReason = 'settlement';
            
            // 更新统计
            this.executionStats.totalPositionsClosed++;
            this.executionStats.totalProfit += settlementResult.actualReturn;
            
            const strategyStats = this.executionStats.strategyStats.get(strategyType);
            strategyStats.positionsClosed++;
            strategyStats.totalProfit += settlementResult.actualReturn;
            
            // 计算成功率
            if (strategyStats.positionsClosed > 0) {
                const winCount = Array.from(this.positions.get(strategyType).values())
                    .filter(p => p.status === 'closed' && p.actualReturn > 0).length;
                strategyStats.successRate = (winCount / strategyStats.positionsClosed) * 100;
            }
            
            // 发出结算事件
            this.emit('positionSettled', {
                accountId: this.accountId,
                strategyType,
                positionId,
                position,
                settlementResult,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error(`❌ 结算仓位失败 ${positionId}:`, error);
        }
    }
    
    /**
     * 关闭仓位
     */
    async closePosition(strategyType, positionId, reason) {
        const strategyPositions = this.positions.get(strategyType);
        const position = strategyPositions.get(positionId);
        
        if (!position || position.status !== 'open') {
            return;
        }
        
        console.log(`🔒 账户 ${this.accountId} 关闭仓位: ${positionId} (${reason})`);
        
        position.status = 'closed';
        position.closeTime = Date.now();
        position.closeReason = reason;
        position.actualReturn = 0; // 手动关闭通常没有收益
        
        this.executionStats.totalPositionsClosed++;
        const strategyStats = this.executionStats.strategyStats.get(strategyType);
        strategyStats.positionsClosed++;
        
        this.emit('positionClosed', {
            accountId: this.accountId,
            strategyType,
            positionId,
            position,
            reason,
            timestamp: Date.now()
        });
    }
    
    /**
     * 获取策略配置
     */
    getStrategyConfig(strategyType) {
        return this.activeStrategies.get(strategyType) || null;
    }
    
    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            // 检查API连接
            await this.apiClient.getWalletAddress();
            
            // 检查是否有活跃策略
            const hasActiveStrategies = this.activeStrategies.size > 0;
            
            // 检查最近是否有活动
            const now = Date.now();
            const recentActivity = Array.from(this.activeStrategies.values())
                .some(strategy => (now - strategy.lastActive) < 300000); // 5分钟内有活动
            
            return hasActiveStrategies && recentActivity;
            
        } catch (error) {
            console.error(`❌ 账户 ${this.accountId} 健康检查失败:`, error);
            return false;
        }
    }
    
    /**
     * 获取执行器状态
     */
    getStatus() {
        const strategyDetails = {};
        for (const [strategyType, config] of this.activeStrategies.entries()) {
            const positions = this.positions.get(strategyType);
            const stats = this.executionStats.strategyStats.get(strategyType);
            
            strategyDetails[strategyType] = {
                config,
                stats,
                activePositions: Array.from(positions.values())
                    .filter(p => p.status === 'open').length,
                totalPositions: positions.size
            };
        }
        
        return {
            accountId: this.accountId,
            isRunning: this.isRunning,
            activeStrategies: Array.from(this.activeStrategies.keys()),
            executionStats: { ...this.executionStats },
            strategyDetails,
            totalActivePositions: Array.from(this.positions.values())
                .reduce((total, positions) => 
                    total + Array.from(positions.values())
                        .filter(p => p.status === 'open').length, 0)
        };
    }
}

export default AccountStrategyExecutor;