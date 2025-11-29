/**
 * Feature Gate Service
 * Controls feature access based on license status and features
 */

const licenseService = require('./licenseService');
const { logger } = require('../config/logger');

class FeatureGateService {
  /**
   * Check if a specific feature is enabled for organization
   * @param {string} organizationId - Organization ID
   * @param {string} feature - Feature name (e.g., 'export', 'custom_branding', 'api_access')
   * @returns {Promise<boolean>} True if feature is enabled
   */
  async isFeatureEnabled(organizationId, feature) {
    if (!organizationId) {
      // SUPER_ADMIN - all features enabled
      return true;
    }

    const validation = await licenseService.validateLicense(organizationId);
    
    // If license is invalid or expired, no features available
    if (!validation.valid) {
      return false;
    }

    const features = validation.license?.features || [];
    return features.includes(feature);
  }

  /**
   * Check if organization can perform an action
   * Handles expired licenses with read-only mode
   * @param {string} organizationId - Organization ID
   * @param {string} action - Action type ('create', 'update', 'delete', 'export', 'view')
   * @returns {Promise<Object>} { allowed: boolean, reason: string, readOnly: boolean }
   */
  async canPerformAction(organizationId, action) {
    if (!organizationId) {
      // SUPER_ADMIN - all actions allowed
      return {
        allowed: true,
        reason: null,
        readOnly: false,
        message: 'Action allowed'
      };
    }

    const validation = await licenseService.validateLicense(organizationId);
    
    // If license is invalid (not just expired), block all actions
    if (!validation.valid) {
      if (validation.reason === 'NO_LICENSE') {
        return {
          allowed: false,
          reason: 'NO_LICENSE',
          readOnly: false,
          message: 'No license found. Please contact support.'
        };
      }
      
      if (validation.reason === 'INSTANCE_MISMATCH') {
        return {
          allowed: false,
          reason: 'INSTANCE_MISMATCH',
          readOnly: false,
          message: 'License is bound to a different instance.'
        };
      }
      
      if (validation.reason === 'INACTIVE' || validation.reason === 'SUSPENDED' || validation.reason === 'REVOKED') {
        return {
          allowed: false,
          reason: validation.reason,
          readOnly: false,
          message: `License is ${validation.status}. Please contact support.`
        };
      }
    }

    // If license is expired, allow read-only actions
    if (validation.reason === 'EXPIRED' || validation.status === 'EXPIRED') {
      const readOnlyActions = ['view', 'read', 'login', 'list', 'get'];
      const actionLower = action.toLowerCase();
      
      if (readOnlyActions.some(ro => actionLower.includes(ro))) {
        return {
          allowed: true,
          reason: 'EXPIRED_READ_ONLY',
          readOnly: true,
          message: 'License expired. You are in read-only mode.',
          expiresAt: validation.expiresAt
        };
      }
      
      // Block write actions when expired
      return {
        allowed: false,
        reason: 'EXPIRED',
        readOnly: true,
        message: 'License expired. This action requires an active license.',
        expiresAt: validation.expiresAt
      };
    }

    // License is valid - check action
    const writeActions = ['create', 'update', 'delete', 'export', 'download', 'modify', 'edit'];
    const actionLower = action.toLowerCase();
    
    // For write actions, check if license is valid
    if (writeActions.some(wa => actionLower.includes(wa))) {
      if (!validation.valid) {
        return {
          allowed: false,
          reason: 'LICENSE_INVALID',
          readOnly: false,
          message: 'This action requires a valid license.'
        };
      }
    }

    return {
      allowed: true,
      reason: null,
      readOnly: false,
      message: 'Action allowed'
    };
  }

  /**
   * Get available features for organization
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Array<string>>} List of enabled features
   */
  async getAvailableFeatures(organizationId) {
    if (!organizationId) {
      // SUPER_ADMIN - all features
      return ['export', 'custom_branding', 'api_access', 'advanced_filters', 'bulk_operations'];
    }

    const validation = await licenseService.validateLicense(organizationId);
    
    if (!validation.valid) {
      // Expired license - read-only features only
      if (validation.reason === 'EXPIRED') {
        return ['view', 'read'];
      }
      // No license or invalid - no features
      return [];
    }

    return validation.license?.features || [];
  }

  /**
   * Check if organization is in read-only mode
   * @param {string} organizationId - Organization ID
   * @returns {Promise<boolean>} True if in read-only mode
   */
  async isReadOnlyMode(organizationId) {
    if (!organizationId) {
      return false; // SUPER_ADMIN is never read-only
    }

    const validation = await licenseService.validateLicense(organizationId);
    
    return validation.reason === 'EXPIRED' || validation.status === 'EXPIRED';
  }

  /**
   * Get license status summary for frontend
   * @param {string} organizationId - Organization ID
   * @returns {Promise<Object>} License status with feature info
   */
  async getLicenseStatusSummary(organizationId) {
    if (!organizationId) {
      return {
        valid: true,
        readOnly: false,
        features: ['export', 'custom_branding', 'api_access', 'advanced_filters', 'bulk_operations'],
        message: 'SUPER_ADMIN - All features enabled'
      };
    }

    const validation = await licenseService.validateLicense(organizationId);
    const isReadOnly = await this.isReadOnlyMode(organizationId);
    const features = await this.getAvailableFeatures(organizationId);

    return {
      valid: validation.valid,
      readOnly: isReadOnly,
      features: features,
      reason: validation.reason,
      status: validation.status,
      expiresAt: validation.license?.expiresAt || validation.expiresAt,
      message: validation.message
    };
  }
}

module.exports = new FeatureGateService();

