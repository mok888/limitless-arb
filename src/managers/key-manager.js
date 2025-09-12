/**
 * 密钥管理器 - 安全地存储和管理私钥
 */

import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

class KeyManager {
    constructor() {
        this.algorithm = 'aes-256-gcm';
        this.keyLength = 32;
        this.ivLength = 16;
        this.tagLength = 16;
        this.keysDir = '.kiro/secure';
        this.keysFile = path.join(this.keysDir, 'keys.enc');
        this.masterKey = null;
    }

    /**
     * 初始化密钥管理器
     */
    async initialize() {
        try {
            // 确保安全目录存在
            await fs.mkdir(this.keysDir, { recursive: true });
            
            // 生成或加载主密钥
            await this.initializeMasterKey();
            
            console.log('🔐 密钥管理器初始化完成');
        } catch (error) {
            console.error('❌ 密钥管理器初始化失败:', error.message);
            throw error;
        }
    }

    /**
     * 初始化主密钥
     */
    async initializeMasterKey() {
        // 在实际应用中，主密钥应该从环境变量或安全存储中获取。这里为了演示，使用固定的密钥（生产环境中不要这样做）
        const masterKeySource = process.env.MASTER_KEY || 'default_master_key_for_demo_only';
        
        // 使用 PBKDF2 从主密钥源派生实际的加密密钥
        this.masterKey = crypto.pbkdf2Sync(masterKeySource, 'salt', 100000, this.keyLength, 'sha256');
        
        console.log('🔑 主密钥已初始化');
    }

    /**
     * 加密数据
     */
    encrypt(data) {
        try {
            const iv = crypto.randomBytes(this.ivLength);
            const cipher = crypto.createCipheriv('aes-256-cbc', this.masterKey, iv);
            
            let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
            encrypted += cipher.final('hex');
            
            return {
                iv: iv.toString('hex'),
                encrypted: encrypted
            };
        } catch (error) {
            console.error('❌ 数据加密失败:', error.message);
            throw error;
        }
    }

    /**
     * 解密数据
     */
    decrypt(encryptedData) {
        try {
            const { iv, encrypted } = encryptedData;
            
            const decipher = crypto.createDecipheriv('aes-256-cbc', this.masterKey, Buffer.from(iv, 'hex'));
            
            let decrypted = decipher.update(encrypted, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            
            return JSON.parse(decrypted);
        } catch (error) {
            console.error('❌ 数据解密失败:', error.message);
            throw error;
        }
    }

    /**
     * 保存私钥到加密文件
     */
    async saveKeys(keys) {
        try {
            console.log('💾 保存私钥到加密文件...');
            
            const encryptedData = this.encrypt(keys);
            await fs.writeFile(this.keysFile, JSON.stringify(encryptedData, null, 2));
            
            console.log('✅ 私钥已安全保存');
        } catch (error) {
            console.error('❌ 保存私钥失败:', error.message);
            throw error;
        }
    }

    /**
     * 从加密文件加载私钥
     */
    async loadKeys() {
        try {
            const encryptedContent = await fs.readFile(this.keysFile, 'utf8');
            const encryptedData = JSON.parse(encryptedContent);
            
            const keys = this.decrypt(encryptedData);

            return keys;
        } catch (error) {
            if (error.code === 'ENOENT') {
                console.log('📝 未找到私钥文件，返回空对象');
                return {};
            }
            console.error('❌ 加载私钥失败:', error.message);
            throw error;
        }
    }

    /**
     * 添加账户私钥
     */
    async addAccountKey(accountId, privateKey) {
        try {
            const keys = await this.loadKeys();
            keys[accountId] = privateKey;
            await this.saveKeys(keys);
            
            console.log(`🔑 账户 ${accountId} 的私钥已保存`);
        } catch (error) {
            console.error(`❌ 保存账户 ${accountId} 私钥失败:`, error.message);
            throw error;
        }
    }

    /**
     * 获取账户私钥
     */
    async getAccountKey(accountId) {
        try {
            const keys = await this.loadKeys();
            return keys[accountId] || null;
        } catch (error) {
            console.error(`❌ 获取账户 ${accountId} 私钥失败:`, error.message);
            throw error;
        }
    }

    /**
     * 删除账户私钥
     */
    async removeAccountKey(accountId) {
        try {
            const keys = await this.loadKeys();
            delete keys[accountId];
            await this.saveKeys(keys);
            
            console.log(`🗑️ 账户 ${accountId} 的私钥已删除`);
        } catch (error) {
            console.error(`❌ 删除账户 ${accountId} 私钥失败:`, error.message);
            throw error;
        }
    }

    /**
     * 检查私钥文件是否存在
     */
    async keysFileExists() {
        try {
            await fs.access(this.keysFile);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * 获取所有账户ID（不返回私钥）
     */
    async getAccountIds() {
        try {
            const keys = await this.loadKeys();
            return Object.keys(keys);
        } catch (error) {
            console.error('❌ 获取账户ID列表失败:', error.message);
            return [];
        }
    }

    /**
     * 验证私钥格式
     */
    validatePrivateKey(privateKey) {
        if (!privateKey || typeof privateKey !== 'string') {
            return false;
        }
        
        // 检查是否为有效的以太坊私钥格式
        const privateKeyRegex = /^0x[a-fA-F0-9]{64}$/;
        return privateKeyRegex.test(privateKey);
    }

    /**
     * 生成随机私钥（仅用于测试）
     */
    generateRandomPrivateKey() {
        const randomBytes = crypto.randomBytes(32);
        return '0x' + randomBytes.toString('hex');
    }
}

export default KeyManager;