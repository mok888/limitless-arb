import AccountManager from './managers/account-manager.js';
import LimitlessApiClient from './core/api-client.js';
import { generalStrategyConfig } from './config/strategy-config.js';
import { globals } from './coordinators/globals.js';
import StateManager from './managers/state-manager.js';
import StrategyManager from './managers/strategy-manager.js';

class GlobalMain {
    constructor() {
        this.stateManager = new StateManager();
        this.accountManager = new AccountManager(this.stateManager);
        this.strategyManager = new StrategyManager();
        this.globalApiClient = new LimitlessApiClient();
    }

    async initialize() {
        await this.stateManager.initialize();
        await this.accountManager.initialize();
        await this.strategyManager.initialize();

        await this.updateGlobalAccounts();
        setInterval(() => this.updateGlobalAccounts(), 1_000);

        await this.updatePositions(true);
        setInterval(() => this.updateGlobalAccounts(), 10_000);

        await this.updateGlobalMarkets();
        setInterval(() => this.updateGlobalMarkets(), generalStrategyConfig.marketScanInterval);

        setInterval(() => this.updatePositions, 1_000);
        // setInterval(() => this.claimAccountPostitions(), 60_000);

        await this.strategyManager.initializeStrategies();
        await this.strategyManager.startAll();
    }

    async updateGlobalMarkets() {
        try {
            const markets = await this.globalApiClient.getMarkets();
            if (markets.length) {
                globals.markets = markets;
            }
        } catch (err) {
            console.error('Failed to update markets:', err);
        }

        const now = new Date();
        globals.markets = globals.markets.filter(market =>
            !market.expired &&
            new Date(market.endDate) > now
        );
    }

    async updatePositions(raiseException) {
        const globalPositions = []

        try {
            for (const account of globals.accounts) {
                const resp = await account.apiClient.getPortfolioPositions();
                if (resp.success) {
                    const positions = resp.data.amm;
                    for (const position of positions) {
                        globalPositions.push({
                            account,
                            position,
                        })
                    }
                }
            }
        } catch (err) {
            if (raiseException) {
                throw err
            }
        }

        globals.posistions = globalPositions
    }

    async updateGlobalAccounts() {
        await this.accountManager.loadAccountsFromState();
        globals.accounts = this.accountManager.getActiveAccounts();
    }

    // async claimAccountPostitions() {
    //     const now = new Date();
    //     const minutes = now.getMinutes();

    //     // 检查是否在20-40分钟之间
    //     if (minutes >= 20 && minutes <= 40) {
    //         for (const account of globals.accounts) {
    //             try {
    //                 const resp = await account.apiClient.getPortfolioPositions();
    //                 if (resp.success) {
    //                     const positions = resp.data.amm;
    //                     for (const position of positions) {
    //                         const market = position.market;
    //                         const isMarketClosed = market.closed;
    //                         const conditionId = market.conditionId;
    //                         if (isMarketClosed) {
    //                             await account.apiClient.claimPosition(conditionId);
    //                         }
    //                     }
    //                 }
    //             } catch (error)  {
    //                 console.error(error.message)
    //             }
    //         }
    //     }
    // }
}


// CLI模式运行
async function main() {
    console.log('🚀 启动全局协调系统 CLI...');

    try {
        const system = new GlobalMain();
        await system.initialize();
        // await system.start();

        // 保持运行
        console.log('\n💡 系统正在运行，按 Ctrl+C 停止');

    } catch (error) {
        console.error('❌ 系统启动失败:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('❌ 未捕获的异常:', error.message);
    console.error(error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ 未处理的Promise拒绝:', reason);
    process.exit(1);
});

main()
