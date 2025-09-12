import axios from 'axios';
import { ethers } from 'ethers';
import Decimal from 'decimal.js';

import { config } from './config.js';
import proxyManager from '../managers/proxy-manager.js';

// EIP-712 域数据
const domain = {
    name: 'Limitless CTF Exchange',
    version: '1',
    chainId: 8453,
    // verifyingContract: '0xa4409d988ca2218d956beefd3874100f444f0dc3'
    verifyingContract: '0x5a38afc17f7e97ad8d6c547ddb837e40b4aedfc6'
};

// 0x5a38afc17f7e97ad8d6c547ddb837e40b4aedfc6

// EIP-712 类型定义
const types = {
    Order: [
        { name: 'salt', type: 'uint256' },
        { name: 'maker', type: 'address' },
        { name: 'signer', type: 'address' },
        { name: 'taker', type: 'address' },
        { name: 'tokenId', type: 'uint256' },
        { name: 'makerAmount', type: 'uint256' },
        { name: 'takerAmount', type: 'uint256' },
        { name: 'expiration', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'feeRateBps', type: 'uint256' },
        { name: 'side', type: 'uint8' },
        { name: 'signatureType', type: 'uint8' }
    ]
};

class LimitlessApiClient {
    constructor(accountConfig = null) {
        // 代理管理
        this.proxyManager = proxyManager;

        // 多账户支持：每个客户端实例对应一个账户
        this.accountConfig = accountConfig;
        this.accountId = accountConfig?.id || null;

        this.privateKey = accountConfig?.privateKey || null;
        this.walletAddress = null;
        this.wallet = null;

        this.userId = null;
        this.isAuthenticated = false;
        this.sessionCookie = null; // 手动管理session cookie
    }

    async request(options) {
        const {
            method = 'get',
            url,
            data = null,
            params = null,
            needAuth = false,
            useProxy = false,
            headers = {}
        } = options;

        if (needAuth) {
            await this.ensureAuthenticated();
        }

        // 组装 headers
        const mergedHeaders = { ...headers };
        if (needAuth && this.sessionCookie) {
            mergedHeaders.Cookie = this.sessionCookie;
        }

        // 组装 axios 配置
        let axiosConfig = {
            baseURL: config.API.BASE_URL,
            method,
            url,
            headers: mergedHeaders,
            ...(data ? { data } : {}),
            ...(params ? { params } : {})
        };

        if (useProxy) {
            const proxyConfig = await this.proxyManager.createProxyConfig();
            if (proxyConfig.httpsAgent) {
                axiosConfig.httpsAgent = proxyConfig.httpsAgent;
                axiosConfig.httpAgent = proxyConfig.httpAgent;
            }
        }

        let timerId;
        const timeoutPromise = new Promise((_, reject) => {
            timerId = setTimeout(() => reject(new Error('Request timeout')), config.API.TIMEOUT);
        });

        try {
            const response = await Promise.race([
                axios.request(axiosConfig),
                timeoutPromise,
            ])

            // 如果有 set-cookie，更新 sessionCookie
            if (response.headers['set-cookie']) {
                const cookies = response.headers['set-cookie'];
                const sessionCookie = cookies.find(cookie => cookie.startsWith('limitless_session='));
                if (sessionCookie) {
                    this.sessionCookie = sessionCookie.split(';')[0];
                }
            }
            return { 
                success: response.status == 200,
                data: response.data,
            }
        } catch (error) {
            if (error.response && error.response.data) {
                throw new Error(JSON.stringify(error.response.data));
            }
            throw new Error(error);
        } finally {
            clearTimeout(timerId);
        }
    }

    /**
     * 初始化钱包
     */
    async initializeWallet() {
        if (this.wallet && this.walletAddress) {
            return;
        }

        if (!this.privateKey) {
            throw new Error(`账户 ${this.accountId || 'unknown'} 缺少私钥配置`);
        }

        try {
            const provider = new ethers.JsonRpcProvider(config.RPC_URL);
            this.wallet = new ethers.Wallet(this.privateKey, provider);
            this.walletAddress = await this.wallet.getAddress();
        } catch (error) {
            console.error(`❌ 账户钱包初始化失败 (${this.accountId}): ${error.message}`);
            throw new Error(`账户钱包初始化失败: ${error.message}`);
        }
    }

    getWalletAddress() {
        return this.walletAddress;
    }

    async getNonce() {
        if (!this.walletAddress) {
            await this.initializeWallet();
        }

        const provider = new ethers.JsonRpcProvider(config.RPC_URL);
        const nonce = await provider.getTransactionCount(this.walletAddress, 'latest');
        return nonce;
    }

    /**
     * 创建登录消息
     */
    createLoginMessage(nonce) {
        return `Welcome to Limitless Exchange!

This request will not trigger a blockchain transaction or cost any gas fees.

Signature is required to authenticate an upcoming API request.

Nonce: ${nonce}`;
    }

    /**
     * 将消息转换为十六进制格式
     */
    messageToHex(message) {
        return '0x' + Buffer.from(message, 'utf8').toString('hex');
    }

    /**
     * 签名登录消息
     */
    async signLoginMessage(message) {
        if (!this.wallet) {
            await this.initializeWallet();
        }
        return await this.wallet.signMessage(message);
    }

    /**
     * 执行登录认证
     */
    async performLogin() {
        try {
            if (!this.wallet) {
                await this.initializeWallet();
            }

            const nonce = ethers.hexlify(ethers.randomBytes(32));
            const message = this.createLoginMessage(nonce);
            const hexMessage = this.messageToHex(message);
            const signature = await this.signLoginMessage(message);

            const response = await this.request({
                method: 'post',
                url: '/auth/login',
                data: { client: "eoa" },
                headers: {
                    'accept': 'application/json, text/plain, */*',
                    'content-type': 'application/json',
                    'x-account': this.walletAddress,
                    'x-signature': signature,
                    'x-signing-message': hexMessage
                },
            })

            // console.log(response.data)
            this.userId = response.data.id;

            return response
        } catch (error) {
            console.error(`❌ 账户 ${this.accountId} 登录失败:`, error.message);
            throw new Error(`Login failed: ${error.message}`);
        }
    }

    /**
     * 确保已认证
     */
    async ensureAuthenticated() {
        if (this.isAuthenticated && this.userId) {
            return;
        }

        try {
            const loginResult = await this.performLogin();
            if (!loginResult.success) {
                throw new Error('Authentication failed');
            }
        } catch (error) {
            throw new Error(`Authentication failed: ${error.message}`);
        }
    }

    /**
     * 创建带代理的axios实例
     */
    async createProxiedAxiosInstance() {
        const proxyConfig = await this.proxyManager.createProxyConfig();

        const axiosConfig = {
            baseURL: config.API.BASE_URL,
            timeout: config.API.TIMEOUT,
            withCredentials: true
        };

        // 如果有代理配置，使用 https-proxy-agent
        if (proxyConfig.httpsAgent) {
            axiosConfig.httpsAgent = proxyConfig.httpsAgent;
            axiosConfig.httpAgent = proxyConfig.httpAgent;
        }

        return {
            instance: axios.create(axiosConfig),
            proxyId: proxyConfig.proxyId
        };
    }

    getPriceFromTrades(trades) {
        if (!trades || !trades.length) {
            return null;
        }

        // 过滤出买入（Buy）策略的交易（可选，通常买卖都可以算单价）
        const validTrades = trades.filter(t => Number(t.data.contracts) > 0 
                                                        && Math.abs(Number(t.data.tradeAmountUSD)) > 0
                                                        // && t.data.strategy == 'Buy'
                                            );

        // 按时间排序，最新的在最前面
        validTrades.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        // 取最新一笔
        const latestTrade = validTrades[0];

        // 计算单价
        const latestPriceRaw = Math.abs(Number(latestTrade.data.tradeAmountUSD)) / Number(latestTrade.data.contracts);
        const latestPrice = latestPriceRaw

        const prices = {}
        if (latestTrade.data.outcome == 'YES') {
            prices.YES = latestPrice
            prices.NO = 1 - latestPrice
        } else {
            prices.YES = 1 - latestPrice
            prices.NO = latestPrice
        }

        return prices
    }

    /**
     * 获取市场列表 - 使用代理并行请求（公共接口，无需认证）
     */
    async getMarkets(useProxy = true) {
        try {
            // 1. 获取市场分类（不使用代理，因为这是单个请求）
            const categoriesResponse = await this.request({
                method: 'get',
                url: '/categories',
                needAuth: false,
                useProxy,
            })

            const categories = categoriesResponse.data;

            // 转换为旧格式的映射，用于兼容现有代码
            const categoryMaps = {};
            for (const category of categories) {
                if (['Hourly', 'Daily', 'Daily Strikes', 'Weekly Strikes', 'Crypto'].includes(category.name)) {
                    categoryMaps[category.id] = 0;
                }
            }

            let allMarkets = [];
            let totalMarketsCount = 0;

            // 2. 为每个分类创建代理配置
            const categoryEntries = Object.entries(categoryMaps);

            // 3. 并行请求所有分类的市场数据
            const categoryPromises = categoryEntries.map(async ([categoryId]) => {
                try {
                    const marketsResponse = await this.request({
                        method: 'get',
                        url: `/markets/active/${categoryId}`,
                        needAuth: false,
                        useProxy: true,
                    })

                    let markets = []

                    if (marketsResponse.success) {
                        markets = marketsResponse.data.data;
                    }

                    return {
                        categoryId,
                        markets,
                        success: true
                    };

                } catch (error) {
                    return {
                        categoryId,
                        markets: [],
                        success: false,
                    };
                }
            });

            // 4. 等待所有请求完成
            const categoryResults = await Promise.allSettled(categoryPromises);

            // 5. 处理结果
            for (const result of categoryResults) {
                if (result.status === 'fulfilled' && result.value.success) {
                    const { markets } = result.value;
                    totalMarketsCount += markets.length;

                    // 处理每个市场项目 - 兼容三种市场结构
                    for (const item of markets) {
                        const baseMarket = {
                            tags: item.tags,
                            categories: item.categories,
                            expired: item.expired,
                            expirationTimestamp: item.expirationTimestamp,
                            endDate: new Date(item.expirationTimestamp).toISOString(),
                        };

                        // 情况1: 直接有tokens字段的市场（单一市场结构）
                        if (item.tokens) {
                            allMarkets.push({
                                ...baseMarket,
                                title: item.title,
                                id: item.conditionId,
                                conditionId: item.conditionId,
                                tokens: item.tokens,
                                address: null,
                                prices: this.extractPriceData(item.prices),
                                tradePrices: item.tradePrices,
                                isRewardable: item.isRewardable || false,
                                settings: item.settings,
                                slug: item.slug,
                            });

                            continue;
                        }

                        // 情况2: 有markets子数组的市场（多子市场结构）
                        if (item.markets && item.markets.length > 0) {
                            for (const subMarket of item.markets) {
                                if (subMarket.tokens) {
                                    // let feedPrices = null
                                    // if (item.feedEvents) {
                                    //     const trades = item.feedEvents.filter(event => event.data.slug == subMarket.slug);
                                    //     feedPrices = this.getPriceFromTrades(trades);
                                    // }
                                    allMarkets.push({
                                        ...baseMarket,
                                        title: `${item.title} ${subMarket.title}`,
                                        id: subMarket.conditionId,
                                        conditionId: subMarket.conditionId,
                                        tokens: subMarket.tokens,
                                        address: null,
                                        prices: this.extractPriceData(subMarket.prices),
                                        tradePrices: subMarket.tradePrices,
                                        isRewardable: subMarket.isRewardable || false,
                                        settings: subMarket.settings,
                                        slug: subMarket.slug,
                                    });
                                }
                            }

                            continue;
                        }

                        // 情况3: 有conditionId但没有tokens的市场（需要获取address合约地址）
                        if (item.conditionId && !item.tokens) {
                            try {
                                if (item.address && item.prices) {
                                    allMarkets.push({
                                        ...baseMarket,
                                        title: item.title,
                                        id: item.conditionId,
                                        conditionId: item.conditionId,
                                        tokens: null,
                                        address: item.address, // 合约地址，用于下单
                                        prices: this.extractPriceData(item.prices),
                                        tradePrices: item.tradePrices,
                                        isRewardable: item.isRewardable || false,
                                        settings: item.settings,
                                        slug: item.slug,
                                    });
                                }
                            } catch (error) {
                                // 跳过有问题的市场
                                console.warn(`跳过有问题的市场: ${item.title}, 错误: ${error.message}`);
                                continue;
                            }
                        }
                    }
                } else if (result.status === 'fulfilled' && !result.value.success) {
                    const { categoryId, error } = result.value;
                    console.error(`❌ Category ${categoryId} failed: ${error}`);
                } else if (result.status === 'rejected') {
                    console.error(`❌ Category request rejected:`, result.reason);
                }
            }

            // 6. 过滤基本条件的市场（只过滤未过期的市场）
            const now = new Date();
            const filteredMarkets = allMarkets.filter(market =>
                !market.expired &&
                new Date(market.endDate) > now
            );

            return filteredMarkets;

        } catch (error) {
            console.error('❌ Failed to fetch markets:', error.message);
            return [];
        }
    }

    /**
     * 获取当个市场信息
     */
    async getMarketFeedEvents(slug, useProxy = true) {
        const resp = await this.request({
            method: 'get',
            url: `/markets/${slug}`,
            needAuth: false,
            useProxy,
        })

        if (resp.success) {
            return resp.data.feedEvents || []
        }

        return null
    }

    /**
     * 提取市场价格数据
     */
    extractPriceData(prices) {
        const yesPrice = new Decimal(prices[0])
        const noPrice = new Decimal(prices[1])

        return {
            YES: yesPrice > 1 ? yesPrice.div(100).toNumber() : yesPrice.toNumber(),
            NO: noPrice > 1 ? noPrice.div(100).toNumber() : noPrice.toNumber(),
        }
    }

    /**
     * 获取代理统计信息
     */
    getProxyStats() {
        return this.proxyManager.getProxyStats();
    }

    /**
     * 重置代理错误计数
     */
    resetProxyErrors() {
        return this.proxyManager.resetProxyErrors();
    }

    /**
     * 获取订单簿 - 使用slug获取实时价格数据（公共接口，无需认证）
     */
    async getOrderbook(slug, useProxy = true) {
        try {
            const response = await this.request({
                method: 'get',
                url: `/markets/${slug}/orderbook`,
                needAuth: false,
                useProxy,
            })

            if (response.success) {
                return response.data;
            } else {
                console.error('❌ Failed to fetch orderbook for ${slug}:')
                console.error(response)
                return []
            }
        } catch (error) {
            console.error(`❌ Failed to fetch orderbook for ${slug}:`, error.message);
            return null;
        }
    }

    /**
     * 批量获取订单簿
     */
    async getMultipleOrderbooks(slugs, useProxy = true) {
        // 创建每个 slug 的请求 promise
        const promises = slugs.map(slug => this.getOrderbook(slug, useProxy));
        
        // 使用 Promise.allSettled 并发执行
        const results = await Promise.allSettled(promises);

        // 构建一个对象，以 slug 为 key
        const orderbookMap = {};
        results.forEach((result, idx) => {
            const slug = slugs[idx];
            if (result.status === 'fulfilled') {
                orderbookMap[slug] = result.value;
            } else {
                orderbookMap[slug] = null; // 或者 result.reason
            }
        });

        return orderbookMap;
    }

    /**
     * 签名订单（使用 EIP-712）
     * 注意：签名时需要移除 price 字段，因为 EIP-712 类型定义中没有这个字段
     */
    async signOrder(order) {
        if (!this.wallet) {
            await this.initializeWallet();
        }

        // 创建签名用的订单对象，移除 price 字段
        const orderForSigning = {
            salt: BigInt(order.salt),
            maker: order.maker,
            signer: order.signer,
            taker: order.taker,
            tokenId: BigInt(order.tokenId),
            makerAmount: BigInt(order.makerAmount),
            takerAmount: BigInt(order.takerAmount),
            expiration: BigInt(order.expiration),
            nonce: BigInt(order.nonce),
            feeRateBps: BigInt(order.feeRateBps),
            side: order.side,
            signatureType: order.signatureType
        };

        const signature = await this.wallet.signTypedData(domain, types, orderForSigning);

        return signature;
    }

    /**
     * 生成随机 salt
     */
    generateSalt() {
        return Math.floor(Math.random() * 1000000000000);
    }

    /**
     * 创建市价单订单数据
     * @param {Object} params - 订单参数
     * @param {string} params.tokenId - 代币ID
     * @param {number} params.usdcAmount - USDC金额（微单位，1 USDC = 1000000）
     * @param {number} params.side - 买卖方向（0=买，1=卖）
     */
    async createMarketOrder(params) {
        if (!this.wallet) {
            await this.initializeWallet();
        }

        const { tokenId, usdcAmount, side } = params;

        return {
            salt: this.generateSalt(),
            maker: this.walletAddress,
            signer: this.walletAddress,
            taker: '0x0000000000000000000000000000000000000000',
            tokenId: tokenId,
            makerAmount: usdcAmount.toString(), // 签名时用字符串
            takerAmount: '1',
            expiration: '0',
            nonce: 0,
            feeRateBps: '300',
            side: side,
            signatureType: 0
        };
    }

    /**
     * 创建限价单订单数据
     * @param {Object} params - 订单参数
     * @param {string} params.tokenId - 代币ID
     * @param {number} params.price - 单价（美元）
     * @param {number} params.quantity - 数量
     * @param {number} params.side - 买卖方向（0=买，1=卖）
     */
    async createLimitOrder(params) {
        if (!this.wallet) {
            await this.initializeWallet();
        }

        const { tokenId, price, quantity, side } = params;

        // 计算 makerAmount: 美分单价 * 购买数量，然后换算成 USDC
        const makerAmount = Math.floor(price * 100 * quantity * 10000); // 转换为 USDC 微单位

        // 计算 takerAmount: 100美分 * 数量，然后换算成 USDC
        const takerAmount = Math.floor(100 * quantity * 10000); // 转换为 USDC 微单位

        const order = {
            salt: this.generateSalt(),
            maker: this.walletAddress,
            signer: this.walletAddress,
            taker: '0x0000000000000000000000000000000000000000',
            tokenId: tokenId,
            makerAmount: makerAmount.toString(), // 签名时用字符串
            takerAmount: takerAmount.toString(), // 签名时用字符串
            expiration: '0',
            nonce: 0,
            feeRateBps: '300',
            side: side,
            signatureType: 0,
            price: price // 保留价格信息用于显示
        };

        return order;
    }

    /**
     * 下市价单
     * @param {Object} params - 订单参数
     * @param {string} params.tokenId - 代币ID
     * @param {number} params.usdcAmount - USDC金额（微单位）
     * @param {number} params.side - 买卖方向（0=买，1=卖）
     * @param {string} params.marketSlug - 市场标识
     * @param {boolean} params.confirmRealOrder - 必须明确确认这是真实订单
     */
    async placeMarketOrder(params) {
        // 安全检查：必须明确确认这是真实订单
        if (!params.confirmRealOrder) {
            throw new Error('安全检查：您必须设置 confirmRealOrder=true 来下真实订单。这可以防止测试过程中的意外订单下单。');
        }

        try {
            await this.ensureAuthenticated();

            if (!this.wallet) {
                await this.initializeWallet();
            }

            // 1. 创建市价单
            const order = await this.createMarketOrder(params);

            // 2. 签名订单
            const signature = await this.signOrder(order);

            // 3. 准备 API 请求数据
            const orderForAPI = {
                ...order,
                makerAmount: parseInt(order.makerAmount),
                takerAmount: parseInt(order.takerAmount),
                feeRateBps: parseInt(order.feeRateBps),
                signature: signature
            };

            const requestData = {
                order: orderForAPI,
                ownerId: this.userId,
                orderType: 'FOK', // Fill or Kill for market orders
                marketSlug: params.marketSlug
            };

            // 4. 发送请求
            const response = await this.request({
                method: 'post',
                url: '/orders',
                data: requestData,
                needAuth: true,
                useProxy: true,
            });

            return response;
        } catch (error) {
            console.error('❌ 市价单下单失败:', error.message);
            throw new Error(`市价单失败: ${error.message}`);
        }
    }

    /**
     * 下限价单
     * @param {Object} params - 订单参数
     * @param {string} params.tokenId - 代币ID
     * @param {number} params.price - 单价（美元）
     * @param {number} params.quantity - 数量
     * @param {number} params.side - 买卖方向（0=买，1=卖）
     * @param {string} params.marketSlug - 市场标识
     * @param {boolean} params.confirmRealOrder - 必须明确确认这是真实订单
     */
    async placeLimitOrder(params) {
        // 安全检查：必须明确确认这是真实订单
        if (!params.confirmRealOrder) {
            throw new Error('安全检查：您必须设置 confirmRealOrder=true 来下真实订单。这可以防止测试过程中的意外订单下单。');
        }

        try {
            await this.ensureAuthenticated();

            if (!this.wallet) {
                await this.initializeWallet();
            }

            // 1. 创建限价单
            const order = await this.createLimitOrder(params);

            // 2. 签名订单
            const signature = await this.signOrder(order);

            // 3. 准备 API 请求数据
            const orderForAPI = {
                ...order,
                makerAmount: parseInt(order.makerAmount),
                takerAmount: parseInt(order.takerAmount),
                feeRateBps: parseInt(order.feeRateBps),
                signature: signature
            };

            const requestData = {
                order: orderForAPI,
                ownerId: this.userId,
                orderType: 'GTC', // Good Till Cancelled for limit orders
                marketSlug: params.marketSlug
            };

            // 4. 发送请求
            const response = await this.request({
                method: 'post',
                url: '/orders',
                data: requestData,
                needAuth: true,
                useProxy: true,
            });

            return response;
        } catch (error) {
            throw new Error(`限价单失败: ${error.message}`);
        }
    }

    async approve(spender, amount) {
        if (!this.walletAddress) {
            await this.initializeWallet();
        }

        const erc20Abi = [
            "function approve(address spender, uint256 amount) public returns (bool)"
        ];

        const tokenAddress = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
        const tokenContract = new ethers.Contract(tokenAddress, erc20Abi, this.wallet);
        const tx = await tokenContract.approve(spender, amount);
        return tx;
    }

    async setApproval(operator) {
        // ERC721/1155 ABI片段，只需setApprovalForAll方法
        const abi = [
            "function setApprovalForAll(address operator, bool approved) external"
        ];

        const contractAddress = '0xC9c98965297Bc527861c898329Ee280632B76e18'
        const contract = new ethers.Contract(contractAddress, abi, this.wallet);

        const approved = true;

        const tx = await contract.setApprovalForAll(operator, approved);
        return tx;
    }

    async claimPosition(conditionId) {
        // throw new Error('禁止调用');

        if (!this.wallet) {
            await this.initializeWallet();
        }

        const abi = [
            "function redeemPositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] indexSets)"
        ];

        const contractAddress = '0xC9c98965297Bc527861c898329Ee280632B76e18';
        const contract = new ethers.Contract(contractAddress, abi, this.wallet);

        const collateralToken = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913";
        const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
        const indexSets = [1, 2];

        const tx = await contract.redeemPositions(
            collateralToken,
            parentCollectionId,
            conditionId,
            indexSets
        );

        console.log('✅ claim交易已经发送, 哈希: ', tx.hash);

        const receipt = await tx.wait();

        return receipt;
    }

    /**
     * Hourly市场下单方法 - 通过合约地址直接下单
     * @param {Object} params - 订单参数
     * @param {string} params.contractAddress - 合约地址
     * @param {string|number} params.investmentAmount - 投资金额（最小单位）
     * @param {string|number} params.pricePerToken - 单价（最小单位）
     * @param {number} params.outcomeIndex - 方向（0或1）
     * @param {boolean} params.confirmRealOrder - 必须明确确认这是真实订单
     */
    async placeHourlyOrder(params) {
        // throw new Error('禁止调用');
    
        // 安全检查：必须明确确认这是真实订单
        if (!params.confirmRealOrder) {
            throw new Error('安全检查：您必须设置 confirmRealOrder=true 来下真实订单。这可以防止测试过程中的意外订单下单。');
        }

        try {
            if (!this.wallet) {
                await this.initializeWallet();
            }

            const { contractAddress, investmentAmount, pricePerToken, outcomeIndex, slippage } = params;

            // 计算最少获得的token数量，向下取整
            const minOutcomeTokensToBuy = Math.floor(Number(investmentAmount) / Number(pricePerToken) * ( 1 - (slippage || 0)));
    
            // 合约ABI - 只包含buy方法
            const abi = [
                "function buy(uint256 investmentAmount, uint256 outcomeIndex, uint256 minOutcomeTokensToBuy)"
            ];

            // 创建合约实例
            const contract = new ethers.Contract(contractAddress, abi, this.wallet);

            // 调用合约的buy方法
            const tx = await contract.buy(
                investmentAmount,
                outcomeIndex,
                minOutcomeTokensToBuy
            );

            // 等待交易确认
            // const receipt = await tx.wait();

            return tx;

        } catch (error) {
            throw new Error(`Hourly市场订单失败: ${error.message}`);
        }
    }

    /**
     * Hourly市场卖出方法 - 通过合约地址直接下单
     * @param {Object} params - 订单参数
     * @param {string} params.contractAddress - 合约地址
     * @param {string|number} params.pricePerToken - 单价（最小单位）
     * @param {number} params.outcomeIndex - 方向（0或1）
     * @param {number} params.maxOutcomeTokensToSell - 卖出份额
     * @param {boolean} params.confirmRealOrder - 必须明确确认这是真实订单
     */
    async sellByContract(params) {
        // throw new Error('禁止调用');

        // 安全检查：必须明确确认这是真实订单
        if (!params.confirmRealOrder) {
            throw new Error('安全检查：您必须设置 confirmRealOrder=true 来下真实订单。这可以防止测试过程中的意外订单下单。');
        }

        try {
            if (!this.wallet) {
                await this.initializeWallet();
            }

            const { contractAddress, pricePerToken, outcomeIndex, maxOutcomeTokensToSell } = params;

            // 计算最少获得的token数量，向下取整
            const returnAmount = params.returnAmount ? params.returnAmount : Math.floor(Number(pricePerToken) * Number(maxOutcomeTokensToSell))

            const abi = [
                "function sell(uint256 returnAmount, uint256 outcomeIndex, uint256 maxOutcomeTokensToSell) external"
            ];

            const contract = new ethers.Contract(contractAddress, abi, this.wallet);

            const tx = await contract.sell(
                returnAmount, 
                outcomeIndex, 
                maxOutcomeTokensToSell
            );
            return tx

        } catch (error) {
            throw error
        }
    }

    /**
     * 通用下单方法 - 根据订单数据自动选择限价单或市价单
     * @param {Object} orderData - 订单数据对象
     */
    async placeOrder(orderData) {
        // 从订单数据中提取参数
        const confirmRealOrder = orderData.confirmRealOrder;
        const order = orderData.order;
        const marketSlug = orderData.marketSlug;
        const side = order.side;
        const tokenId = order.tokenId;

        // 判断是限价单还是市价单
        const isMarketOrder = order.expiration === '0' && order.takerAmount === '1';

        if (isMarketOrder) {
            // 市价单
            return await this.placeMarketOrder({
                confirmRealOrder,
                tokenId,
                usdcAmount: parseInt(order.makerAmount),
                side,
                marketSlug,
            });
        } else {
            let price = order.price;
            if (!price) {
                const makerAmount = parseInt(order.makerAmount);
                const takerAmount = parseInt(order.takerAmount);
                price = (makerAmount / 1000000) / (takerAmount / 1000000) / 100; // 转换为美元价格
            }

            let quantity = order.quantity;
            if (!quantity) {
                const takerAmount = parseInt(order.takerAmount);
                quantity = takerAmount / 1000000; // 转换为USDC数量
            }

            return await this.placeLimitOrder({
                confirmRealOrder,
                tokenId,
                price,
                quantity,
                side,
                marketSlug,
            });
        }
    }

    /**
     * 取消订单
     */
    async cancelOrder(orderId, useProxy = true) {
        try {
            await this.ensureAuthenticated();
            const response = await this.request({
                method: 'delete',
                url: `/orders/${orderId}`,
                needAuth: true,
                useProxy,
            })
            return response.success;
        } catch (error) {
            console.log(error)
            console.error(`❌ Failed to cancel order ${orderId}:`, error.message);
            return false;
        }
    }

    /**
     * 获取订单信息
     */
    async getOrder(orderId, useProxy = true) {
        try {
            await this.ensureAuthenticated();
            const response = await this.request({
                method: 'get',
                url: `/orders/${orderId}`,
                needAuth: true,
                useProxy,
            })
            return response.data;
        } catch (error) {
            return null;
        }
    }

    /**
     * 获取用户的投资组合和订单信息
     */
    async getPortfolioPositions(useProxy = true) {
        try {
            await this.ensureAuthenticated();
            const response = await this.request({
                method: 'get',
                url: '/portfolio/positions',
                needAuth: true,
                useProxy,
            })

            return response
        } catch (error) {
            throw new Error(`Get portfolio failed: ${error.message}`);
        }
    }

    /**
     * 获取活跃订单列表
     */
    async getActiveOrders() {
        try {
            const portfolioResult = await this.getPortfolioPositions();

            if (!portfolioResult.success) {
                throw new Error('Failed to get portfolio');
            }

            // 提取所有活跃订单
            const allActiveOrders = [];
            if (portfolioResult.data.clob) {
                portfolioResult.data.clob.forEach(position => {
                    if (position.orders && position.orders.liveOrders) {
                        position.orders.liveOrders.forEach(order => {
                            allActiveOrders.push({
                                ...order,
                                market: position.market
                            });
                        });
                    }
                });
            }

            return {
                success: true,
                orders: allActiveOrders,
                totalOrders: allActiveOrders.length,
                portfolioData: portfolioResult.data
            };
        } catch (error) {
            throw new Error(`Get active orders failed: ${error.message}`);
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
            if (!this.wallet) {
                await this.initializeWallet();
            }

            const abi = [
                "function splitPosition(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external",
            ];

            const contractAddress = "0xC9c98965297Bc527861c898329Ee280632B76e18";
            const contract = new ethers.Contract(contractAddress, abi, this.wallet);
            const collateralToken = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC on Base
            const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const partition = [1, 2]; // 对应 YES 和 NO 代币

            // 将 USDC 数量转换为 wei（6位小数）
            const amount = ethers.parseUnits(usdcAmount.toString(), 6);

            // 执行 split 交易
            const tx = await contract.splitPosition(
                collateralToken,
                parentCollectionId,
                conditionId,
                partition,
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
            if (!this.wallet) {
                await this.initializeWallet();
            }

            const abi = [
                "function mergePositions(address collateralToken, bytes32 parentCollectionId, bytes32 conditionId, uint256[] partition, uint256 amount) external"
            ];

            const contractAddress = "0xC9c98965297Bc527861c898329Ee280632B76e18";
            const contract = new ethers.Contract(contractAddress, abi, this.wallet);
            const collateralToken = "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913"; // USDC on Base
            const parentCollectionId = "0x0000000000000000000000000000000000000000000000000000000000000000";
            const partition = [1, 2]; // 对应 YES 和 NO 代币

            // 将代币数量转换为 wei（6位小数）
            const amount = ethers.parseUnits(tokenAmount.toString(), 6);

            // 执行 merge 交易
            const tx = await contract.mergePositions(
                collateralToken,
                parentCollectionId,
                conditionId,
                partition,
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
}

export default LimitlessApiClient;
