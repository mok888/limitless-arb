/**
 * 新市场策略
 * 发现新市场时执行split操作，将资金分配到YES和NO两边
 */

import { BaseStrategy, StrategyState } from './base-strategy.js';
import { StrategyType } from './strategy-types.js';
import { PositionManager } from '../managers/position-manager.js';

export class NewMarketStrategy extends BaseStrategy {
    constructor(apiClient, config = {}) {
        super('新市场策略', apiClient, config);
        
        this.strategyType = StrategyType.NEW_MARKET;
        this.positionManager = null;
        
        // 状态管理
        this.processedMarkets = new Set();
        this.activeSplits = new Map();
        this.lastSplitTime = 0;
        
        // 策略特定统计
        this.strategyStats = {
            marketsDiscovered: 0,
            splitsExecuted: 0,
            totalSplitAmount: 0,
            averageMarketScore: 0,
            successfulSplits: 0
        };
    }
    
    /**
     * 获取默认配置
     */
    getDefaultConfig() {
        return {
            ...super.getDefaultConfig(),
            splitAmount: 100,              // Split金额 (USDC)
            minMarketScore: 70,            // 最小市场评分
            maxConcurrentSplits: 3,        // 最大并发Split数量
            cooldownPeriod: 300000,        // 冷却期 (5分钟)
            discoveryInterval: 60000,      // 市场发现间隔 (1分钟)
            minTimeToExpiry: 24 * 60 * 60 * 1000, // 最小到期时间 (24小时)
            maxMarketAge: 60 * 60 * 1000   // 最大市场年龄 (1小时，认为是新市场)
        };
    }
    
    /**
     * 初始化策略
     */
    async onInitialize() {
        console.log(`🔧 初始化 ${this.name}...`);
        
        // 创建仓位管理器
        this.positionManager = new PositionManager();
        
        // 如果有API客户端的钱包，使用它来初始化PositionManager
        if (this.apiClient && this.apiClient.wallet) {
            await this.positionManager.initializeWithWallet(this.apiClient.wallet);
        } else {
            await this.positionManager.initialize();
        }
        
        console.log(`✅ ${this.name} 初始化完成`);
    }
    
    /**
     * 启动策略
     */
    async onStart() {
        console.log(`🚀 启动 ${this.name}...`);
        console.log(`   Split金额: ${this.config.splitAmount} USDC`);
        console.log(`   最小市场评分: ${this.config.minMarketScore}`);
        console.log(`   最大并发Split: ${this.config.maxConcurrentSplits}`);
        console.log(`   冷却期: ${this.config.cooldownPeriod / 60000} 分钟`);
        
        // 立即执行一次市场发现
        await this.execute();
        
        // 设置定期市场发现
        this.setTimer('marketDiscovery', () => {
            this.execute().catch(error => {
                this.handleError('市场发现失败', error);
            });
        }, this.config.discoveryInterval);
        
        // 设置Split状态检查
        this.setTimer('splitCheck', () => {
            this.checkSplitStatus().catch(error => {
                this.handleError('Split状态检查失败', error);
            });
        }, 30000); // 每30秒检查一次
    }
    
    /**
     * 停止策略
     */
    async onStop() {
        console.log(`🛑 停止 ${this.name}...`);
        
        // 清理状态
        this.processedMarkets.clear();
        this.activeSplits.clear();
    }
    
    /**
     * 执行策略逻辑
     */
    async onExecute() {
        console.log(`🔍 [${this.name}] 发现新市场...`);
        
        // 检查冷却期
        const now = Date.now();
        if (now - this.lastSplitTime < this.config.cooldownPeriod) {
            const remainingCooldown = Math.round((this.config.cooldownPeriod - (now - this.lastSplitTime)) / 60000);
            console.log(`⏳ 策略冷却中，剩余 ${remainingCooldown} 分钟`);
            return { action: 'cooldown', remainingTime: remainingCooldown };
        }
        
        // 检查并发限制
        if (this.activeSplits.size >= this.config.maxConcurrentSplits) {
            console.log(`🚫 达到最大并发Split限制 (${this.config.maxConcurrentSplits})`);
            return { action: 'max_concurrent', activeSplits: this.activeSplits.size };
        }
        
        // 注意：在新架构中，策略不应该直接调用 getMarkets()
        // 市场数据应该由全局协调器提供
        // 这里保留原有逻辑以保持向后兼容，但建议使用新的架构
        console.log('⚠️ 策略直接调用 getMarkets() - 建议使用全局协调器架构');
        
        const markets = await this.apiClient.getMarkets();
        if (!markets || markets.length === 0) {
            console.log('⚠️ 未发现任何市场');
            return { action: 'no_markets' };
        }
        
        // 筛选新市场
        const newMarkets = this.filterNewMarkets(markets);
        console.log(`📊 发现 ${newMarkets.length} 个潜在新市场`);
        
        if (newMarkets.length === 0) {
            return { action: 'no_new_markets', totalMarkets: markets.length };
        }
        
        // 评估并选择最佳新市场
        const bestMarket = await this.selectBestNewMarket(newMarkets);
        if (!bestMarket) {
            return { action: 'no_qualified_markets', candidateMarkets: newMarkets.length };
        }
        
        // 执行Split操作
        const splitResult = await this.executeSplit(bestMarket.market, bestMarket.opportunity);
        
        return {
            action: 'split_executed',
            market: bestMarket.market.title.substring(0, 50) + '...',
            score: bestMarket.score,
            success: splitResult
        };
    }
    
    /**
     * 筛选新市场
     */
    filterNewMarkets(markets) {
        const now = Date.now();
        
        return markets.filter(market => {
            // 检查是否已处理过
            if (this.processedMarkets.has(market.id)) {
                return false;
            }
            
            // 检查市场状态
            if (market.expired) {
                return false;
            }
            
            // 检查到期时间
            const timeToExpiry = new Date(market.endDate).getTime() - now;
            if (timeToExpiry < this.config.minTimeToExpiry) {
                return false;
            }
            
            // 检查市场年龄（创建时间）
            const marketAge = now - new Date(market.createdAt || market.startDate).getTime();
            if (marketAge > this.config.maxMarketAge) {
                return false;
            }
            
            return true;
        });
    }

    /**
     * 评估新市场的Split机会
     */
    evaluateNewMarket(market) {
        // 检查基础条件
        if (market.expired) {
            return null;
        }

        // 检查到期时间
        const timeToExpiry = new Date(market.endDate) - new Date();
        if (timeToExpiry < this.config.minTimeToExpiry) {
            return null;
        }

        // 获取价格数据
        const priceData = this.extractPriceData(market);
        if (!priceData) {
            return null;
        }

        const { bestBid, bestAsk } = priceData;
        const midPrice = (bestBid + bestAsk) / 2;

        // 计算市场评分
        const marketScore = this.calculateNewMarketScore(market, midPrice, timeToExpiry);

        // 估算预期奖励
        const expectedReward = this.estimateExpectedReward(market, timeToExpiry);

        return {
            side: 'split', // Split操作
            price: midPrice,
            amount: this.config.splitAmount,
            marketScore: marketScore,
            expectedReward: expectedReward,
            timeToExpiry: timeToExpiry
        };
    }

    /**
     * 计算新市场评分
     */
    calculateNewMarketScore(market, midPrice, timeToExpiry) {
        let score = 60; // 新市场基础分较高

        // 时间评分（时间越长越好）
        const timeScore = Math.min(timeToExpiry / (7 * 24 * 60 * 60 * 1000) * 25, 25);
        score += timeScore;

        // 价格平衡评分（接近50%更好，适合Split）
        const balanceScore = 15 - Math.abs(midPrice - 0.5) * 30;
        score += balanceScore;

        // 市场新鲜度评分
        const marketAge = Date.now() - new Date(market.createdAt || market.startDate).getTime();
        const freshnessScore = Math.max(0, 10 - (marketAge / this.config.maxMarketAge) * 10);
        score += freshnessScore;

        return Math.max(0, Math.min(100, score));
    }

    /**
     * 估算预期奖励
     */
    estimateExpectedReward(market, timeToExpiry) {
        // 新市场的奖励估算（基于市场活跃度和时间）
        const baseDailyReward = market.isRewardable ? 2 : 0.5; // 有奖励的市场更高
        const days = timeToExpiry / (24 * 60 * 60 * 1000);
        
        return {
            dailyReward: baseDailyReward,
            totalReward: baseDailyReward * days
        };
    }

    /**
     * 提取市场价格数据
     */
    extractPriceData(market) {
        // 从交易价格中获取最新价格
        if (market.tradePrices && market.tradePrices.length > 0) {
            const latestPrice = market.tradePrices[market.tradePrices.length - 1];
            return {
                bestBid: latestPrice.price - 0.01,
                bestAsk: latestPrice.price + 0.01,
                dataSource: 'tradePrices'
            };
        }
        
        // 从订单簿获取价格（如果有的话）
        if (market.orderbook) {
            const { bids, asks } = market.orderbook;
            if (bids && bids.length > 0 && asks && asks.length > 0) {
                return {
                    bestBid: bids[0].price,
                    bestAsk: asks[0].price,
                    dataSource: 'orderbook'
                };
            }
        }

        // 新市场通常价格接近50%
        return {
            bestBid: 0.48,
            bestAsk: 0.52,
            dataSource: 'default'
        };
    }
    
    /**
     * 选择最佳新市场
     */
    async selectBestNewMarket(newMarkets) {
        const candidates = [];
        
        for (const market of newMarkets) {
            try {
                // 评估市场机会
                const opportunity = this.evaluateNewMarket(market);
                
                if (opportunity && opportunity.marketScore >= this.config.minMarketScore) {
                    candidates.push({
                        market,
                        opportunity,
                        score: opportunity.marketScore
                    });
                    
                    this.strategyStats.marketsDiscovered++;
                }
            } catch (error) {
                // 跳过评估失败的市场
                continue;
            }
        }
        
        if (candidates.length === 0) {
            console.log('⚠️ 未找到符合条件的新市场');
            return null;
        }
        
        // 选择评分最高的市场
        const best = candidates.sort((a, b) => b.score - a.score)[0];
        
        console.log(`✅ 选择新市场进行Split:`);
        console.log(`   市场: ${best.market.title.substring(0, 60)}...`);
        console.log(`   评分: ${best.score.toFixed(1)}/100`);
        console.log(`   创建时间: ${new Date(best.market.createdAt || best.market.startDate).toLocaleString()}`);
        console.log(`   到期时间: ${new Date(best.market.endDate).toLocaleString()}`);
        
        return best;
    }
    
    /**
     * 执行Split操作
     */
    async executeSplit(market, opportunity) {
        const splitId = `split_${market.id}_${Date.now()}`;
        
        try {
            console.log(`🔄 开始执行Split操作 (ID: ${splitId})`);
            console.log(`   市场: ${market.title.substring(0, 60)}...`);
            console.log(`   Split金额: ${this.config.splitAmount} USDC`);
            
            // 记录Split开始
            this.activeSplits.set(splitId, {
                marketId: market.id,
                market: market,
                opportunity: opportunity,
                startTime: Date.now(),
                status: 'executing',
                splitAmount: this.config.splitAmount
            });
            
            // 创建Split数据
            const splitData = await this.positionManager.createTestSplitData(
                market.conditionId,
                this.config.splitAmount
            );
            
            console.log(`📋 Split操作详细信息:`);
            console.log(`   ├─ 市场ID: ${market.id}`);
            console.log(`   ├─ 条件ID: ${splitData.conditionId}`);
            console.log(`   ├─ Split金额: ${splitData.usdcAmount} USDC`);
            console.log(`   ├─ 钱包地址: ${splitData.walletAddress}`);
            console.log(`   ├─ YES代币数量: ${(splitData.usdcAmount / 2).toFixed(2)} 份`);
            console.log(`   ├─ NO代币数量: ${(splitData.usdcAmount / 2).toFixed(2)} 份`);
            console.log(`   ├─ 市场评分: ${opportunity.marketScore.toFixed(1)}/100`);
            console.log(`   └─ 执行时间: ${new Date().toLocaleString()}`);
            
            // 打印Split策略说明
            console.log(`💡 Split策略说明:`);
            console.log(`   ├─ 将 ${this.config.splitAmount} USDC 分割为等量的 YES 和 NO 代币`);
            console.log(`   ├─ 无论市场结果如何，都能获得 LP 奖励`);
            console.log(`   ├─ 预期日奖励: ${opportunity.expectedReward?.dailyReward?.toFixed(3) || 'N/A'} USDC`);
            console.log(`   └─ 风险等级: 低 (持有完整仓位)`);
            
            if (splitData.transactionHash) {
                console.log(`🔗 交易哈希: ${splitData.transactionHash}`);
            }
            
            // 模拟执行时间
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            // 更新状态
            const splitInfo = this.activeSplits.get(splitId);
            splitInfo.status = 'completed';
            splitInfo.completedTime = Date.now();
            splitInfo.splitData = splitData;
            
            // 标记市场为已处理
            this.processedMarkets.add(market.id);
            this.lastSplitTime = Date.now();
            
            // 更新统计
            this.strategyStats.splitsExecuted++;
            this.strategyStats.totalSplitAmount += this.config.splitAmount;
            this.strategyStats.successfulSplits++;
            
            // 更新平均市场评分
            const totalScore = this.strategyStats.averageMarketScore * (this.strategyStats.splitsExecuted - 1) + opportunity.marketScore;
            this.strategyStats.averageMarketScore = totalScore / this.strategyStats.splitsExecuted;
            
            // 打印Split执行结果
            console.log(`✅ Split操作执行成功!`);
            console.log(`🎯 Split结果摘要:`);
            console.log(`   ├─ Split ID: ${splitId}`);
            console.log(`   ├─ 市场: ${market.title.substring(0, 50)}...`);
            console.log(`   ├─ 执行时间: ${new Date().toLocaleString()}`);
            console.log(`   ├─ Split金额: ${this.config.splitAmount} USDC`);
            console.log(`   ├─ 获得YES代币: ${(this.config.splitAmount / 2).toFixed(2)} 份`);
            console.log(`   ├─ 获得NO代币: ${(this.config.splitAmount / 2).toFixed(2)} 份`);
            console.log(`   ├─ 市场评分: ${opportunity.marketScore.toFixed(1)}/100`);
            console.log(`   ├─ 预期日奖励: ${opportunity.expectedReward?.dailyReward?.toFixed(3) || 'N/A'} USDC`);
            console.log(`   └─ 到期时间: ${new Date(market.endDate).toLocaleString()}`);
            
            // 发出完成事件
            this.emit('splitCompleted', {
                splitId,
                market,
                opportunity,
                splitData,
                timestamp: Date.now()
            });
            
            // 延迟清理Split记录
            setTimeout(() => {
                this.activeSplits.delete(splitId);
            }, 300000); // 5分钟后清理
            
            return true;
            
        } catch (error) {
            console.error(`❌ Split操作失败 (ID: ${splitId}): ${error.message}`);
            
            // 更新失败状态
            if (this.activeSplits.has(splitId)) {
                this.activeSplits.get(splitId).status = 'failed';
                this.activeSplits.get(splitId).error = error.message;
            }
            
            this.emit('splitFailed', { splitId, market, error });
            return false;
        }
    }
    
    /**
     * 检查Split状态
     */
    async checkSplitStatus() {
        if (this.activeSplits.size === 0) {
            return;
        }
        
        const now = Date.now();
        let expiredCount = 0;
        
        // 清理长时间未完成的Split
        for (const [splitId, splitInfo] of this.activeSplits.entries()) {
            const age = now - splitInfo.startTime;
            
            // 如果Split执行超过10分钟仍未完成，标记为超时
            if (age > 600000 && splitInfo.status === 'executing') {
                console.log(`⏰ Split操作超时: ${splitId}`);
                splitInfo.status = 'timeout';
                splitInfo.error = 'Split操作超时';
                
                this.emit('splitTimeout', { splitId, splitInfo });
            }
            
            // 清理超过1小时的记录
            if (age > 3600000) {
                this.activeSplits.delete(splitId);
                expiredCount++;
            }
        }
        
        if (expiredCount > 0) {
            console.log(`🧹 清理了 ${expiredCount} 个过期Split记录`);
        }
    }
    
    /**
     * 获取策略状态
     */
    getStatus() {
        const baseStatus = super.getStatus();
        
        return {
            ...baseStatus,
            strategyType: this.strategyType,
            processedMarkets: this.processedMarkets.size,
            activeSplits: this.activeSplits.size,
            lastSplitTime: this.lastSplitTime,
            strategyStats: { ...this.strategyStats },
            splitDetails: Array.from(this.activeSplits.values()).map(split => ({
                marketTitle: split.market.title.substring(0, 40) + '...',
                splitAmount: split.splitAmount,
                status: split.status,
                age: Math.round((Date.now() - split.startTime) / 60000),
                error: split.error || null
            })),
            cooldownStatus: {
                isInCooldown: Date.now() - this.lastSplitTime < this.config.cooldownPeriod,
                remainingTime: Math.max(0, Math.round((this.config.cooldownPeriod - (Date.now() - this.lastSplitTime)) / 60000))
            }
        };
    }
    
    /**
     * 手动触发市场发现
     */
    async triggerDiscovery() {
        if (this.state !== StrategyState.RUNNING) {
            throw new Error('策略未运行');
        }
        
        console.log(`🔍 [${this.name}] 手动触发市场发现...`);
        return await this.execute();
    }
    
    /**
     * 重置冷却期（用于测试）
     */
    resetCooldown() {
        this.lastSplitTime = 0;
        console.log(`🔄 [${this.name}] 冷却期已重置`);
    }
}

export default NewMarketStrategy;