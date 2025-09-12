/**
 * 策略级协调器
 * 管理策略级的仓位数量上限和多账户轮换机制
 */

import EventEmitter from 'events';

export class StrategyLevelCoordinator extends EventEmitter {
    constructor() {
        super();

        // 策略级配置 strategyType -> config
        this.strategyConfigs = new Map();

        // 策略级仓位管理 strategyType -> Set<positionId>
        this.strategyPositions = new Map();

        // 账户执行历史 strategyType -> Map<accountId, lastExecutionTime>
        this.accountExecutionHistory = new Map();

        // 账户执行器注册表 accountId -> executor
        this.accountExecutors = new Map();

        // 统计信息
        this.stats = {
            totalOpportunitiesReceived: 0,
            totalOpportunitiesSkipped: 0,
            totalOpportunitiesExecuted: 0,
            accountRotationCount: 0,
            strategyStats: new Map() // strategyType -> stats
        };
    }

    /**
     * 注册账户执行器
     */
    registerAccountExecutor(accountId, executor) {
        console.log(`📝 策略级协调器注册账户执行器: ${accountId}`);
        this.accountExecutors.set(accountId, executor);

        // 监听账户执行器的仓位事件
        executor.on('tradeExecuted', (event) => {
            this.handleTradeExecuted(event);
        });

        executor.on('positionSettled', (event) => {
            this.handlePositionSettled(event);
        });

        this.emit('executorRegistered', { accountId });
    }

    /**
     * 取消注册账户执行器
     */
    unregisterAccountExecutor(accountId) {
        console.log(`📝 策略级协调器取消注册账户执行器: ${accountId}`);
        this.accountExecutors.delete(accountId);

        // 清理执行历史
        for (const [strategyType, history] of this.accountExecutionHistory.entries()) {
            history.delete(accountId);
        }

        this.emit('executorUnregistered', { accountId });
    }

    /**
     * 设置策略级配置
     */
    setStrategyConfig(strategyType, config) {
        console.log(`🔧 设置策略级配置: ${strategyType}`);
        console.log(`   最大并发仓位: ${config.maxConcurrentPositions}`);

        this.strategyConfigs.set(strategyType, {
            ...config,
            updatedAt: Date.now()
        });

        // 初始化策略相关的数据结构
        if (!this.strategyPositions.has(strategyType)) {
            this.strategyPositions.set(strategyType, new Set());
        }

        if (!this.accountExecutionHistory.has(strategyType)) {
            this.accountExecutionHistory.set(strategyType, new Map());
        }

        if (!this.stats.strategyStats.has(strategyType)) {
            this.stats.strategyStats.set(strategyType, {
                opportunitiesReceived: 0,
                opportunitiesSkipped: 0,
                opportunitiesExecuted: 0,
                positionsOpened: 0,
                positionsClosed: 0,
                accountRotations: 0
            });
        }

        this.emit('strategyConfigUpdated', { strategyType, config });
    }

    /**
     * 协调策略机会分发
     * 这是核心方法，实现策略级仓位上限控制和账户轮换
     */
    async coordinateOpportunityDistribution(strategyType, opportunities) {
        const config = this.strategyConfigs.get(strategyType);
        if (!config) {
            console.warn(`⚠️ 策略 ${strategyType} 未配置，跳过协调`);
            return { distributed: 0, skipped: opportunities.length };
        }

        const strategyStats = this.stats.strategyStats.get(strategyType);
        strategyStats.opportunitiesReceived += opportunities.length;
        this.stats.totalOpportunitiesReceived += opportunities.length;

        console.log(`🎯 策略级协调器处理 ${opportunities.length} 个 ${strategyType} 机会`);
        console.log(`   当前策略仓位: ${this.strategyPositions.get(strategyType).size}/${config.maxConcurrentPositions}`);

        let distributedCount = 0;
        let skippedCount = 0;

        for (const opportunity of opportunities) {
            try {
                // 检查策略级仓位上限
                const currentPositions = this.strategyPositions.get(strategyType).size;
                if (currentPositions >= config.maxConcurrentPositions) {
                    console.log(`🚫 策略 ${strategyType} 已达仓位上限 (${currentPositions}/${config.maxConcurrentPositions})，跳过机会`);
                    skippedCount++;
                    strategyStats.opportunitiesSkipped++;
                    this.stats.totalOpportunitiesSkipped++;
                    continue;
                }

                // 选择执行账户（最久未执行账户优先）
                const selectedAccount = this.selectAccountForExecution(strategyType);
                if (!selectedAccount) {
                    console.warn(`⚠️ 策略 ${strategyType} 无可用账户，跳过机会`);
                    skippedCount++;
                    continue;
                }

                console.log(`👤 策略 ${strategyType} 选择账户: ${selectedAccount.accountId} (上次执行: ${selectedAccount.lastExecutionTime ? new Date(selectedAccount.lastExecutionTime).toLocaleString() : '从未执行'})`);

                // 分发给选中的账户
                const success = await this.distributeToAccount(
                    selectedAccount.accountId,
                    strategyType,
                    [opportunity]
                );

                if (success) {
                    distributedCount++;
                    strategyStats.opportunitiesExecuted++;
                    this.stats.totalOpportunitiesExecuted++;

                    // 更新账户执行历史
                    this.updateAccountExecutionHistory(strategyType, selectedAccount.accountId);

                    // 统计账户轮换
                    strategyStats.accountRotations++;
                    this.stats.accountRotationCount++;
                } else {
                    skippedCount++;
                }

            } catch (error) {
                console.error(`❌ 协调机会分发失败:`, error);
                skippedCount++;
            }
        }

        console.log(`✅ 策略级协调完成: 分发 ${distributedCount}，跳过 ${skippedCount}`);

        return {
            distributed: distributedCount,
            skipped: skippedCount,
            totalProcessed: opportunities.length
        };
    }

    /**
     * 选择执行账户（最久未执行账户优先）
     */
    selectAccountForExecution(strategyType) {
        // 获取启用了该策略的账户
        const eligibleAccounts = [];

        for (const [accountId, executor] of this.accountExecutors.entries()) {
            // 检查账户是否启用了该策略
            const strategyConfig = executor.getStrategyConfig(strategyType);
            if (strategyConfig && executor.isRunning) {
                const executionHistory = this.accountExecutionHistory.get(strategyType);
                const lastExecutionTime = executionHistory.get(accountId) || 0;

                eligibleAccounts.push({
                    accountId,
                    executor,
                    lastExecutionTime,
                    strategyConfig
                });
            }
        }

        if (eligibleAccounts.length === 0) {
            return null;
        }

        // 按最后执行时间排序（最久未执行的在前）
        eligibleAccounts.sort((a, b) => a.lastExecutionTime - b.lastExecutionTime);

        // 如果有多个账户都没有执行过（lastExecutionTime = 0），随机选择一个
        const neverExecutedAccounts = eligibleAccounts.filter(acc => acc.lastExecutionTime === 0);
        if (neverExecutedAccounts.length > 1) {
            const randomIndex = Math.floor(Math.random() * neverExecutedAccounts.length);
            return neverExecutedAccounts[randomIndex];
        }

        // 返回最久未执行的账户
        return eligibleAccounts[0];
    }

    /**
     * 分发机会给指定账户
     */
    async distributeToAccount(accountId, strategyType, opportunities) {
        const executor = this.accountExecutors.get(accountId);
        if (!executor) {
            console.error(`❌ 账户执行器未找到: ${accountId}`);
            return false;
        }

        try {
            console.log(`📤 向账户 ${accountId} 分发 ${opportunities.length} 个 ${strategyType} 机会`);

            // 直接调用账户执行器的接收方法
            await executor.receiveOpportunities(strategyType, opportunities);

            return true;

        } catch (error) {
            console.error(`❌ 分发给账户 ${accountId} 失败:`, error);
            return false;
        }
    }

    /**
     * 更新账户执行历史
     */
    updateAccountExecutionHistory(strategyType, accountId) {
        const executionHistory = this.accountExecutionHistory.get(strategyType);
        const now = Date.now();

        executionHistory.set(accountId, now);

        console.log(`📝 更新账户执行历史: ${strategyType} -> ${accountId} (${new Date(now).toLocaleString()})`);
    }

    /**
     * 处理交易执行事件
     */
    handleTradeExecuted(event) {
        const { strategyType, positionId } = event;

        // 添加到策略级仓位跟踪
        const strategyPositions = this.strategyPositions.get(strategyType);
        if (strategyPositions) {
            strategyPositions.add(positionId);

            const strategyStats = this.stats.strategyStats.get(strategyType);
            if (strategyStats) {
                strategyStats.positionsOpened++;
            }

            console.log(`📊 策略 ${strategyType} 新增仓位: ${positionId} (当前总数: ${strategyPositions.size})`);
        }

        this.emit('strategyPositionOpened', {
            strategyType,
            positionId,
            currentPositions: strategyPositions ? strategyPositions.size : 0,
            timestamp: Date.now()
        });
    }

    /**
     * 处理仓位结算事件
     */
    handlePositionSettled(event) {
        const { strategyType, positionId } = event;

        // 从策略级仓位跟踪中移除
        const strategyPositions = this.strategyPositions.get(strategyType);
        if (strategyPositions && strategyPositions.has(positionId)) {
            strategyPositions.delete(positionId);

            const strategyStats = this.stats.strategyStats.get(strategyType);
            if (strategyStats) {
                strategyStats.positionsClosed++;
            }

            console.log(`📊 策略 ${strategyType} 结算仓位: ${positionId} (当前总数: ${strategyPositions.size})`);
        }

        this.emit('strategyPositionClosed', {
            strategyType,
            positionId,
            currentPositions: strategyPositions ? strategyPositions.size : 0,
            timestamp: Date.now()
        });
    }

    /**
     * 获取策略状态
     */
    getStrategyStatus(strategyType) {
        const config = this.strategyConfigs.get(strategyType);
        const positions = this.strategyPositions.get(strategyType);
        const executionHistory = this.accountExecutionHistory.get(strategyType);
        const stats = this.stats.strategyStats.get(strategyType);

        if (!config) {
            return null;
        }

        // 获取账户执行历史详情
        const accountDetails = [];
        if (executionHistory) {
            for (const [accountId, lastExecutionTime] of executionHistory.entries()) {
                const executor = this.accountExecutors.get(accountId);
                accountDetails.push({
                    accountId,
                    lastExecutionTime,
                    lastExecutionTimeFormatted: lastExecutionTime ? new Date(lastExecutionTime).toLocaleString() : '从未执行',
                    isActive: executor ? executor.isRunning : false,
                    hasStrategy: executor ? !!executor.getStrategyConfig(strategyType) : false
                });
            }
        }

        // 按最后执行时间排序
        accountDetails.sort((a, b) => a.lastExecutionTime - b.lastExecutionTime);

        return {
            strategyType,
            config,
            currentPositions: positions ? positions.size : 0,
            maxPositions: config.maxConcurrentPositions,
            positionUtilization: positions && config.maxConcurrentPositions > 0
                ? (positions.size / config.maxConcurrentPositions * 100).toFixed(1) + '%'
                : '0%',
            stats: stats || {},
            accountDetails,
            totalEligibleAccounts: accountDetails.filter(acc => acc.isActive && acc.hasStrategy).length
        };
    }

    /**
     * 获取所有策略状态
     */
    getAllStrategyStatuses() {
        const statuses = {};

        for (const strategyType of this.strategyConfigs.keys()) {
            statuses[strategyType] = this.getStrategyStatus(strategyType);
        }

        return statuses;
    }

    /**
     * 获取协调器整体状态
     */
    getStatus() {
        return {
            registeredExecutors: this.accountExecutors.size,
            configuredStrategies: this.strategyConfigs.size,
            totalActivePositions: Array.from(this.strategyPositions.values())
                .reduce((total, positions) => total + positions.size, 0),
            stats: { ...this.stats },
            strategyStatuses: this.getAllStrategyStatuses()
        };
    }

    /**
     * 打印策略级状态报告
     */
    printStatusReport() {
        console.log('\n📊 策略级协调器状态报告');
        console.log('='.repeat(60));

        const status = this.getStatus();

        console.log(`注册执行器: ${status.registeredExecutors}`);
        console.log(`配置策略数: ${status.configuredStrategies}`);
        console.log(`总活跃仓位: ${status.totalActivePositions}`);
        console.log(`总机会处理: ${status.stats.totalOpportunitiesReceived}`);
        console.log(`总机会执行: ${status.stats.totalOpportunitiesExecuted}`);
        console.log(`总机会跳过: ${status.stats.totalOpportunitiesSkipped}`);
        console.log(`账户轮换次数: ${status.stats.accountRotationCount}`);

        if (status.stats.totalOpportunitiesReceived > 0) {
            const executionRate = (status.stats.totalOpportunitiesExecuted / status.stats.totalOpportunitiesReceived * 100).toFixed(1);
            console.log(`执行成功率: ${executionRate}%`);
        }

        console.log('\n📋 策略详情:');
        for (const [strategyType, strategyStatus] of Object.entries(status.strategyStatuses)) {
            console.log(`\n🎯 ${strategyType}:`);
            console.log(`   仓位使用: ${strategyStatus.currentPositions}/${strategyStatus.maxPositions} (${strategyStatus.positionUtilization})`);
            console.log(`   符合条件账户: ${strategyStatus.totalEligibleAccounts}`);
            console.log(`   机会处理: 收到 ${strategyStatus.stats.opportunitiesReceived}, 执行 ${strategyStatus.stats.opportunitiesExecuted}, 跳过 ${strategyStatus.stats.opportunitiesSkipped}`);
            console.log(`   仓位管理: 开启 ${strategyStatus.stats.positionsOpened}, 关闭 ${strategyStatus.stats.positionsClosed}`);
            console.log(`   账户轮换: ${strategyStatus.stats.accountRotations} 次`);

            if (strategyStatus.accountDetails.length > 0) {
                console.log(`   账户执行顺序 (按最后执行时间排序):`);
                strategyStatus.accountDetails.forEach((account, index) => {
                    const status = account.isActive && account.hasStrategy ? '✅' : '❌';
                    console.log(`     ${index + 1}. ${account.accountId}: ${account.lastExecutionTimeFormatted} ${status}`);
                });
            }
        }

        console.log('='.repeat(60));
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.stats = {
            totalOpportunitiesReceived: 0,
            totalOpportunitiesSkipped: 0,
            totalOpportunitiesExecuted: 0,
            accountRotationCount: 0,
            strategyStats: new Map()
        };

        // 重新初始化策略统计
        for (const strategyType of this.strategyConfigs.keys()) {
            this.stats.strategyStats.set(strategyType, {
                opportunitiesReceived: 0,
                opportunitiesSkipped: 0,
                opportunitiesExecuted: 0,
                positionsOpened: 0,
                positionsClosed: 0,
                accountRotations: 0
            });
        }

        this.emit('statsReset');
    }

    /**
     * 手动触发账户轮换测试
     */
    testAccountRotation(strategyType) {
        console.log(`🧪 测试策略 ${strategyType} 的账户轮换机制...`);

        const selectedAccount = this.selectAccountForExecution(strategyType);
        if (selectedAccount) {
            console.log(`✅ 选中账户: ${selectedAccount.accountId} (上次执行: ${selectedAccount.lastExecutionTime ? new Date(selectedAccount.lastExecutionTime).toLocaleString() : '从未执行'})`);
            return selectedAccount;
        } else {
            console.log(`❌ 无可用账户`);
            return null;
        }
    }
}

export default StrategyLevelCoordinator;