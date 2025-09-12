/**
 * 风险控制服务
 * 负责评估和控制交易风险
 */

export class RiskControlService {
    constructor() {
        this.riskStats = {
            totalChecks: 0,
            approvedChecks: 0,
            rejectedChecks: 0,
            lastCheckTime: null
        };
        
        // 全局风险限制
        this.globalLimits = {
            maxDailyLoss: 1000, // 每日最大损失
            maxPositionSize: 200, // 单个仓位最大金额
            maxRiskLevel: 5, // 最大风险等级
            maxConcurrentPositions: 10 // 最大并发仓位数
        };
        
        // 账户风险状态跟踪
        this.accountRiskStates = new Map(); // accountId -> riskState
    }
    
    /**
     * 检查交易机会的风险
     */
    async checkOpportunity(market, opportunity, config, accountId) {
        this.riskStats.totalChecks++;
        this.riskStats.lastCheckTime = Date.now();
        
        try {
            // 获取或创建账户风险状态
            const accountRiskState = this.getAccountRiskState(accountId);
            
            // 执行各种风险检查
            const checks = [
                this.checkInvestmentAmount(opportunity, config),
                this.checkRiskLevel(opportunity, config),
                this.checkMarketRisk(market),
                this.checkAccountRisk(accountRiskState, opportunity),
                this.checkGlobalRisk(opportunity),
                this.checkTimeRisk(market),
                this.checkLiquidityRisk(market)
            ];
            
            // 执行所有检查
            for (const check of checks) {
                const result = await check;
                if (!result.approved) {
                    this.riskStats.rejectedChecks++;
                    return result;
                }
            }
            
            // 所有检查通过
            this.riskStats.approvedChecks++;
            
            // 更新账户风险状态
            this.updateAccountRiskState(accountId, opportunity);
            
            return { approved: true };
            
        } catch (error) {
            console.error(`❌ 风险检查失败:`, error.message);
            this.riskStats.rejectedChecks++;
            return {
                approved: false,
                reason: `风险检查系统错误: ${error.message}`
            };
        }
    }
    
    /**
     * 检查投资金额
     */
    async checkInvestmentAmount(opportunity, config) {
        const amount = opportunity.amount || opportunity.arbitrageAmount || 0;
        
        // 检查最小投资金额
        if (config.minInvestmentAmount && amount < config.minInvestmentAmount) {
            return {
                approved: false,
                reason: `投资金额 ${amount} 低于最小限制 ${config.minInvestmentAmount}`
            };
        }
        
        // 检查最大投资金额
        if (config.maxInvestmentAmount && amount > config.maxInvestmentAmount) {
            return {
                approved: false,
                reason: `投资金额 ${amount} 超过最大限制 ${config.maxInvestmentAmount}`
            };
        }
        
        // 检查全局仓位大小限制
        if (amount > this.globalLimits.maxPositionSize) {
            return {
                approved: false,
                reason: `投资金额 ${amount} 超过全局限制 ${this.globalLimits.maxPositionSize}`
            };
        }
        
        return { approved: true };
    }
    
    /**
     * 检查风险等级
     */
    async checkRiskLevel(opportunity, config) {
        const riskLevel = opportunity.riskLevel || 1;
        
        // 检查配置的风险等级限制
        if (config.maxRiskLevel && riskLevel > config.maxRiskLevel) {
            return {
                approved: false,
                reason: `风险等级 ${riskLevel} 超过配置限制 ${config.maxRiskLevel}`
            };
        }
        
        // 检查全局风险等级限制
        if (riskLevel > this.globalLimits.maxRiskLevel) {
            return {
                approved: false,
                reason: `风险等级 ${riskLevel} 超过全局限制 ${this.globalLimits.maxRiskLevel}`
            };
        }
        
        return { approved: true };
    }
    
    /**
     * 检查市场风险
     */
    async checkMarketRisk(market) {
        // 检查市场状态
        if (market.expired) {
            return {
                approved: false,
                reason: '市场已关闭或过期'
            };
        }
        
        // 检查结束时间
        const now = Date.now();
        const endTime = new Date(market.endDate).getTime();
        const timeToEnd = endTime - now;
        
        if (timeToEnd < 60000) { // 1分钟内结束
            return {
                approved: false,
                reason: '市场即将结束，时间风险过高'
            };
        }
        
        // 检查流动性风险
        if (market.liquidity !== undefined && market.liquidity < 10) {
            return {
                approved: false,
                reason: `市场流动性过低: ${market.liquidity}`
            };
        }
        
        return { approved: true };
    }
    
    /**
     * 检查账户风险
     */
    async checkAccountRisk(accountRiskState, opportunity) {
        const amount = opportunity.amount || opportunity.arbitrageAmount || 0;
        
        // 检查账户当日损失
        if (accountRiskState.dailyLoss + amount > this.globalLimits.maxDailyLoss) {
            return {
                approved: false,
                reason: `账户当日潜在损失超限: ${accountRiskState.dailyLoss + amount} > ${this.globalLimits.maxDailyLoss}`
            };
        }
        
        // 检查并发仓位数
        if (accountRiskState.activePositions >= this.globalLimits.maxConcurrentPositions) {
            return {
                approved: false,
                reason: `账户并发仓位数超限: ${accountRiskState.activePositions} >= ${this.globalLimits.maxConcurrentPositions}`
            };
        }
        
        // 检查账户总风险敞口
        const totalExposure = accountRiskState.totalExposure + amount;
        const maxExposure = this.globalLimits.maxPositionSize * 3; // 最大敞口为单仓限制的3倍
        
        if (totalExposure > maxExposure) {
            return {
                approved: false,
                reason: `账户总风险敞口超限: ${totalExposure} > ${maxExposure}`
            };
        }
        
        return { approved: true };
    }
    
    /**
     * 检查全局风险
     */
    async checkGlobalRisk(opportunity) {
        // 这里可以添加全局风险检查逻辑
        // 例如：系统总敞口、市场波动性等
        
        return { approved: true };
    }
    
    /**
     * 检查时间风险
     */
    async checkTimeRisk(market) {
        const now = Date.now();
        const endTime = new Date(market.endDate).getTime();
        const timeToEnd = endTime - now;
        
        // 检查是否在交易时间内
        const currentHour = new Date().getHours();
        if (currentHour < 6 || currentHour > 22) { // 非交易时间
            return {
                approved: false,
                reason: '当前时间不在建议交易时间内'
            };
        }
        
        // 检查市场结束时间是否合理
        if (timeToEnd > 30 * 24 * 60 * 60 * 1000) { // 30天后
            return {
                approved: false,
                reason: '市场结束时间过远，时间风险过高'
            };
        }
        
        return { approved: true };
    }
    
    /**
     * 检查流动性风险
     */
    async checkLiquidityRisk(market) {
        // 检查市场流动性
        if (market.liquidity !== undefined) {
            if (market.liquidity < 50) {
                return {
                    approved: false,
                    reason: `市场流动性不足: ${market.liquidity} < 50`
                };
            }
        }
        
        // 检查交易量
        if (market.volume !== undefined) {
            if (market.volume < 10) {
                return {
                    approved: false,
                    reason: `市场交易量不足: ${market.volume} < 10`
                };
            }
        }
        
        return { approved: true };
    }
    
    /**
     * 获取账户风险状态
     */
    getAccountRiskState(accountId) {
        if (!this.accountRiskStates.has(accountId)) {
            this.accountRiskStates.set(accountId, {
                dailyLoss: 0,
                activePositions: 0,
                totalExposure: 0,
                lastResetDate: new Date().toDateString(),
                riskScore: 0
            });
        }
        
        const riskState = this.accountRiskStates.get(accountId);
        
        // 检查是否需要重置每日统计
        const today = new Date().toDateString();
        if (riskState.lastResetDate !== today) {
            riskState.dailyLoss = 0;
            riskState.lastResetDate = today;
        }
        
        return riskState;
    }
    
    /**
     * 更新账户风险状态
     */
    updateAccountRiskState(accountId, opportunity) {
        const riskState = this.getAccountRiskState(accountId);
        const amount = opportunity.amount || opportunity.arbitrageAmount || 0;
        
        // 更新风险敞口
        riskState.totalExposure += amount;
        riskState.activePositions += 1;
        
        // 更新风险评分
        riskState.riskScore = this.calculateAccountRiskScore(riskState);
    }
    
    /**
     * 计算账户风险评分
     */
    calculateAccountRiskScore(riskState) {
        let score = 0;
        
        // 基于每日损失的评分
        const lossRatio = riskState.dailyLoss / this.globalLimits.maxDailyLoss;
        score += lossRatio * 30;
        
        // 基于活跃仓位数的评分
        const positionRatio = riskState.activePositions / this.globalLimits.maxConcurrentPositions;
        score += positionRatio * 30;
        
        // 基于总敞口的评分
        const exposureRatio = riskState.totalExposure / (this.globalLimits.maxPositionSize * 3);
        score += exposureRatio * 40;
        
        return Math.min(score, 100); // 最高100分
    }
    
    /**
     * 仓位关闭时更新风险状态
     */
    onPositionClosed(accountId, amount, profit) {
        const riskState = this.getAccountRiskState(accountId);
        
        // 更新敞口和仓位数
        riskState.totalExposure = Math.max(0, riskState.totalExposure - amount);
        riskState.activePositions = Math.max(0, riskState.activePositions - 1);
        
        // 如果是亏损，更新每日损失
        if (profit < 0) {
            riskState.dailyLoss += Math.abs(profit);
        }
        
        // 重新计算风险评分
        riskState.riskScore = this.calculateAccountRiskScore(riskState);
    }
    
    /**
     * 获取账户风险报告
     */
    getAccountRiskReport(accountId) {
        const riskState = this.getAccountRiskState(accountId);
        
        return {
            accountId,
            riskScore: riskState.riskScore,
            dailyLoss: riskState.dailyLoss,
            activePositions: riskState.activePositions,
            totalExposure: riskState.totalExposure,
            limits: {
                maxDailyLoss: this.globalLimits.maxDailyLoss,
                maxPositions: this.globalLimits.maxConcurrentPositions,
                maxExposure: this.globalLimits.maxPositionSize * 3
            },
            utilizationRates: {
                dailyLoss: (riskState.dailyLoss / this.globalLimits.maxDailyLoss * 100).toFixed(1) + '%',
                positions: (riskState.activePositions / this.globalLimits.maxConcurrentPositions * 100).toFixed(1) + '%',
                exposure: (riskState.totalExposure / (this.globalLimits.maxPositionSize * 3) * 100).toFixed(1) + '%'
            }
        };
    }
    
    /**
     * 获取风险控制统计
     */
    getRiskStats() {
        const approvalRate = this.riskStats.totalChecks > 0 
            ? (this.riskStats.approvedChecks / this.riskStats.totalChecks * 100).toFixed(1) + '%'
            : '0%';
        
        return {
            ...this.riskStats,
            approvalRate,
            activeAccounts: this.accountRiskStates.size
        };
    }
    
    /**
     * 更新全局风险限制
     */
    updateGlobalLimits(newLimits) {
        this.globalLimits = { ...this.globalLimits, ...newLimits };
        console.log('🔧 全局风险限制已更新:', this.globalLimits);
    }
    
    /**
     * 重置统计信息
     */
    resetStats() {
        this.riskStats = {
            totalChecks: 0,
            approvedChecks: 0,
            rejectedChecks: 0,
            lastCheckTime: null
        };
    }
    
    /**
     * 清理过期的账户风险状态
     */
    cleanupExpiredStates() {
        const today = new Date().toDateString();
        
        for (const [accountId, riskState] of this.accountRiskStates.entries()) {
            // 如果账户超过7天没有活动，清理其状态
            const lastActivity = new Date(riskState.lastResetDate);
            const daysSinceActivity = (Date.now() - lastActivity.getTime()) / (24 * 60 * 60 * 1000);
            
            if (daysSinceActivity > 7) {
                this.accountRiskStates.delete(accountId);
                console.log(`🧹 清理过期账户风险状态: ${accountId}`);
            }
        }
    }
}

export default RiskControlService;