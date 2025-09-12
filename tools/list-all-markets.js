import { initializeConfig } from '../src/core/config.js';
import LimitlessApiClient from '../src/core/api-client.js';

async function listAllMarkets() {
    try {
        // 初始化配置和客户端
        await initializeConfig();
        const apiClient = new LimitlessApiClient();
        
        // 获取所有市场数据
        const markets = await apiClient.getMarkets();
        
        console.log(`找到 ${markets.length} 个市场:\n`);
        
        markets.forEach((market, index) => {
            console.log(`${index + 1}. ${market.title}`);
            console.log(`   Token ID: ${market.tokenId}`);
            console.log(`   Market Slug: ${market.slug}`);
            console.log(`   Token Type: ${market.tokenType}`);
            console.log(`   Rewardable: ${market.isRewardable ? 'Yes' : 'No'}`);
            console.log('');
        });
        
    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

listAllMarkets();