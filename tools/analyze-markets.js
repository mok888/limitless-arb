import { initializeConfig } from '../src/core/config.js';
import LimitlessApiClient from '../src/core/api-client.js';

/**
 * 详细的市场分析工具
 */
async function analyzeMarkets() {
    try {
        console.log('🔬 Detailed Market Analysis');
        console.log('============================');
        
        await initializeConfig();
        const apiClient = new LimitlessApiClient();
        
        // 获取所有市场数据
        console.log('📡 Fetching all market data...');
        
        // 直接调用getMarkets，它会打印详细的分析信息
        const qualifiedMarkets = await apiClient.getMarkets();
        
        console.log(`\n📊 Analysis completed. Found ${qualifiedMarkets.length} qualified markets.`);
        
        // 建议
        console.log('\n💡 Recommendations:');
        if (qualifiedMarkets.length === 0) {
            console.log('   • No qualified markets currently available');
            console.log('   • Markets may lack liquidity rewards or be expired');
            console.log('   • Check back later for new markets with rewards');
            console.log('   • Consider adjusting reward thresholds if needed');
        } else {
            console.log(`   • ${qualifiedMarkets.length} markets are ready for trading`);
            console.log('   • Run the main system to start monitoring: npm start');
            console.log('   • Monitor system logs for trading opportunities');
        }
        
        return {
            qualified: qualifiedMarkets.length,
            markets: qualifiedMarkets
        };
        
    } catch (error) {
        console.error('❌ Market analysis failed:', error.message);
        throw error;
    }
}

// 如果直接运行此文件
if (import.meta.url === `file://${process.argv[1]}`) {
    analyzeMarkets().catch(error => {
        console.error('Analysis failed:', error.message);
        process.exit(1);
    });
}

export { analyzeMarkets };