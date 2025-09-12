/**
 * LP做市策略
 * 在有奖励的市场提供流动性，获取LP奖励
 */

import { BaseStrategy, StrategyState } from './base-strategy.js';
import { StrategyType } from './strategy-types.js';
import { lpMakingConfig } from '../config/strategy-config.js';
import { globals } from '../coordinators/globals.js';

export class LPMakingStrategy extends BaseStrategy {
    constructor(config = {}) {
        super('LP做市策略', config);
        
        this.strategyType = StrategyType.LP_MAKING;
        
        // 仓位和订单管理
        this.activePositions = new Map();
        this.limitOrders = new Map();
        
        // 策略特定统计
        this.strategyStats = {
            marketsEvaluated: 0,
            positionsOpened: 0,
            ordersPlaced: 0,
            ordersAdjusted: 0,
            totalRewards: 0,
            profitTaken: 0
        };
    }
    
    /**
     * 获取默认配置 - 从环境变量加载
     */
    getDefaultConfig() {
        return {
            ...super.getDefaultConfig(),
            ...lpMakingConfig  // 使用配置管理器中的参数
        };
    }
    
    /**
     * 初始化策略
     */
    async onInitialize() {
        console.log(`🔧 初始化 ${this.name}...`);
        console.log(`✅ ${this.name} 初始化完成`);
    }
    
    /**
     * 启动策略
     */
    async onStart() {
        console.log(`🚀 启动 ${this.name}...`);
        console.log(`   初始购买: ${this.config.initialPurchase} USDC`);
        console.log(`   目标止盈率: ${this.config.targetProfitRate * 100}%`);
        console.log(`   最小市场评分: ${this.config.minMarketScore}`);
        console.log(`   最大并发市场: ${this.config.maxConcurrentMarkets}`);
        
        // 立即寻找并执行一次
        await this.execute();
        
        // 设置定期执行 - 使用配置中的间隔
        this.setTimer('marketSearch', () => {
            this.execute().catch(error => {
                this.handleError('市场搜索失败', error);
            });
        }, this.config.executionInterval);
        
        // 设置价格调整定时器 - 使用配置中的间隔
        this.setTimer('priceAdjustment', () => {
            this.adjustLimitOrderPrices().catch(error => {
                this.handleError('价格调整失败', error);
            });
        }, this.config.priceAdjustmentInterval);
        
        // 设置仓位检查定时器 - 使用配置中的间隔
        this.setTimer('positionCheck', () => {
            this.checkPositions().catch(error => {
                this.handleError('仓位检查失败', error);
            });
        }, this.config.positionCheckInterval);
    }
    
    /**
     * 停止策略
     */
    async onStop() {
        console.log(`🛑 停止 ${this.name}...`);
        
        // 清理状态
        this.activePositions.clear();
        this.limitOrders.clear();
    }
    
    /**
     * 执行策略逻辑
     */
    async onExecute() {
        console.log(`🔍 [${this.name}] 寻找LP做市机会...`);
        
        // 检查是否达到最大并发限制
        if (this.activePositions.size >= this.config.maxConcurrentMarkets) {
            console.log(`🚫 达到最大并发市场限制 (${this.config.maxConcurrentMarkets})`);
            return { action: 'skipped', reason: 'max_concurrent_reached' };
        }
        
        // 寻找合适的市场
        const marketData = await this.findSuitableMarket();
        if (!marketData) {
            return { action: 'no_opportunity', marketsEvaluated: this.strategyStats.marketsEvaluated };
        }
        
        // 执行初始购买和LP做市
        const result = await this.executeInitialPurchase(marketData);
        
        return {
            action: 'position_opened',
            market: marketData.market.title.substring(0, 50) + '...',
            score: marketData.score,
            success: result
        };
    }

    async getApiClient() {
        return ''
    }
    
    /**
     * 寻找合适的LP做市市场
     */
    async findSuitableMarket() {
        try {
            console.log('🔍 寻找合适的LP做市市场...');

            const allMarkets = globals.markets;
            const markets = allMarkets.filter(market => market.isRewardable);
            if (!markets || markets.length === 0) {
                console.log('⚠️ 未发现有奖励的市场');
                return null;
            }
            
            const opportunities = [];
            
            // 评估每个市场
            for (const market of markets) {
                // 跳过已有仓位的市场
                if (this.activePositions.has(market.id)) {
                    continue;
                }
                
                try {
                    const opportunity = this.evaluateMarketForLP(market);
                    
                    if (opportunity && opportunity.marketScore >= this.config.minMarketScore) {
                        opportunities.push({
                            market,
                            opportunity,
                            score: opportunity.marketScore
                        });
                        
                        this.strategyStats.marketsEvaluated++;
                    }
                } catch (error) {
                    // 跳过评估失败的市场
                    continue;
                }
            }
            
            if (opportunities.length === 0) {
                console.log('⚠️ 未找到合适的LP做市市场');
                return null;
            }
            
            // 选择评分最高的市场
            const best = opportunities.sort((a, b) => b.score - a.score)[0];
            
            console.log(`✅ 选择LP做市市场: ${best.market.title.substring(0, 50)}...`);
            console.log(`   评分: ${best.score.toFixed(1)}/100`);
            console.log(`   策略: ${best.opportunity.side.toUpperCase()} @ ${best.opportunity.price.toFixed(4)}`);
            console.log(`   预期奖励: ${best.opportunity.expectedReward?.dailyReward?.toFixed(3)} USDC/天`);
            
            return best;
            
        } catch (error) {
            console.error('❌ 寻找合适市场失败:', error.message);
            return null;
        }
    }

    /**
     * 评估市场的LP做市机会
     */
    evaluateMarketForLP(market) {
        // 检查基础条件
        if (!market.isRewardable) {
            return null;
        }

        // 检查过期时间
        const timeToExpiry = new Date(market.endDate) - new Date();
        if (timeToExpiry < 24 * 60 * 60 * 1000) { // 至少24小时
            return null;
        }

        // 获取价格数据
        const priceData = this.extractPriceData(market);
        if (!priceData) {
            return null;
        }

        const { bestBid, bestAsk } = priceData;
        const midPrice = (bestBid + bestAsk) / 2;
        const spread = bestAsk - bestBid;

        // LP策略偏好中等价格区间（避免极端价格）
        if (midPrice < 0.2 || midPrice > 0.8) {
            return null;
        }

        // 偏好有一定价差的市场（便于做市）
        if (spread < 0.02) {
            return null;
        }

        // 计算市场评分
        const marketScore = this.calculateLPMarketScore(market, midPrice, spread, timeToExpiry);

        // 确定做市方向（选择流动性较少的一边）
        const side = midPrice > 0.5 ? 'sell' : 'buy'; // 价格高时卖出，价格低时买入
        const price = side === 'buy' ? bestBid : bestAsk;

        // 估算预期奖励
        const expectedReward = this.estimateExpectedReward(market, timeToExpiry);

        return {
            side: side,
            price: price,
            amount: this.config.initialPurchase,
            marketScore: marketScore,
            expectedReward: expectedReward,
            spread: spread,
            timeToExpiry: timeToExpiry
        };
    }

    /**
     * 计算LP市场评分
     */
    calculateLPMarketScore(market, midPrice, spread, timeToExpiry) {
        let score = 50; // 基础分

        // 价格位置评分（中等价格更好）
        const priceScore = 30 - Math.abs(midPrice - 0.5) * 60; // 0.5时最高30分
        score += priceScore;

        // 价差评分（适中价差更好）
        const spreadScore = Math.min(spread * 500, 20); // 最高20分
        score += spreadScore;

        // 时间评分（时间越长越好）
        const timeScore = Math.min(timeToExpiry / (7 * 24 * 60 * 60 * 1000) * 20, 20); // 最高20分
        score += timeScore;

        // 奖励评分（如果有设置信息）
        if (market.settings && market.settings.dailyReward) {
            const rewardScore = Math.min(parseFloat(market.settings.dailyReward) / 10 * 10, 10);
            score += rewardScore;
        }

        return Math.max(0, Math.min(100, score));
    }

    /**
     * 创建订单数据
     */
    createOrderData(market, opportunity, walletAddress, userId) {
        return {
            marketId: market.id,
            tokenId: market.tokenId,
            side: opportunity.side,
            price: opportunity.price,
            amount: opportunity.amount,
            orderType: 'LIMIT',
            walletAddress: walletAddress,
            userId: userId,
            timestamp: Date.now(),
            conditionId: market.conditionId || market.id,
            metadata: {
                strategy: 'lp-making',
                expectedReward: opportunity.expectedReward,
                marketScore: opportunity.marketScore
            }
        };
    }

    /**
     * 估算预期奖励
     */
    estimateExpectedReward(market, timeToExpiry) {
        const dailyReward = market.settings?.dailyReward ? parseFloat(market.settings.dailyReward) : 1;
        const days = timeToExpiry / (24 * 60 * 60 * 1000);
        
        return {
            dailyReward: dailyReward,
            totalReward: dailyReward * days
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
                bestBid: latestPrice.price - 0.02,
                bestAsk: latestPrice.price + 0.02,
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

        // 使用默认价格数据
        return {
            bestBid: 0.45,
            bestAsk: 0.55,
            dataSource: 'default'
        };
    }
    
    /**
     * 执行初始购买
     */
    async executeInitialPurchase(marketData) {
        const { market, opportunity } = marketData;
        const positionId = `lp_${market.id}_${Date.now()}`;
        
        try {
            console.log(`💰 执行初始购买 (ID: ${positionId})`);
            console.log(`   市场: ${market.title.substring(0, 50)}...`);
            console.log(`   方向: ${opportunity.side.toUpperCase()}`);
            console.log(`   价格: ${opportunity.price.toFixed(4)}`);
            console.log(`   金额: ${this.config.initialPurchase} USDC`);
            
            // 创建初始购买订单数据
            const apiClient = await this.getApiClient()
            const walletAddress = await apiClient.getWalletAddress();
            const userId = await apiClient.getUserId();
            
            const orderData = this.createOrderData(
                market,
                {
                    ...opportunity,
                    amount: this.config.initialPurchase
                },
                walletAddress,
                userId
            );

            // 打印详细的初始购买信息
            console.log(`📋 初始购买订单详情:`);
            console.log(`   ├─ 市场ID: ${market.id}`);
            console.log(`   ├─ 代币ID: ${market.tokenId}`);
            console.log(`   ├─ 交易方向: ${opportunity.side.toUpperCase()}`);
            console.log(`   ├─ 订单价格: ${opportunity.price.toFixed(6)} (${(opportunity.price * 100).toFixed(2)}%)`);
            console.log(`   ├─ 购买金额: ${this.config.initialPurchase} USDC`);
            console.log(`   ├─ 预期份额: ${(this.config.initialPurchase / opportunity.price).toFixed(2)} 份`);
            console.log(`   ├─ 钱包地址: ${walletAddress}`);
            console.log(`   ├─ 用户ID: ${userId}`);
            console.log(`   └─ 市场评分: ${opportunity.marketScore.toFixed(1)}/100`);
            
            // 打印订单数据结构
            console.log(`📄 生成的订单数据:`);
            console.log(`   ├─ 条件ID: ${orderData.conditionId || 'N/A'}`);
            console.log(`   ├─ 订单类型: ${orderData.orderType || 'MARKET'}`);
            console.log(`   ├─ 数量: ${orderData.amount || orderData.shares || 'N/A'}`);
            console.log(`   └─ 时间戳: ${new Date(orderData.timestamp || Date.now()).toLocaleString()}`);
            
            if (orderData.signature) {
                console.log(`🔐 订单签名: ${orderData.signature.substring(0, 20)}...`);
            }
            
            // 计算目标止盈价格
            const targetProfitPrice = this.calculateTargetProfitPrice(opportunity);
            
            // 记录仓位
            this.activePositions.set(positionId, {
                marketId: market.id,
                market: market,
                opportunity: opportunity,
                initialPrice: opportunity.price,
                targetProfitPrice: targetProfitPrice,
                status: 'purchased',
                purchaseTime: Date.now(),
                orderData: orderData,
                investment: this.config.initialPurchase
            });
            
            this.strategyStats.positionsOpened++;
            
            // 打印初始购买执行结果
            console.log(`✅ 初始购买执行成功!`);
            console.log(`🎯 购买结果摘要:`);
            console.log(`   ├─ 仓位ID: ${positionId}`);
            console.log(`   ├─ 市场: ${market.title.substring(0, 50)}...`);
            console.log(`   ├─ 执行时间: ${new Date().toLocaleString()}`);
            console.log(`   ├─ 购买金额: ${this.config.initialPurchase} USDC`);
            console.log(`   ├─ 购买方向: ${opportunity.side.toUpperCase()}`);
            console.log(`   ├─ 购买价格: ${opportunity.price.toFixed(6)}`);
            console.log(`   ├─ 预期份额: ${(this.config.initialPurchase / opportunity.price).toFixed(2)} 份`);
            console.log(`   ├─ 目标止盈价: ${targetProfitPrice.toFixed(6)}`);
            console.log(`   ├─ 目标收益率: ${(this.config.targetProfitRate * 100).toFixed(1)}%`);
            console.log(`   └─ 预期日奖励: ${opportunity.expectedReward?.dailyReward?.toFixed(3) || 'N/A'} USDC`);
            
            // 发出购买完成事件
            this.emit('purchaseCompleted', {
                positionId,
                market,
                opportunity,
                orderData,
                targetProfitPrice,
                timestamp: Date.now()
            });
            
            // 立即开始LP做市
            await this.startLPMaking(positionId);
            
            return true;
            
        } catch (error) {
            console.error(`❌ 初始购买失败 (ID: ${positionId}): ${error.message}`);
            this.emit('purchaseFailed', { positionId, market, error });
            return false;
        }
    }
    
    /**
     * 计算目标止盈价格
     */
    calculateTargetProfitPrice(opportunity) {
        const { side, price } = opportunity;
        const profitRate = this.config.targetProfitRate;
        
        if (side === 'buy') {
            // 买入后，目标卖出价格
            return Math.min(price * (1 + profitRate), 0.99);
        } else {
            // 卖出后，目标买入价格
            return Math.max(price * (1 - profitRate), 0.01);
        }
    }
    
    /**
     * 开始LP做市
     */
    async startLPMaking(positionId) {
        try {
            const position = this.activePositions.get(positionId);
            if (!position) {
                throw new Error(`仓位不存在: ${positionId}`);
            }
            
            console.log(`📊 开始LP做市 (ID: ${positionId})`);
            
            // 创建限价订单
            const limitOrderId = await this.createLimitOrder(position);
            
            // 更新仓位状态
            position.status = 'lp_making';
            position.limitOrderId = limitOrderId;
            position.lpStartTime = Date.now();
            
            // 打印LP做市启动结果
            console.log(`✅ LP做市启动成功!`);
            console.log(`🎯 LP做市摘要:`);
            console.log(`   ├─ 仓位ID: ${positionId}`);
            console.log(`   ├─ 限价订单ID: ${limitOrderId}`);
            console.log(`   ├─ 市场: ${position.market.title.substring(0, 50)}...`);
            console.log(`   ├─ 启动时间: ${new Date().toLocaleString()}`);
            console.log(`   ├─ 初始投资: ${position.investment} USDC`);
            console.log(`   ├─ 当前状态: LP做市中`);
            console.log(`   ├─ 目标收益率: ${(this.config.targetProfitRate * 100).toFixed(1)}%`);
            console.log(`   └─ 预期日奖励: ${position.opportunity.expectedReward?.dailyReward?.toFixed(3) || 'N/A'} USDC`);
            
            this.emit('lpMakingStarted', {
                positionId,
                limitOrderId,
                position,
                timestamp: Date.now()
            });
            
        } catch (error) {
            console.error(`❌ 启动LP做市失败 (ID: ${positionId}): ${error.message}`);
            this.emit('lpMakingFailed', { positionId, error });
        }
    }
    
    /**
     * 创建限价订单
     */
    async createLimitOrder(position) {
        const { market, opportunity, targetProfitPrice } = position;
        const orderId = `limit_${market.id}_${Date.now()}`;
        
        try {
            // 计算限价订单价格（略偏离止盈价格，确保能获得奖励）
            const limitPrice = this.calculateLimitOrderPrice(opportunity, targetProfitPrice);
            
            console.log(`📋 创建限价订单:`);
            console.log(`   价格: ${limitPrice.toFixed(4)} (目标止盈: ${targetProfitPrice.toFixed(4)})`);
            console.log(`   策略: 获得LP奖励同时等待止盈机会`);
            
            // 创建限价订单数据
            const apiClient = this.getApiClient()
            const walletAddress = await apiClient.getWalletAddress();
            const userId = await apiClient.getUserId();
            
            const limitOrderData = this.createOrderData(
                market,
                {
                    ...opportunity,
                    price: limitPrice,
                    amount: this.config.initialPurchase
                },
                walletAddress,
                userId
            );

            // 打印限价订单详细信息
            console.log(`📋 限价订单详情:`);
            console.log(`   ├─ 订单ID: ${orderId}`);
            console.log(`   ├─ 市场ID: ${market.id}`);
            console.log(`   ├─ 限价价格: ${limitPrice.toFixed(6)} (${(limitPrice * 100).toFixed(2)}%)`);
            console.log(`   ├─ 目标价格: ${targetProfitPrice.toFixed(6)} (${(targetProfitPrice * 100).toFixed(2)}%)`);
            console.log(`   ├─ 订单金额: ${this.config.initialPurchase} USDC`);
            console.log(`   ├─ 钱包地址: ${walletAddress}`);
            console.log(`   ├─ 用户ID: ${userId}`);
            console.log(`   └─ 创建时间: ${new Date().toLocaleString()}`);
            
            // 打印LP做市策略说明
            console.log(`💡 LP做市策略:`);
            console.log(`   ├─ 在限价价格提供流动性`);
            console.log(`   ├─ 获得持续的LP奖励`);
            console.log(`   ├─ 等待价格达到止盈目标`);
            console.log(`   └─ 动态调整订单价格以优化收益`);
            
            if (limitOrderData.signature) {
                console.log(`🔐 限价订单签名: ${limitOrderData.signature.substring(0, 20)}...`);
            }
            
            // 记录限价订单
            this.limitOrders.set(orderId, {
                positionId: position.marketId,
                market: market,
                price: limitPrice,
                targetProfitPrice: targetProfitPrice,
                orderData: limitOrderData,
                createTime: Date.now(),
                lastAdjustTime: Date.now(),
                adjustmentCount: 0,
                status: 'active'
            });
            
            this.strategyStats.ordersPlaced++;
            
            return orderId;
            
        } catch (error) {
            console.error(`❌ 创建限价订单失败: ${error.message}`);
            throw error;
        }
    }
    
    /**
     * 计算限价订单价格
     */
    calculateLimitOrderPrice(opportunity, targetProfitPrice) {
        const { side, price } = opportunity;
        const buffer = 0.005; // 0.5% 缓冲区
        
        if (side === 'buy') {
            // 买入仓位，设置卖出限价单
            // 价格略低于止盈价格，确保在奖励范围内
            return Math.max(targetProfitPrice - buffer, price + 0.01);
        } else {
            // 卖出仓位，设置买入限价单
            // 价格略高于止盈价格，确保在奖励范围内
            return Math.min(targetProfitPrice + buffer, price - 0.01);
        }
    }
    
    /**
     * 调整限价订单价格
     */
    async adjustLimitOrderPrices() {
        if (this.limitOrders.size === 0) {
            return;
        }
        
        console.log(`🔧 调整 ${this.limitOrders.size} 个限价订单价格...`);
        
        let adjustedCount = 0;
        
        for (const [orderId, limitOrder] of this.limitOrders.entries()) {
            try {
                const adjusted = await this.adjustSingleLimitOrder(orderId, limitOrder);
                if (adjusted) {
                    adjustedCount++;
                }
            } catch (error) {
                console.error(`❌ 调整限价订单失败 (${orderId}): ${error.message}`);
            }
        }
        
        if (adjustedCount > 0) {
            console.log(`✅ 调整了 ${adjustedCount} 个限价订单`);
            this.strategyStats.ordersAdjusted += adjustedCount;
        }
    }
    
    /**
     * 调整单个限价订单
     */
    async adjustSingleLimitOrder(orderId, limitOrder) {
        const { market, targetProfitPrice } = limitOrder;
        
        try {
            // 重新评估市场
            const currentOpportunity = this.evaluateMarketForLP(market);
            
            if (!currentOpportunity) {
                return false;
            }
            
            // 检查是否达到止盈条件
            const shouldTakeProfit = this.shouldTakeProfit(currentOpportunity, targetProfitPrice);
            
            if (shouldTakeProfit) {
                console.log(`🎯 达到止盈条件，调整订单成交 (${orderId})`);
                await this.adjustOrderForProfit(orderId, currentOpportunity);
                return true;
            } else {
                // 调整价格保证获得奖励
                return await this.adjustOrderForReward(orderId, currentOpportunity, targetProfitPrice);
            }
            
        } catch (error) {
            console.error(`❌ 调整订单失败 (${orderId}): ${error.message}`);
            return false;
        }
    }
    
    /**
     * 检查是否应该止盈
     */
    shouldTakeProfit(currentOpportunity, targetProfitPrice) {
        const { side, price } = currentOpportunity;
        
        if (side === 'sell') {
            // 卖出订单，当前价格达到或超过目标价格
            return price >= targetProfitPrice;
        } else {
            // 买入订单，当前价格达到或低于目标价格
            return price <= targetProfitPrice;
        }
    }
    
    /**
     * 调整订单以止盈
     */
    async adjustOrderForProfit(orderId, currentOpportunity) {
        const limitOrder = this.limitOrders.get(orderId);
        if (!limitOrder) return;
        
        // 打印止盈调整详情
        console.log(`📈 执行止盈调整!`);
        console.log(`🎯 止盈调整详情:`);
        console.log(`   ├─ 订单ID: ${orderId}`);
        console.log(`   ├─ 市场: ${limitOrder.market.title.substring(0, 40)}...`);
        console.log(`   ├─ 调整时间: ${new Date().toLocaleString()}`);
        console.log(`   ├─ 原价格: ${limitOrder.price.toFixed(6)} (${(limitOrder.price * 100).toFixed(2)}%)`);
        console.log(`   ├─ 新价格: ${currentOpportunity.price.toFixed(6)} (${(currentOpportunity.price * 100).toFixed(2)}%)`);
        console.log(`   ├─ 目标价格: ${limitOrder.targetProfitPrice.toFixed(6)} (${(limitOrder.targetProfitPrice * 100).toFixed(2)}%)`);
        console.log(`   ├─ 调整次数: ${limitOrder.adjustmentCount + 1}`);
        console.log(`   └─ 状态: 止盈执行中`);
        
        // 更新订单价格
        limitOrder.price = currentOpportunity.price;
        limitOrder.lastAdjustTime = Date.now();
        limitOrder.adjustmentCount++;
        limitOrder.status = 'profit_taking';
        
        this.strategyStats.profitTaken++;
        
        this.emit('orderAdjustedForProfit', {
            orderId,
            newPrice: currentOpportunity.price,
            targetProfitPrice: limitOrder.targetProfitPrice,
            timestamp: Date.now()
        });
    }
    
    /**
     * 调整订单以获得奖励
     */
    async adjustOrderForReward(orderId, currentOpportunity, targetProfitPrice) {
        const limitOrder = this.limitOrders.get(orderId);
        if (!limitOrder) return false;
        
        // 计算新的限价订单价格
        const newPrice = this.calculateLimitOrderPrice(currentOpportunity, targetProfitPrice);
        
        // 只有价格变化超过阈值才调整
        const priceChange = Math.abs(newPrice - limitOrder.price);
        if (priceChange < 0.001) {
            return false;
        }
        
        // 打印奖励优化调整详情
        console.log(`🔧 执行奖励优化调整!`);
        console.log(`💰 奖励优化详情:`);
        console.log(`   ├─ 订单ID: ${orderId}`);
        console.log(`   ├─ 市场: ${limitOrder.market.title.substring(0, 40)}...`);
        console.log(`   ├─ 调整时间: ${new Date().toLocaleString()}`);
        console.log(`   ├─ 原价格: ${limitOrder.price.toFixed(6)} (${(limitOrder.price * 100).toFixed(2)}%)`);
        console.log(`   ├─ 新价格: ${newPrice.toFixed(6)} (${(newPrice * 100).toFixed(2)}%)`);
        console.log(`   ├─ 价格变化: ${priceChange > 0 ? '+' : ''}${(priceChange * 100).toFixed(3)}%`);
        console.log(`   ├─ 调整次数: ${limitOrder.adjustmentCount + 1}`);
        console.log(`   └─ 目的: 优化LP奖励获取`);
        
        // 更新订单价格
        limitOrder.price = newPrice;
        limitOrder.lastAdjustTime = Date.now();
        limitOrder.adjustmentCount++;
        
        this.emit('orderAdjustedForReward', {
            orderId,
            oldPrice: limitOrder.price,
            newPrice: newPrice,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    /**
     * 检查仓位状态
     */
    async checkPositions() {
        if (this.activePositions.size === 0) {
            return;
        }
        
        // 检查过期订单
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [orderId, limitOrder] of this.limitOrders.entries()) {
            const orderAge = now - limitOrder.createTime;
            if (orderAge > this.config.maxOrderAge) {
                console.log(`🗑️ 清理过期订单: ${orderId} (年龄: ${Math.round(orderAge / 60000)} 分钟)`);
                this.limitOrders.delete(orderId);
                cleanedCount++;
            }
        }
        
        if (cleanedCount > 0) {
            console.log(`🧹 清理了 ${cleanedCount} 个过期订单`);
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
            activePositions: this.activePositions.size,
            limitOrders: this.limitOrders.size,
            strategyStats: { ...this.strategyStats },
            positionDetails: Array.from(this.activePositions.values()).map(pos => ({
                marketTitle: pos.market.title.substring(0, 40) + '...',
                side: pos.opportunity.side,
                price: pos.opportunity.price.toFixed(4),
                investment: pos.investment,
                targetProfitPrice: pos.targetProfitPrice.toFixed(4),
                status: pos.status,
                lpDuration: pos.lpStartTime ? Math.round((Date.now() - pos.lpStartTime) / 60000) : 0
            })),
            orderDetails: Array.from(this.limitOrders.values()).map(order => ({
                marketTitle: order.market.title.substring(0, 40) + '...',
                price: order.price.toFixed(4),
                targetPrice: order.targetProfitPrice.toFixed(4),
                adjustments: order.adjustmentCount,
                age: Math.round((Date.now() - order.createTime) / 60000),
                status: order.status
            }))
        };
    }
}

export default LPMakingStrategy;