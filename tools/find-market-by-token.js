import { initializeConfig } from '../src/core/config.js';
import LimitlessApiClient from '../src/core/api-client.js';

async function findMarketByToken() {
    try {
        // 要查找的 tokenId - 请手动填充
        const targetTokenId = '2734294914702244346688433520307073021014372632653330743987521241750870498110';  // 例如: '123456789'
        
        if (targetTokenId === 'YOUR_TOKEN_ID_HERE') {
            console.log('❌ 请先设置要查找的 tokenId');
            return;
        }
        
        // 初始化配置和客户端
        await initializeConfig();
        const apiClient = new LimitlessApiClient();
        
        // 获取所有市场数据
        const markets = await apiClient.getMarkets();
        
        // 查找匹配的市场
        const matchedMarket = markets.find(market => market.tokenId === targetTokenId);
        
        if (matchedMarket) {
            console.log(`✅ 找到匹配的市场:\n`);
            console.log(`标题: ${matchedMarket.title}`);
            console.log(`Token ID: ${matchedMarket.tokenId}`);
            console.log(`Market Slug: ${matchedMarket.slug}`);
            console.log(`Token Type: ${matchedMarket.tokenType}`);
            console.log(`结束时间: ${matchedMarket.endDate}`);
            console.log(`是否有奖励: ${matchedMarket.isRewardable ? 'Yes' : 'No'}`);
            
            // 显示价格信息
            if (matchedMarket.tradePrices && matchedMarket.tokenIndex !== undefined) {
                const tp = matchedMarket.tradePrices;
                const idx = matchedMarket.tokenIndex;
                if (tp.buy && tp.sell) {
                    console.log(`当前买价: ${tp.buy.limit?.[idx] || 'N/A'}`);
                    console.log(`当前卖价: ${tp.sell.limit?.[idx] || 'N/A'}`);
                }
            }
            
            // 显示市场设置信息
            if (matchedMarket.settings) {
                console.log(`\n市场设置:`);
                console.log(`  最小订单: ${parseInt(matchedMarket.settings.minSize) / 1000000} USDC`);
                console.log(`  最大价差: ${matchedMarket.settings.maxSpread}`);
                console.log(`  日奖励: ${matchedMarket.settings.dailyReward} USDC`);
                console.log(`  奖励周期: ${matchedMarket.settings.rewardsEpoch} 天`);
            }
            
        } else {
            console.log(`❌ 未找到 tokenId 为 "${targetTokenId}" 的市场`);
            console.log(`\n提示: 在 ${markets.length} 个市场中搜索，请确认 tokenId 正确`);
        }
        
    } catch (error) {
        console.error('❌ 错误:', error.message);
    }
}

findMarketByToken();