/**
 * 每小时套利策略
 * 监控每小时结算市场，在结算前寻找套利机会
 */

import Decimal from 'decimal.js';

import { BaseStrategy } from './base-strategy.js';
import { StrategyType } from './strategy-types.js';
import { priceArbitrageConfig } from '../config/strategy-config.js';
import { globals } from '../coordinators/globals.js';


export class PriceArbitrageStrategy extends BaseStrategy {
    constructor(config = {}) {
        super('价格套利策略', config);

        this.strategyType = StrategyType.PRICE_ARBITRAGE;
        this.markets = new Map();
    }

    /**
     * 获取默认配置 - 从环境变量加载
     */
    getDefaultConfig() {
        return {
            ...super.getDefaultConfig(),
            ...priceArbitrageConfig  // 使用配置管理器中的参数
        };
    }

    /**
     * 启动策略
     */
    async onStart() {
        console.log(`🚀 启动 ${this.name}...`);
        console.log(`   单次交易金额: ${this.config.arbitrageAmount} USDC`);
        console.log(`   扫描间隔: ${this.config.scanInterval / 1000} 秒`);

        for (const item of globals.posistions) {
            const market = item.position.market;
            if (market.closed) continue
            const marketConditionId = market.conditionId;
            this.markets.set(marketConditionId, {
                market,
            });
        }

        // 立即执行一次扫描
        await this.execute();

        // 设置定期扫描 - 使用配置中的间隔
        this.setTimer('marketScan', () => {
            this.execute().catch(error => {
                this.handleError('定期扫描失败', error);
            });
        }, Math.max(this.config.scanInterval, this.config.marketScanInterval));

        this.setTimer('sellToArbitrage', () => {
            this.sellToArbitrage().catch(error => {
                this.handleError('定期卖出套利失败', error);
            })
        }, this.config.sellToArbitrageInterval);
    }

    /**
     * 停止策略
     */
    async onStop() {
        console.log(`🛑 停止 ${this.name}...`);
    }

    /**
     * 执行策略逻辑
     */
    async onExecute() {
        const nowMinutes = this.getMinutes();

        if (nowMinutes > this.config.maxMinutes) {
            console.warn('⚠️ 当前已过最佳套利时间');
            return { marketsFound: 0, opportunitiesFound: 0 };
        }

        const markets = globals.markets;
        if (!markets || markets.length === 0) {
            console.warn('⚠️ 未发现任何市场');
            return { marketsFound: 0, opportunitiesFound: 0 };
        }

        // 筛选每小时市场
        const hourlyMarkets = this.filterHourlyMarkets(markets);

        if (hourlyMarkets.length === 0) {
            return { marketsFound: 0, opportunitiesFound: 0 };
        }

        let opportunitiesFound = 0;
        let positionsOpened = 0;

        // 检查每个市场
        for (const market of hourlyMarkets) {
            const feedPrices = market.feedPrices
            let opportunity = {};

            try {
                // 检查是否为 hourly 市场
                if (!this.isHourlyMarket(market)) {
                    continue;
                }

                const thisMarket = this.markets.get(market.conditionId)
                if (!thisMarket) {
                    thisMarket.set(market.conditionId, {
                        market,
                        candidates: new Map(),
                    })
                } else if (!thisMarket.get(market.conditionId).candidates) {
                    continue;
                }

                if (nowMinutes < this.config.minMinutes) {
                    let candidateCount = 0;

                    for (const [_, marketStat] of this.markets.entries()) {
                        candidateCount += marketStat.candidates.size;
                    }

                    if (this.config.maxConcurrentPositions > candidateCount) {
                        await this.preExecuteArbitrageTrade(market, this.config.maxConcurrentPositions - candidateCount);
                    }

                    if (!feedPrices) continue;

                    if (feedPrices.YES >= 0.6) {
                        opportunity.pricePerToken = feedPrices.NO;
                        opportunity.outcomeIndex = 1;
                    } else if (feedPrices.NO > 0.6) {
                        opportunity.pricePerToken = feedPrices.YES;
                        opportunity.outcomeIndex = 0;
                    }

                    opportunity.slippage = this.config.slippage * 0.5
                    if (await this.executeArbitrageTrade(market, opportunity)) {
                        positionsOpened++;
                    }

                    continue;
                }

                if (!feedPrices) continue;

                if (feedPrices.YES >= 0.6) {
                    opportunity.pricePerToken = feedPrices.NO;
                    opportunity.outcomeIndex = 1;
                } else if (feedPrices.NO > 0.6) {
                    opportunity.pricePerToken = feedPrices.YES;
                    opportunity.outcomeIndex = 0;
                } else if (feedPrices.NO > feedPrices.YES) {
                    opportunity.pricePerToken = feedPrices.NO;
                    opportunity.outcomeIndex = 1;
                } else {
                    opportunity.pricePerToken = feedPrices.YES;
                    opportunity.outcomeIndex = 0;
                }

                opportunity.slippage = this.config.slippage;
                const success = await this.executeArbitrageTrade(market, opportunity);
                if (success) {
                    positionsOpened++;
                }
            } catch (error) {
                console.error(`❌ 处理市场失败 ${market.title}: ${error.message}`);
                continue;
            }
        }

        return {
            marketsFound: hourlyMarkets.length,
            opportunitiesFound,
            positionsOpened
        };
    }

    /**
     * 筛选活跃市场 - hourly 检查现在在评估阶段进行
     */
    filterHourlyMarkets(markets) {
        return markets.filter(market => {
            // 只做基础筛选，hourly 检查移到评估阶段
            const isActive = !market.expired;
            
            // 基础时间检查 - 确保市场还没结束
            const timeToExpiry = new Date(market.endDate) - new Date();
            const hasTimeLeft = timeToExpiry > 0;

            return isActive && hasTimeLeft;
        });
    }

    /**
     * 生成市场周期ID
     */
    getMarketCycleId(market) {
        const endTime = new Date(market.endDate);
        return `${market.conditionId}_${endTime.getTime()}`;
    }

    /**
     * 检查是否为 hourly 市场
     */
    isHourlyMarket(market) {
        // 检查标签
        const hasHourlyTag = market.tags && 
            market.tags.some(tag => tag.toLowerCase().includes('hourly'));
        
        // 检查结束时间是否在整点
        const endTime = new Date(market.endDate);
        const isHourlyPattern = endTime.getMinutes() === 0;
        
        // 检查标题是否包含 hourly 相关词汇
        const title = market.title?.toLowerCase() || '';
        const hasHourlyInTitle = title.includes('hourly') || 
                                title.includes('hour') ||
                                title.includes('每小时') ||
                                title.includes('小时');

        return hasHourlyTag || (isHourlyPattern && hasHourlyInTitle);
    }

    /**
     * 计算预期收益
     */
    calculateExpectedReturn(price, side) {
        const investment = this.config.arbitrageAmount;

        if (side === 'buy') {
            // 买入YES，如果结算为YES，收益 = 投资额 / 价格 - 投资额
            const potentialReturn = (investment / price) - investment;
            const probability = price; // 市场价格反映概率
            return potentialReturn * probability;
        } else {
            // 买入NO，如果结算为NO，收益 = 投资额 / (1-价格) - 投资额
            const potentialReturn = (investment / (1 - price)) - investment;
            const probability = 1 - price; // NO的概率
            return potentialReturn * probability;
        }
    }

    async preExecuteArbitrageTrade(market, count) {
        console.log("开始预处理");

        let choosenCount = 0;

        for (const account of globals.accounts) {
            if (!account.strategies.includes(this.strategyType) || this.markets.get(market.conditionId).candidates.has(account.id)) {
                continue;
            }

            if (choosenCount >= count) {
                break
            }

            try {
                this.markets.get(market.conditionId).candidates.set(account.id, account.apiClient);
                const approveTx = await account.apiClient.approve(market.address, this.config.arbitrageAmount * 1000000);
                await approveTx.wait()
                await apiClient.setApproval(market.address)
                choosenCount += 1;
            } catch (error)  {
                this.markets.get(market.conditionId).candidates.delete(account.id);
                console.error(`❌ 账户授权失败 (ID: ${account.id}): ${error.message}`);
            }
        }
    }

    /**
     * 执行套利交易
     */
    async executeArbitrageTrade(market, opportunity) {
        const positionId = `price_arb_${market.conditionId}_${Date.now()}`;

        const { pricePerToken, outcomeIndex, slippage } = opportunity;

        try {
            console.log(`💰 执行套利交易 (ID: ${positionId})`);

            const candidates = this.markets.get(market.conditionId).candidates;
            if (!candidates.size) {
                console.warn('❌无可执行的账户');
                return true;
            }

            const candidateArray = Array.from(candidates.entries());
            candidates.clear(); // 清空，防止重复处理

            // 2. 记录失败账户
            const failedAccounts = [];

            // 3. 并发执行下单
            const promises = candidateArray.map(([accountId, apiClient]) =>
                (async () => {
                    try {
                        const tx = await apiClient.placeHourlyOrder({
                            contractAddress: market.address,
                            investmentAmount: this.config.arbitrageAmount * 1000000,
                            pricePerToken,
                            outcomeIndex,
                            slippage,
                            confirmRealOrder: true,
                        });
                        await tx.wait();
                        // 成功什么都不做
                    } catch (error) {
                        // 失败记录
                        failedAccounts.push([accountId, apiClient]);
                        // 可以记录错误日志
                        console.error(`❌ 账户 ${accountId} 套利失败: ${error.message}`);
                    }
                })()
            );

            await Promise.allSettled(promises);

            // 4. 把失败账户加回 candidates
            for (const [accountId, apiClient] of failedAccounts) {
                candidates.set(accountId, apiClient);
            }

            // 发出交易完成事件
            this.emit('arbitrageTradeExecuted', {
                positionId,
                market,
                opportunity,
                timestamp: Date.now()
            });

            return true;

        } catch (error) {
            console.error(`❌ 套利交易失败 (ID: ${positionId}): ${error.message}`);
            this.emit('arbitrageTradeFailed', { positionId, market, error });
            return false;
        }
    }

    async sellPostion(target) {
        const { account, position } = target;

        const contractAddress = position.market.id
        const outcomeIndex = position.outcomeIndex
        const outcomeTokenAmount = position.outcomeTokenAmount
        const totalBuysCost = position.totalBuysCost
        const returnAmount = Number(totalBuysCost) * 1.2 * 1000000
        const maxOutcomeTokensToSell = Math.floor((Number(outcomeTokenAmount) * 1000000)).toString()

        try {
            await account.apiClient.sellByContract({
                contractAddress,
                confirmRealOrder: true,
                returnAmount,
                outcomeIndex,
                maxOutcomeTokensToSell,
            });
        } catch (error) {
            console.error(error);
        }
    }

    async sellToArbitrage() {
        const positions = globals.posistions;
        for (const [marketConditionId, _] of this.markets.entries()) {
            const targets = positions.filter(target => 
                target.position.market.conditionId == marketConditionId &&
                !target.position.market.closed &&
                Number(target.position.totalSellsCost) == 0
            );

            await Promise.all(targets.map((target) => this.sellPostion(target)));
        }
    }
}

export default PriceArbitrageStrategy;