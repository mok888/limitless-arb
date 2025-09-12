/**
 * 每小时套利策略
 * 监控每小时结算市场，在结算前寻找套利机会
 */

import Decimal from 'decimal.js';

import { BaseStrategy, StrategyState } from './base-strategy.js';
import { StrategyType } from './strategy-types.js';
import { hourlyArbitrageConfig } from '../config/strategy-config.js';
import { globals } from '../coordinators/globals.js';
import LimitlessApiClient from '../core/api-client.js';


export class HourlyArbitrageStrategy extends BaseStrategy {
    constructor(config = {}) {
        super('每小时套利策略', config);

        this.strategyType = StrategyType.HOURLY_ARBITRAGE;

        this.accountProved = new Map();
        this.markets = new Map();

        // 策略特定统计
        this.strategyStats = {
            marketsScanned: 0,
            opportunitiesFound: 0,
            positionsOpened: 0,
            positionsSettled: 0,
            totalProfit: 0
        };
    }

    /**
     * 获取默认配置 - 从环境变量加载
     */
    getDefaultConfig() {
        return {
            ...super.getDefaultConfig(),
            ...hourlyArbitrageConfig  // 使用配置管理器中的参数
        };
    }

    /**
     * 启动策略
     */
    async onStart() {
        console.log(`🚀 启动 ${this.name}...`);
        console.log(`   单次交易金额: ${this.config.arbitrageAmount} USDC`);
        console.log(`   价格区间: ${this.config.minPriceThreshold * 100}% - ${this.config.maxPriceThreshold * 100}%`);
        console.log(`   扫描间隔: ${this.config.scanInterval / 1000} 秒`);

        // 立即执行一次扫描
        await this.execute();

        // 设置定期扫描 - 使用配置中的间隔
        this.setTimer('marketScan', () => {
            this.execute().catch(error => {
                this.handleError('定期扫描失败', error);
            });
        }, Math.max(this.config.scanInterval, this.config.marketScanInterval));
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
        // console.log(`🔍 [${this.name}] 扫描每小时结算市场...`);

        const markets = globals.markets;
        if (!markets || markets.length === 0) {
            console.log('⚠️ 未发现任何市场');
            return { marketsFound: 0, opportunitiesFound: 0 };
        }

        // 筛选每小时市场
        const hourlyMarkets = this.filterHourlyMarkets(markets);
        this.strategyStats.marketsScanned += hourlyMarkets.length;

        if (hourlyMarkets.length === 0) {
            return { marketsFound: 0, opportunitiesFound: 0 };
        }

        let opportunitiesFound = 0;
        let positionsOpened = 0;

        // 检查每个市场
        for (const market of hourlyMarkets) {
            try {
                // 检查是否为 hourly 市场
                if (!this.isHourlyMarket(market)) {
                    continue;
                }

                if (!this.markets.get(market.id)) {
                    this.markets.set(market.id, {
                        market,
                        candidates: new Map(),
                    })
                }

                // 检查是否在设置的过期时间范围内
                const timeToExpiry = new Date(market.endDate) - new Date();
                const isInTimeRange = timeToExpiry < this.config.maxTimeToSettlement;

                if (!isInTimeRange) {
                    let candidateCount = 0;
                    for (const [_, marketStat] of this.markets.entries()) {
                        candidateCount += marketStat.candidates.size;
                    }

                    if (this.config.maxConcurrentPositions > candidateCount) {
                        await this.preExecuteArbitrageTrade(market, this.config.maxConcurrentPositions - candidateCount);
                    }

                    const minutes = Math.round(timeToExpiry / 60000);
                    const maxMinutes = Math.round(this.config.maxTimeToSettlement / 60000);

                    console.log(`❌ 时间不在范围内: ${minutes}分钟 (需要在最后 ${maxMinutes} 分钟内)`);

                    continue;
                }

                // 评估套利机会
                const opportunity = await this.evaluateArbitrageOpportunity(market);
                if (opportunity) {
                    opportunitiesFound++;
                    this.strategyStats.opportunitiesFound++;

                    console.log(`🎯 发现套利机会: ${market.title.substring(0, 50)}...`);

                    // 执行套利交易
                    const success = await this.executeArbitrageTrade(market, opportunity);
                    if (success) {
                        positionsOpened++;
                        this.strategyStats.positionsOpened++;
                    }
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
        return `${market.id}_${endTime.getTime()}`;
    }

    /**
     * 评估套利机会 - 简化的三条件检查
     * 1. 是否为 hourly 市场
     * 2. 是否在设置的过期时间范围内  
     * 3. YES或NO是否有一方价格位于设置的价格范围内
     */
    async evaluateArbitrageOpportunity(market) {
        try {
            console.log('🔍 开始评估套利机会:', market.title?.substring(0, 50) + '...');

            const priceData = market.priceData;
            const yesPrice = priceData.YES;
            const noPrice = priceData.NO;

            const minPriceThreshold = this.config.minPriceThreshold;
            const maxPriceThreshold = this.config.maxPriceThreshold;

            // 检查 YES 价格是否在范围内
            const yesInRange = yesPrice >= minPriceThreshold && yesPrice <= maxPriceThreshold;

            // 检查 NO 价格是否在范围内  
            const noInRange = noPrice >= minPriceThreshold && noPrice <= maxPriceThreshold;

            if (!yesInRange && !noInRange) {
                console.log(`❌ YES 价格 ${yesPrice} 和 NO 价格 ${noPrice} 不在 ${minPriceThreshold} - ${maxPriceThreshold} 范围内`);
                return null;
            }

            // 确定交易方向和价格
            let outcomeIndex, pricePerToken;
            if (yesInRange) {
                outcomeIndex = 0;
                pricePerToken = yesPrice;
            } else {
                outcomeIndex = 1;
                pricePerToken = noPrice;
            }

            // 计算预期收益
            // const expectedReturn = this.calculateExpectedReturn(price, side);
            const expectedReturn = 0;

            return {
                outcomeIndex,
                pricePerToken,
                amount: this.config.arbitrageAmount,
                expectedReturn,
                isArbitrageOpportunity: true
            };

        } catch (error) {
            console.error(`❌ 评估套利机会失败: ${error.message}`);
            return null;
        }
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
            if (!account.strategies.includes(this.strategyType) || this.markets.get(market.id).candidates.has(account.id)) {
                continue;
            }

            if (choosenCount >= count) {
                break
            }

            try {
                this.markets.get(market.id).candidates.set(account.id, account.apiClient);
                await account.apiClient.approve(market.address, this.config.arbitrageAmount * 1000000);
                choosenCount += 1;
            } catch (error)  {
                this.markets.get(market.id).candidates.delete(account.id);
                console.error(`❌ 账户授权失败 (ID: ${account.id}): ${error.message}`);
            }
        }
    }

    /**
     * 执行套利交易
     */
    async executeArbitrageTrade(market, opportunity) {
        const positionId = `hourly_arb_${market.id}_${Date.now()}`;

        try {
            console.log(`💰 执行套利交易 (ID: ${positionId})`);

            const candidates = this.markets.get(market.id).candidates;
            if (!candidates.size) {
                console.log('❌无可执行的账户');
                return true;
            }

            for (const [accountId, apiClient] of candidates.entries()) {
                try {
                    candidates.delete(accountId);
                    await apiClient.placeHourlyOrder({
                        contractAddress: market.address,
                        investmentAmount: this.config.arbitrageAmount * 1000000,
                        pricePerToken: opportunity.pricePerToken,
                        outcomeIndex: opportunity.outcomeIndex,
                        confirmRealOrder: true,
                    })

                } catch (error) {
                    candidates.set(accountId, apiClient);
                    throw error
                }
            }

            // 发出交易完成事件
            this.emit('arbitrageTradeExecuted', {
                positionId,
                market,
                opportunity,
                timestamp: Date.now()
            });

            // 打印交易执行结果
            console.log(`✅ 套利交易执行成功!`);
            console.log(`🎯 交易结果摘要:`);
            console.log(`   ├─ 仓位ID: ${positionId}`);
            console.log(`   ├─ 市场: ${market.title.substring(0, 50)}...`);
            console.log(`   ├─ 执行时间: ${new Date().toLocaleString()}`);
            console.log(`   ├─ 投资金额: ${opportunity.amount} USDC`);
            console.log(`   ├─ 预期收益: ${opportunity.expectedReturn.toFixed(3)} USDC`);
            console.log(`   ├─ 预期收益率: ${((opportunity.expectedReturn / opportunity.amount) * 100).toFixed(2)}%`);
            console.log(`   └─ 结算倒计时: ${Math.round((new Date(market.endDate).getTime() - Date.now()) / 60000)} 分钟`);

            return true;

        } catch (error) {
            console.error(`❌ 套利交易失败 (ID: ${positionId}): ${error.message}`);
            this.emit('arbitrageTradeFailed', { positionId, market, error });
            return false;
        }
    }
}

export default HourlyArbitrageStrategy;