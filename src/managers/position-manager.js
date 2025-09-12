import { ethers } from 'ethers';
import { config } from '../core/config.js';

/**
 * 仓位管理器 - 处理 USDC 与 YES/NO 代币之间的转换
 * 
 * Split: 将 USDC 分割成等量的 YES 和 NO 代币
 * Merge: 将等量的 YES 和 NO 代币合并回 USDC
 */
class PositionManager {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.contractAddress = "0xC9c98965297Bc527861c898329Ee280632B76e18";
        this.collateralToken = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC on Base
        this.parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
        this.partition = [1, 2]; // 对应 YES 和 NO 代币
        
        // 合约 ABI
        this.abi = [
            "function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external",
            "function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external"
        ];
    }

    /**
     * 初始化钱包和合约连接
     */
    async initialize() {
        if (this.wallet && this.contract) {
            return;
        }

        if (!config.AUTH.PRIVATE_KEY) {
            throw new Error('需要私钥来初始化仓位管理器');
        }

        try {
            console.log('🔧 初始化仓位管理器...');
            this.provider = new ethers.JsonRpcProvider(config.RPC_URL);
            this.wallet = new ethers.Wallet(config.AUTH.PRIVATE_KEY, this.provider);
            this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
            
            const walletAddress = await this.wallet.getAddress();
            console.log(`✅ 仓位管理器初始化完成: ${walletAddress}`);
        } catch (error) {
            console.error('❌ 仓位管理器初始化失败:', error.message);
            throw new Error(`仓位管理器初始化失败: ${error.message}`);
        }
    }

    /**
     * 🆕 使用指定钱包初始化仓位管理器
     * @param {ethers.Wallet} wallet - 钱包实例
     */
    async initializeWithWallet(wallet) {
        if (this.wallet && this.contract) {
            return;
        }

        if (!wallet) {
            throw new Error('需要钱包实例来初始化仓位管理器');
        }

        try {
            console.log('🔧 使用账户钱包初始化仓位管理器...');
            this.wallet = wallet;
            this.provider = wallet.provider;
            this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
            
            const walletAddress = await this.wallet.getAddress();
            console.log(`✅ 仓位管理器初始化完成 (账户钱包): ${walletAddress}`);
        } catch (error) {
            console.error('❌ 仓位管理器初始化失败:', error.message);
            throw new Error(`仓位管理器初始化失败: ${error.message}`);
        }
    }

    /**
     * Split 操作 - 将 USDC 分割成 YES 和 NO 代币
     * @param {string} conditionId - 市场条件ID
     * @param {number} usdcAmount - USDC 数量（以 USDC 为单位，如 1.5）
     * @param {boolean} confirmRealTransaction - 必须明确确认这是真实交易
     */
    async splitPosition(conditionId, usdcAmount, confirmRealTransaction = false) {
        // 安全检查：必须明确确认这是真实交易
        if (!confirmRealTransaction) {
            throw new Error('安全检查：您必须设置 confirmRealTransaction=true 来执行真实的 split 交易');
        }

        try {
            console.log('🔄 开始 Split 操作...');
            console.log('⚠️  警告：这将执行真实的区块链交易！');
            await this.initialize();

            // 将 USDC 数量转换为 wei（6位小数）
            const amount = ethers.parseUnits(usdcAmount.toString(), 6);

            // 执行 split 交易
            const tx = await this.contract.splitPosition(
                this.collateralToken,
                this.parentCollectionId,
                conditionId,
                this.partition,
                amount
            );

            // 等待交易确认
            const receipt = await tx.wait();

            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                conditionId,
                usdcAmount,
                receipt
            };

        } catch (error) {
            console.error('❌ Split 操作失败:', error.message);
            throw new Error(`Split 操作失败: ${error.message}`);
        }
    }

    /**
     * Merge 操作 - 将 YES 和 NO 代币合并回 USDC
     * @param {string} conditionId - 市场条件ID
     * @param {number} tokenAmount - 代币数量（以代币为单位，如 1.5）
     * @param {boolean} confirmRealTransaction - 必须明确确认这是真实交易
     */
    async mergePositions(conditionId, tokenAmount, confirmRealTransaction = false) {
        // 安全检查：必须明确确认这是真实交易
        if (!confirmRealTransaction) {
            throw new Error('安全检查：您必须设置 confirmRealTransaction=true 来执行真实的 merge 交易');
        }

        try {
            console.log('🔄 开始 Merge 操作...');
            console.log('⚠️  警告：这将执行真实的区块链交易！');
            await this.initialize();

            // 将代币数量转换为 wei（6位小数）
            const amount = ethers.parseUnits(tokenAmount.toString(), 6);

            // 执行 merge 交易
            const tx = await this.contract.mergePositions(
                this.collateralToken,
                this.parentCollectionId,
                conditionId,
                this.partition,
                amount
            );

            // 等待交易确认
            const receipt = await tx.wait();

            return {
                success: true,
                transactionHash: tx.hash,
                blockNumber: receipt.blockNumber,
                gasUsed: receipt.gasUsed.toString(),
                conditionId,
                tokenAmount,
                receipt
            };

        } catch (error) {
            console.error('❌ Merge 操作失败:', error.message);
            throw new Error(`Merge 操作失败: ${error.message}`);
        }
    }

    /**
     * 获取钱包地址
     */
    async getWalletAddress() {
        await this.initialize();
        return await this.wallet.getAddress();
    }
}

export { PositionManager };