/**
 * Encryption Service
 * Handles encryption/decryption of sensitive tenant credentials
 * Uses AES-256-GCM for authenticated encryption
 */

const crypto = require('crypto');
const { logger } = require('../config/logger');

class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.key = this.getEncryptionKey();
  }

  /**
   * Get encryption key from environment variable
   * Key is hashed to ensure 32-byte length
   */
  getEncryptionKey() {
    const key = process.env.TENANT_CREDENTIALS_ENCRYPTION_KEY;
    if (!key) {
      // In development, warn but don't fail (for testing)
      if (process.env.NODE_ENV === 'development') {
        logger.warn('⚠️  WARNING: Encryption key not configured. Tenant credentials encryption is disabled.');
        return null;
      }
      throw new Error('System encryption is not properly configured. Please contact your system administrator.');
    }
    // Hash to ensure 32-byte key for AES-256
    return crypto.createHash('sha256').update(key).digest();
  }

  /**
   * Encrypt sensitive text
   * @param {string} text - Plain text to encrypt
   * @returns {string} Encrypted text in format: iv:authTag:encrypted
   */
  encrypt(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // If encryption key is not available, return as-is (development mode)
    if (!this.key) {
      return text;
    }

    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);
      
      let encrypted = cipher.update(text, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      // Return format: iv:authTag:encrypted (all hex encoded)
      return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
    } catch (error) {
      logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt sensitive data');
    }
  }

  /**
   * Decrypt encrypted text
   * @param {string} encryptedText - Encrypted text in format: iv:authTag:encrypted
   * @returns {string} Decrypted plain text
   */
  decrypt(encryptedText) {
    if (!encryptedText || typeof encryptedText !== 'string') {
      return encryptedText;
    }

    // If encryption key is not available, return as-is (development mode)
    if (!this.key) {
      return encryptedText;
    }

    // Check if already decrypted (not in encrypted format)
    // Encrypted format has 3 parts separated by colons
    if (!encryptedText.includes(':') || encryptedText.split(':').length !== 3) {
      // Might be plain text from old records - return as-is for migration
      // Log warning in production
      if (process.env.NODE_ENV === 'production') {
        logger.warn('Attempting to decrypt non-encrypted text. Migration may be needed.');
      }
      return encryptedText;
    }

    try {
      const parts = encryptedText.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted format');
      }

      const [ivHex, authTagHex, encrypted] = parts;
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');

      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      logger.error('Decryption failed:', error);
      // If decryption fails, might be plain text (old record)
      // Return as-is and let migration handle it
      return encryptedText;
    }
  }

  /**
   * Check if text is encrypted
   * @param {string} text - Text to check
   * @returns {boolean} True if encrypted
   */
  isEncrypted(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }
    // Encrypted format: iv:authTag:encrypted (3 parts)
    const parts = text.split(':');
    return parts.length === 3 && parts.every(part => /^[0-9a-f]+$/i.test(part));
  }
}

module.exports = new EncryptionService();

