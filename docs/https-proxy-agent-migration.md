# HTTPS Proxy Agent 迁移指南

## 概述

本项目已从 axios 内置代理配置迁移到使用 `https-proxy-agent` 库，以提供更稳定和可靠的代理支持。

## 主要改进

### 1. 更稳定的代理连接
- 使用专门的 `https-proxy-agent` 库替代 axios 内置代理
- 更好的连接池管理和错误处理
- 支持更多代理协议和认证方式

### 2. 统一的代理处理
- HTTP 和 HTTPS 请求使用相同的代理配置
- 自动处理代理认证和连接重用
- 更好的超时和错误恢复机制

### 3. 向后兼容
- 保持原有的代理配置文件格式 (`proxies.txt`)
- 保持原有的 API 接口不变
- 无需修改现有的使用代码

## 技术变更

### 依赖更新

```bash
npm install https-proxy-agent@latest
```

### 代码变更

#### 代理管理器 (`src/core/proxy-manager.js`)

**之前:**
```javascript
// 使用 axios 内置代理配置
const proxyConfig = {
    protocol: 'http',
    host: '127.0.0.1',
    port: 8080,
    auth: { username: 'user', password: 'pass' }
};
```

**现在:**
```javascript
// 使用 https-proxy-agent
import { HttpsProxyAgent } from 'https-proxy-agent';

const proxyAgent = new HttpsProxyAgent(proxyUrl);
const config = {
    httpsAgent: proxyAgent,
    httpAgent: proxyAgent
};
```

#### API 客户端 (`src/core/api-client.js`)

**之前:**
```javascript
const axiosConfig = {
    baseURL: config.API.BASE_URL,
    timeout: config.API.TIMEOUT,
    proxy: proxyConfig.proxy  // axios 内置代理
};
```

**现在:**
```javascript
const axiosConfig = {
    baseURL: config.API.BASE_URL,
    timeout: config.API.TIMEOUT,
    httpsAgent: proxyConfig.httpsAgent,  // https-proxy-agent
    httpAgent: proxyConfig.httpAgent
};
```

## 使用方法

### 1. 代理配置文件

代理配置文件 `proxies.txt` 格式保持不变：

```
http://proxy1.example.com:8080
http://username:password@proxy2.example.com:3128
https://secure-proxy.example.com:8443
socks5://socks-proxy.example.com:1080
```

### 2. 测试代理配置

```bash
# 测试 https-proxy-agent 集成
npm run test:https-proxy

# 演示代理使用
npm run demo:https-proxy
```

### 3. 代码使用示例

```javascript
import LimitlessApiClient from './src/core/api-client.js';

const client = new LimitlessApiClient();

// 自动使用代理轮换获取市场数据
const markets = await client.getMarkets();

// 批量获取订单簿（使用代理）
const orderbooks = await client.getMultipleOrderbooks(slugs, true);
```

## 性能优势

### 1. 连接稳定性
- 减少代理连接失败率
- 更好的连接重用和池化
- 自动重试和故障转移

### 2. 错误处理
- 更精确的错误分类和处理
- 自动代理健康检查
- 智能代理轮换策略

### 3. 资源使用
- 更高效的内存使用
- 减少不必要的连接创建
- 更好的并发请求处理

## 监控和调试

### 1. 代理统计

```javascript
const stats = client.getProxyStats();
console.log(`活跃代理: ${stats.active}/${stats.total}`);
console.log(`总错误数: ${stats.totalErrors}`);
```

### 2. 错误恢复

```javascript
// 重置所有代理错误状态
client.resetProxyErrors();
```

### 3. 调试信息

代理使用情况会在控制台输出：
```
🔗 代理使用统计: 232/232 活跃, 总错误: 0
✅ Category 2: 19 markets (proxy 7)
✅ Category 5: 3 markets (proxy 37)
```

## 故障排除

### 1. 代理连接失败

**症状:** 请求超时或连接被拒绝
**解决方案:**
- 检查代理服务器是否可用
- 验证代理认证信息
- 检查防火墙设置

### 2. 代理认证问题

**症状:** 407 Proxy Authentication Required
**解决方案:**
- 确认用户名和密码正确
- 检查代理 URL 格式：`http://username:password@proxy:port`

### 3. 性能问题

**症状:** 请求响应缓慢
**解决方案:**
- 增加超时时间配置
- 使用更快的代理服务器
- 启用代理连接池

## 兼容性

- **Node.js:** >= 18.0.0
- **axios:** ^1.6.0
- **https-proxy-agent:** ^7.0.0

## 迁移检查清单

- [x] 安装 `https-proxy-agent` 依赖
- [x] 更新代理管理器使用新的代理库
- [x] 更新 API 客户端代理配置
- [x] 创建测试脚本验证功能
- [x] 创建演示脚本展示用法
- [x] 更新文档说明变更
- [x] 保持向后兼容性

## 总结

通过迁移到 `https-proxy-agent`，项目获得了：

1. **更稳定的代理连接** - 减少连接失败和超时
2. **更好的错误处理** - 智能重试和故障转移
3. **更高的性能** - 优化的连接池和资源管理
4. **更强的兼容性** - 支持更多代理协议和认证方式

这次迁移为项目的代理功能提供了坚实的基础，确保在各种网络环境下都能稳定运行。