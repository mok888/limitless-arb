/**
 * 策略分发器
 * 负责将发现的机会分发给合适的账户执行器
 */

import EventEmitter from 'events';

export class StrategyDispatcher extends EventEmitter {
    constructor() {
        super();
        
        // 账户执行器注册表 accountId -> AccountStrategyExecutor
        this.accountExecutors = new Map();
        
        // 分发统计
        this.dispatchStats = {
            totalDispatched: 0,
            successfulDispatches: 0,
            failedDispatches: 0,
            accountStats: new Map() // accountId -> stats
        };
    }
    
    /**
     * 注册账户执行器
     */
    registerAccountExecutor(accountId, executor) {
        console.log(`📝 注册账户执行器: ${accountId}`);
        
        this.accountExecutors.set(accountId, executor);
        
        // 初始化账户统计
        if (!this.dispatchStats.accountStats.has(accountId)) {
            this.dispatchStats.accountStats.set(accountId, {
                totalReceived: 0,
                totalFiltered: 0,
                totalExecuted: 0,
                lastDispatchTime: null
            });
        }
        
        this.emit('executorRegistered', { accountId });
    }
    
    /**
     * 取消注册账户执行器
     */
    unregisterAccountExecutor(accountId) {
        console.log(`📝 取消注册账户执行器: ${accountId}`);
        
        this.accountExecutors.delete(accountId);
        this.emit('executorUnregistered', { accountId });
    }
    
    /**
     * 分发机会到指定账户
     */
    async dispatchToAccount(accountId, strategyType, opportunities, config) {
        const executor = this.accountExecutors.get(accountId);
        if (!executor) {
            console.warn(`⚠️ 账户执行器未找到: ${accountId}`);
            this.dispatchStats.failedDispatches++;
            return 0;
        }
        
        try {
            // 根据账户配置过滤机会
            const filteredOpportunities = this.filterOpportunitiesForAccount(
                opportunities, 
                config,
                strategyType
            );
            
            const accountStats = this.dispatchStats.accountStats.get(accountId);
            accountStats.totalReceived += opportunities.length;
            accountStats.totalFiltered += filteredOpportunities.length;
            accountStats.lastDispatchTime = Date.now();
            
            if (filteredOpportunities.length === 0) {
                console.log(`📊 账户 ${accountId} 无符合条件的机会`);
                return 0;
            }
            
            console.log(`📤 向账户 ${accountId} 分发 ${filteredOpportunities.length}/${opportunities.length} 个机会`);
            
            // 发送给账户执行器
            await executor.receiveOpportunities(strategyType, filteredOpportunities);
            
            // 更新统计
            this.dispatchStats.totalDispatched += filteredOpportunities.length;
            this.dispatchStats.successfulDispatches++;
            
            this.emit('opportunitiesDispatched', {
                accountId,
                strategyType,
                totalOpportunities: opportunities.length,
                filteredOpportunities: filteredOpportunities.length,
                timestamp: Date.now()
            });
            
            return filteredOpportunities.length;
            
        } catch (error) {
            console.error(`❌ 分发给账户 ${accountId} 失败:`, error);
            this.dispatchStats.failedDispatches++;
            
            this.emit('dispatchError', {
                accountId,
                strategyType,
                error,
                timestamp: Date.now()
            });
            
            return 0;
        }
    }
    
    /**
     * 为账户过滤机会
     */
    filterOpportunitiesForAccount(opportunities, config, strategyType) {
        return opportunities.filter(({ market, opportunity }) => {
            try {
                // 基础过滤条件
                if (!this.passesBasicFilters(market, opportunity, config)) {
                    return false;
                }
                
                // 策略特定过滤
                switch (strategyType) {
                    case 'HOURLY_ARBITRAGE':
                        return this.passesHourlyArbitrageFilters(market, opportunity, config);
                        
                    case 'NEW_MARKET_DISCOVERY':
                        return this.passesNewMarketFilters(market, opportunity, config);
                        
                    default:
                        return true;
                }
                
            } catch (error) {
                console.error(`❌ 过滤机会时出错:`, error);
                return false;
            }
        });
    }
    
    /**
     * 基础过滤条件
     */
    passesBasicFilters(market, opportunity, config) {
        // 最小预期收益检查
        if (config.minExpectedReturn && opportunity.expectedReturn < config.minExpectedReturn) {
            return false;
        }
        
        // 最大风险等级检查
        if (config.maxRiskLevel && opportunity.riskLevel > config.maxRiskLevel) {
            return false;
        }
        
        // 最小投资金额检查
        if (config.minInvestmentAmount && opportunity.amount < config.minInvestmentAmount) {
            return false;
        }
        
        // 最大投资金额检查
        if (config.maxInvestmentAmount && opportunity.amount > config.maxInvestmentAmount) {
            return false;
        }
        
        // 市场类别过滤
        if (config.allowedCategories && config.allowedCategories.length > 0) {
            const marketCategory = market.category || 'unknown';
            if (!config.allowedCategories.includes(marketCategory)) {
                return false;
            }
        }
        
        // 排除的市场类别
        if (config.excludedCategories && config.excludedCategories.length > 0) {
            const marketCategory = market.category || 'unknown';
            if (config.excludedCategories.includes(marketCategory)) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 每小时套利特定过滤
     */
    passesHourlyArbitrageFilters(market, opportunity, config) {
        // 价格区间检查
        if (config.minPriceThreshold && opportunity.price < config.minPriceThreshold) {
            return false;
        }
        
        if (config.maxPriceThreshold && opportunity.price > config.maxPriceThreshold) {
            return false;
        }
        
        // 结算时间检查
        if (config.minTimeToSettlement) {
            const now = Date.now();
            const endTime = new Date(market.endDate).getTime();
            const timeToSettlement = endTime - now;
            
            if (timeToSettlement < config.minTimeToSettlement) {
                return false;
            }
        }
        
        // 最大结算时间检查
        if (config.maxTimeToSettlement) {
            const now = Date.now();
            const endTime = new Date(market.endDate).getTime();
            const timeToSettlement = endTime - now;
            
            if (timeToSettlement > config.maxTimeToSettlement) {
                return false;
            }
        }
        
        return true;
    }
    
    /**
     * 新市场特定过滤
     */
    passesNewMarketFilters(market, opportunity, config) {
        // 市场年龄检查（新市场应该很新）
        if (config.maxMarketAge) {
            const now = Date.now();
            const createdTime = new Date(market.createdDate || market.startDate).getTime();
            const marketAge = now - createdTime;
            
            if (marketAge > config.maxMarketAge) {
                return false;
            }
        }
        
        // 最小流动性检查
        if (config.minLiquidity && market.liquidity < config.minLiquidity) {
            return false;
        }
        
        // 最小交易量检查
        if (config.minVolume && market.volume < config.minVolume) {
            return false;
        }
        
        return true;
    }
    
    /**
     * 批量分发机会
     */
    async batchDispatch(strategyType, opportunities) {
        const results = [];
        
        for (const [accountId, executor] of this.accountExecutors.entries()) {
            try {
                // 获取账户的策略配置
                const config = await executor.getStrategyConfig(strategyType);
                if (!config) {
                    continue; // 账户未订阅此策略
                }
                
                const dispatched = await this.dispatchToAccount(
                    accountId,
                    strategyType,
                    opportunities,
                    config
                );
                
                results.push({
                    accountId,
                    dispatched,
                    success: true
                });
                
            } catch (error) {
                console.error(`❌ 批量分发给账户 ${accountId} 失败:`, error);
                results.push({
                    accountId,
                    dispatched: 0,
                    success: false,
                    error: error.message
                });
            }
        }
        
        return results;
    }
    
    /**
     * 获取分发统计
     */
    getDispatchStats() {
        const accountStatsArray = Array.from(this.dispatchStats.accountStats.entries())
            .map(([accountId, stats]) => ({
                accountId,
                ...stats
            }));
        
        return {
            ...this.dispatchStats,
            accountStats: accountStatsArray,
            registeredExecutors: this.accountExecutors.size
        };
    }
    
    /**
     * 获取分发器状态
     */
    getStatus() {
        return {
            registeredExecutors: Array.from(this.accountExecutors.keys()),
            dispatchStats: this.getDispatchStats(),
            isActive: this.accountExecutors.size > 0
        };
    }
    
    /**
     * 重置统计信息
     */
    resetStats() {
        this.dispatchStats = {
            totalDispatched: 0,
            successfulDispatches: 0,
            failedDispatches: 0,
            accountStats: new Map()
        };
        
        // 重新初始化已注册账户的统计
        for (const accountId of this.accountExecutors.keys()) {
            this.dispatchStats.accountStats.set(accountId, {
                totalReceived: 0,
                totalFiltered: 0,
                totalExecuted: 0,
                lastDispatchTime: null
            });
        }
        
        this.emit('statsReset');
    }
    
    /**
     * 检查账户执行器健康状态
     */
    async checkExecutorHealth() {
        const healthResults = [];
        
        for (const [accountId, executor] of this.accountExecutors.entries()) {
            try {
                const isHealthy = await executor.healthCheck();
                healthResults.push({
                    accountId,
                    isHealthy,
                    lastCheck: Date.now()
                });
            } catch (error) {
                console.error(`❌ 账户 ${accountId} 健康检查失败:`, error);
                healthResults.push({
                    accountId,
                    isHealthy: false,
                    error: error.message,
                    lastCheck: Date.now()
                });
            }
        }
        
        return healthResults;
    }
}

export default StrategyDispatcher;