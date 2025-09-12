/**
 * 市场发现服务
 * 重构后作为通用的市场数据提供者
 * 具体的市场筛选逻辑移到各个策略类中实现
 */

export class MarketDiscoveryService {
    constructor(apiClient) {
        this.apiClient = apiClient;

        this.discoveryStats = {
            totalFetches: 0,
            lastFetchTime: null
        };
    }

    /**
     * 获取所有市场数据（直接从API获取，不使用缓存）
     * @returns {Array} 市场数据数组
     */
    async getMarkets() {
        try {
            console.log('📡 获取最新市场数据...');

            const markets = await this.apiClient.getMarkets();

            if (!markets || markets.length === 0) {
                console.log('⚠️ 未获取到任何市场数据');
                return [];
            }

            // 更新统计
            this.discoveryStats.totalFetches++;
            this.discoveryStats.lastFetchTime = Date.now();

            console.log(`📊 获取到 ${markets.length} 个市场数据`);

            return markets;

        } catch (error) {
            console.error('❌ 获取市场数据失败:', error.message);
            return [];
        }
    }

    /**
     * 为策略提供市场数据
     * @param {string} strategyType - 策略类型
     * @returns {Array} 市场数据
     */
    async getMarketsForStrategy(strategyType) {
        console.log(`🔍 [市场发现] 为策略 ${strategyType} 获取市场数据...`);

        const markets = await this.getMarkets();

        if (markets.length === 0) {
            console.log(`⚠️ 策略 ${strategyType} 未获取到市场数据`);
            return [];
        }

        console.log(`📊 为策略 ${strategyType} 提供 ${markets.length} 个市场数据`);
        return markets;
    }



    /**
     * 获取发现统计
     */
    getDiscoveryStats() {
        return {
            ...this.discoveryStats
        };
    }

    /**
     * 重置统计信息
     */
    resetStats() {
        this.discoveryStats = {
            totalFetches: 0,
            lastFetchTime: null
        };
    }
}

export default MarketDiscoveryService;