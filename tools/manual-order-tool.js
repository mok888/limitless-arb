import { initializeConfig } from '../src/core/config.js';
import LimitlessApiClient from '../src/core/api-client.js';
import readline from 'readline';

// 创建命令行接口
const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function askQuestion(question) {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer);
        });
    });
}

async function testManualOrder() {
    console.log('🧪 Manual Order Testing Tool');
    console.log('=============================');
    console.log('⚠️  WARNING: This will place REAL orders with REAL money!');
    console.log('⚠️  Only proceed if you understand the risks!');
    console.log('');

    try {
        // 初始化配置
        await initializeConfig();
        console.log('⚙️ Configuration loaded');

        // 创建API客户端
        const apiClient = new LimitlessApiClient();
        console.log('📱 API client created');

        // 认证
        console.log('\n1️⃣ Authenticating...');
        await apiClient.ensureAuthenticated();
        console.log(`✅ Authentication successful!`);
        console.log(`   Wallet Address: ${apiClient.walletAddress}`);
        console.log(`   User ID: ${apiClient.userId}`);

        // 获取市场数据供参考
        console.log('\n2️⃣ Fetching available markets...');
        const markets = await apiClient.getMarkets();
        
        if (markets.length === 0) {
            console.error('❌ No markets available');
            rl.close();
            return;
        }

        console.log(`📊 Found ${markets.length} markets. Here are the first 5:`);
        markets.slice(0, 5).forEach((market, index) => {
            console.log(`   ${index + 1}. ${market.title}`);
            console.log(`      Token ID: ${market.tokenId}`);
            console.log(`      Slug: ${market.slug}`);
            console.log(`      Token Type: ${market.tokenType}`);
            if (market.tradePrices && market.tokenIndex !== undefined) {
                const tp = market.tradePrices;
                const idx = market.tokenIndex;
                console.log(`      Current Bid: ${tp.buy?.limit?.[idx] || 'N/A'}`);
                console.log(`      Current Ask: ${tp.sell?.limit?.[idx] || 'N/A'}`);
            }
            console.log('');
        });

        // 手动输入参数
        console.log('3️⃣ Please specify order parameters:');
        console.log('');

        const tokenId = await askQuestion('Enter Token ID: ');
        const marketSlug = await askQuestion('Enter Market Slug: ');
        const price = parseFloat(await askQuestion('Enter Price (e.g., 0.65 for 65%): '));
        const amount = parseFloat(await askQuestion('Enter Amount in USDC (e.g., 10): '));
        const sideInput = await askQuestion('Enter Side (buy/sell): ');
        const side = sideInput.toLowerCase() === 'buy' ? 0 : 1;

        console.log('\n4️⃣ Order Summary:');
        console.log('==================');
        console.log(`   Token ID: ${tokenId}`);
        console.log(`   Market Slug: ${marketSlug}`);
        console.log(`   Price: ${price.toFixed(4)} (${(price * 100).toFixed(2)}%)`);
        console.log(`   Amount: ${amount} USDC`);
        console.log(`   Side: ${side === 0 ? 'BUY' : 'SELL'}`);
        console.log(`   Total Value: ${(price * amount).toFixed(2)} USDC`);
        console.log('');

        // 最终确认
        const confirm1 = await askQuestion('⚠️  Are you sure you want to place this REAL order? (yes/no): ');
        if (confirm1.toLowerCase() !== 'yes') {
            console.log('❌ Order cancelled by user');
            rl.close();
            return;
        }

        const confirm2 = await askQuestion('⚠️  This is your FINAL confirmation. Type "CONFIRM" to proceed: ');
        if (confirm2 !== 'CONFIRM') {
            console.log('❌ Order cancelled - confirmation not received');
            rl.close();
            return;
        }

        // 下单
        console.log('\n5️⃣ Placing order...');
        const orderParams = {
            tokenId: tokenId,
            price: price,
            quantity: amount, // 使用 quantity 而不是 amount
            side: side,
            marketSlug: marketSlug,
            confirmRealOrder: true // 明确确认这是真实订单
        };

        try {
            const result = await apiClient.placeLimitOrder(orderParams);
            
            if (result && result.success && result.orderId) {
                console.log('✅ Order placed successfully!');
                console.log(`   Order ID: ${result.orderId}`);
                console.log(`   Response: ${JSON.stringify(result.response?.order, null, 2)}`);
                
                // 询问是否要获取订单信息
                const getInfo = await askQuestion('\n📋 Do you want to retrieve order information? (yes/no): ');
                if (getInfo.toLowerCase() === 'yes') {
                    console.log('📡 Retrieving order information...');
                    try {
                        const orderInfo = await apiClient.getOrder(result.orderId);
                        if (orderInfo) {
                            console.log('✅ Order information retrieved:');
                            console.log(`   ID: ${orderInfo.id}`);
                            console.log(`   Status: ${orderInfo.status}`);
                            console.log(`   Side: ${orderInfo.side === 0 ? 'BUY' : 'SELL'}`);
                            console.log(`   Price: ${orderInfo.price}`);
                            console.log(`   Size: ${orderInfo.size}`);
                        } else {
                            console.log('⚠️ Could not retrieve order information');
                        }
                    } catch (getOrderError) {
                        console.log(`⚠️ Error retrieving order: ${getOrderError.message}`);
                    }
                }
                
                // 询问是否要取消订单
                const cancelOrder = await askQuestion('\n🗑️  Do you want to cancel this order? (yes/no): ');
                if (cancelOrder.toLowerCase() === 'yes') {
                    console.log('📡 Cancelling order...');
                    try {
                        const cancelResult = await apiClient.cancelOrder(result.orderId);
                        if (cancelResult) {
                            console.log('✅ Order cancelled successfully!');
                        } else {
                            console.log('❌ Order cancellation failed');
                        }
                    } catch (cancelError) {
                        console.log(`❌ Error cancelling order: ${cancelError.message}`);
                    }
                }
                
            } else {
                console.log('❌ Order placement failed - no order ID returned');
                if (result) {
                    console.log('Response success:', result.success);
                    console.log('Response data:', JSON.stringify(result.response, null, 2));
                }
            }
            
        } catch (orderError) {
            console.error('❌ Order placement failed:', orderError.message);
            
            // 提供详细的错误分析
            if (orderError.message.includes('400')) {
                console.log('🔍 400 Bad Request - Possible issues:');
                console.log('  - Invalid order format');
                console.log('  - Invalid signature');
                console.log('  - Invalid token ID or market data');
                console.log('  - Price/amount calculation errors');
            } else if (orderError.message.includes('401')) {
                console.log('🔍 401 Unauthorized - Authentication issue');
            } else if (orderError.message.includes('500')) {
                console.log('🔍 500 Server Error - Server-side issue');
            }
        }

        console.log('\n🎉 Test completed!');

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error('Stack trace:', error.stack);
    } finally {
        rl.close();
    }
}

// 运行测试
testManualOrder().catch(error => {
    console.error('💥 Fatal error:', error.message);
    rl.close();
    process.exit(1);
});