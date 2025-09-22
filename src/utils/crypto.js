import crypto from 'crypto';

/**
 * 使用 AES-256-GCM 加密
 * @param {string} text - 明文
 * @returns {Object} - { encryptedData, iv, authTag }
 */
export const encryptGCM = (text) => {
	// 通过字符串生成 32 字节密钥
	const secretKey = process.env.SECRET_KEY; // 你的密钥字符串
	const key = crypto.createHash('sha256').update(secretKey).digest(); // 生成 32 字节密钥

	const iv = crypto.randomBytes(16); // 16 字节 IV（初始化向量）
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	let encrypted = cipher.update(text, 'utf8', 'hex');
	encrypted += cipher.final('hex');
	const authTag = cipher.getAuthTag().toString('hex');
	return { encryptedData: encrypted, iv: iv.toString('hex'), authTag };
}

/**
 * 使用 AES-256-GCM 解密
 * @param {string} encryptedData - 密文
 * @param {string} iv - 初始化向量（hex）
 * @param {string} authTag - 认证标签（hex）
 * @returns {string} - 解密后的明文
 */
export const decryptGCM = (encryptedData, iv, authTag) => {
	// 通过字符串生成 32 字节密钥
	const secretKey = process.env.SECRET_KEY; // 你的密钥字符串
	const key = crypto.createHash('sha256').update(secretKey).digest(); // 生成 32 字节密钥
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'hex'));
	decipher.setAuthTag(Buffer.from(authTag, 'hex'));
	let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
	decrypted += decipher.final('utf8');
	return decrypted;
}
