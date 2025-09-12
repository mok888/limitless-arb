import { PositionManager } from '../src/managers/position-manager.js';

/**
 * 仓位管理工具
 * 用于手动执行 Split 和 Merge 操作
 * 
 * 使用方法:
 * node tools/position-management-tool.js split <conditionId> <usdcAmount>
 * node tools/position-management-tool.js merge <conditionId> <tokenAmount>
 * node tools/position-management-tool.js estimate <conditionId> <amount>
 */

async function showUsage() {
    console.log('📖 仓位管理工具使用说明');
    console.log('=' .repeat(50));
    console.log('');
    console.log('🔄 Split 操作 (将 USDC 分割成 YES/NO 代币):');
    console.log('   node tools/position-management-tool.js split <conditionId> <usdcAmount>');
    console.log('   例如: node tools/position-management-tool.js split 0x88973a09fa49e6429f18ed09f32db7fee26a79a3f3dd5f1e3e20c38885db53e8 1.5');
    console.log('');
    console.log('🔄 Merge 操作 (将 YES/NO 代币合并回 USDC):');
    console.log('   node tools/position-management-tool.js merge <conditionId> <tokenAmount>');
    console.log('   例如: node tools/position-management-tool.js merge 0x88973a09fa49e6429f18ed09f32db7fee26a79a3f3dd5f1e3e20c38885db53e8 1.5');
    console.log('');
    console.log('📊 Gas 估算:');
    console.log('   node tools/position-management-tool.js estimate <conditionId> <amount>');
    console.log('   例如: node tools/position-management-tool.js estimate 0x88973a09fa49e6429f18ed09f32db7fee26a79a3f3dd5f1e3e20c38885db53e8 1.0');
    console.log('');
    console.log('⚠️  注意: Split 和 Merge 操作将执行真实的区块链交易！');
}

async function executeSplit(conditionId, usdcAmount) {
    console.log('🔄 执行 Split 操作');
    console.log('=' .repeat(50));
    console.log(`条件ID: ${conditionId}`);
    console.log(`USDC 数量: ${usdcAmount}`);
    console.log('');
    
    // 确认操作
    console.log('⚠️  警告: 这将执行真实的区块链交易，使用真实的 USDC！');
    console.log('⚠️  请确认您有足够的 USDC 余额和 ETH 作为 Gas 费用');
    console.log('');
    console.log('如果您确定要继续，请在 5 秒内按 Ctrl+C 取消...');
    
    // 等待 5 秒
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
        const positionManager = new PositionManager();
        
        // 先估算 Gas
        console.log('📊 估算 Gas 费用...');
        const gasEstimate = await positionManager.estimateSplitGas(conditionId, parseFloat(usdcAmount));
        if (gasEstimate) {
            console.log(`预估 Gas: ${gasEstimate}`);
        }
        
        // 执行 Split
        const result = await positionManager.splitPosition(
            conditionId, 
            parseFloat(usdcAmount), 
            true // 明确确认这是真实交易
        );
        
        console.log('🎉 Split 操作成功完成！');
        console.log(`交易哈希: ${result.transactionHash}`);
        console.log(`区块号: ${result.blockNumber}`);
        console.log(`Gas 使用: ${result.gasUsed}`);
        
    } catch (error) {
        console.error('❌ Split 操作失败:', error.message);
        process.exit(1);
    }
}

async function executeMerge(conditionId, tokenAmount) {
    console.log('🔄 执行 Merge 操作');
    console.log('=' .repeat(50));
    console.log(`条件ID: ${conditionId}`);
    console.log(`代币数量: ${tokenAmount}`);
    console.log('');
    
    // 确认操作
    console.log('⚠️  警告: 这将执行真实的区块链交易，使用真实的 YES/NO 代币！');
    console.log('⚠️  请确认您有足够的 YES 和 NO 代币余额和 ETH 作为 Gas 费用');
    console.log('');
    console.log('如果您确定要继续，请在 5 秒内按 Ctrl+C 取消...');
    
    // 等待 5 秒
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    try {
        const positionManager = new PositionManager();
        
        // 先估算 Gas
        console.log('📊 估算 Gas 费用...');
        const gasEstimate = await positionManager.estimateMergeGas(conditionId, parseFloat(tokenAmount));
        if (gasEstimate) {
            console.log(`预估 Gas: ${gasEstimate}`);
        }
        
        // 执行 Merge
        const result = await positionManager.mergePositions(
            conditionId, 
            parseFloat(tokenAmount), 
            true // 明确确认这是真实交易
        );
        
        console.log('🎉 Merge 操作成功完成！');
        console.log(`交易哈希: ${result.transactionHash}`);
        console.log(`区块号: ${result.blockNumber}`);
        console.log(`Gas 使用: ${result.gasUsed}`);
        
    } catch (error) {
        console.error('❌ Merge 操作失败:', error.message);
        process.exit(1);
    }
}

async function estimateGas(conditionId, amount) {
    console.log('📊 估算 Gas 费用');
    console.log('=' .repeat(50));
    console.log(`条件ID: ${conditionId}`);
    console.log(`数量: ${amount}`);
    console.log('');
    
    try {
        const positionManager = new PositionManager();
        
        // 估算 Split Gas
        console.log('🔄 估算 Split Gas...');
        const splitGas = await positionManager.estimateSplitGas(conditionId, parseFloat(amount));
        if (splitGas) {
            console.log(`Split Gas 估算: ${splitGas}`);
        } else {
            console.log('Split Gas 估算失败');
        }
        
        // 估算 Merge Gas
        console.log('🔄 估算 Merge Gas...');
        const mergeGas = await positionManager.estimateMergeGas(conditionId, parseFloat(amount));
        if (mergeGas) {
            console.log(`Merge Gas 估算: ${mergeGas}`);
        } else {
            console.log('Merge Gas 估算失败');
        }
        
        // 显示钱包信息
        const walletAddress = await positionManager.getWalletAddress();
        console.log(`钱包地址: ${walletAddress}`);
        
    } catch (error) {
        console.error('❌ Gas 估算失败:', error.message);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        await showUsage();
        return;
    }
    
    const command = args[0].toLowerCase();
    
    switch (command) {
        case 'split':
            if (args.length !== 3) {
                console.error('❌ Split 命令需要 2 个参数: <conditionId> <usdcAmount>');
                await showUsage();
                process.exit(1);
            }
            await executeSplit(args[1], args[2]);
            break;
            
        case 'merge':
            if (args.length !== 3) {
                console.error('❌ Merge 命令需要 2 个参数: <conditionId> <tokenAmount>');
                await showUsage();
                process.exit(1);
            }
            await executeMerge(args[1], args[2]);
            break;
            
        case 'estimate':
            if (args.length !== 3) {
                console.error('❌ Estimate 命令需要 2 个参数: <conditionId> <amount>');
                await showUsage();
                process.exit(1);
            }
            await estimateGas(args[1], args[2]);
            break;
            
        default:
            console.error(`❌ 未知命令: ${command}`);
            await showUsage();
            process.exit(1);
    }
}

// 运行主函数
main().catch(error => {
    console.error('❌ 工具执行失败:', error.message);
    process.exit(1);
});