/**
 * PayCat Cordova Plugin
 */

var exec = require('cordova/exec');

var PayCat = {
  /**
   * Configure the SDK
   * @param {Object} options - Configuration options
   * @param {string} options.apiKey - Your PayCat API key
   * @param {string} [options.appUserId] - Optional app user ID
   * @param {boolean} [options.observerMode] - Observer mode (don't finish transactions)
   * @param {boolean} [options.debugLogsEnabled] - Enable debug logs
   * @param {boolean} [options.useSandbox] - Use sandbox environment
   * @param {Function} success - Success callback
   * @param {Function} error - Error callback
   */
  configure: function(options, success, error) {
    exec(success, error, 'PayCat', 'configure', [options]);
  },

  /**
   * Log in a user
   * @param {string} appUserId - The app user ID
   * @param {Function} success - Success callback with SubscriberInfo
   * @param {Function} error - Error callback
   */
  login: function(appUserId, success, error) {
    exec(success, error, 'PayCat', 'login', [appUserId]);
  },

  /**
   * Log out current user
   * @param {Function} success - Success callback
   * @param {Function} error - Error callback
   */
  logout: function(success, error) {
    exec(success, error, 'PayCat', 'logout', []);
  },

  /**
   * Get subscriber info
   * @param {Function} success - Success callback with SubscriberInfo
   * @param {Function} error - Error callback
   */
  getSubscriberInfo: function(success, error) {
    exec(success, error, 'PayCat', 'getSubscriberInfo', []);
  },

  /**
   * Get available offerings
   * @param {Function} success - Success callback with Offerings
   * @param {Function} error - Error callback
   */
  getOfferings: function(success, error) {
    exec(success, error, 'PayCat', 'getOfferings', []);
  },

  /**
   * Purchase a package
   * @param {string} packageIdentifier - The package identifier
   * @param {string} [offeringIdentifier] - Optional offering identifier
   * @param {Function} success - Success callback with PurchaseResult
   * @param {Function} error - Error callback
   */
  purchasePackage: function(packageIdentifier, offeringIdentifier, success, error) {
    if (typeof offeringIdentifier === 'function') {
      error = success;
      success = offeringIdentifier;
      offeringIdentifier = null;
    }
    exec(success, error, 'PayCat', 'purchasePackage', [packageIdentifier, offeringIdentifier]);
  },

  /**
   * Restore purchases
   * @param {Function} success - Success callback with SubscriberInfo
   * @param {Function} error - Error callback
   */
  restorePurchases: function(success, error) {
    exec(success, error, 'PayCat', 'restorePurchases', []);
  },

  /**
   * Check if user has entitlement
   * @param {string} identifier - Entitlement identifier
   * @param {Function} success - Success callback with {isActive, entitlement}
   * @param {Function} error - Error callback
   */
  checkEntitlement: function(identifier, success, error) {
    exec(success, error, 'PayCat', 'checkEntitlement', [identifier]);
  },

  /**
   * Set user attributes
   * @param {Object} attributes - Key-value pairs of attributes
   * @param {Function} success - Success callback
   * @param {Function} error - Error callback
   */
  setAttributes: function(attributes, success, error) {
    exec(success, error, 'PayCat', 'setAttributes', [attributes]);
  },

  /**
   * Set a single attribute
   * @param {string} key - Attribute key
   * @param {string|null} value - Attribute value (null to remove)
   * @param {Function} success - Success callback
   * @param {Function} error - Error callback
   */
  setAttribute: function(key, value, success, error) {
    var attrs = {};
    attrs[key] = value;
    exec(success, error, 'PayCat', 'setAttributes', [attrs]);
  },

  /**
   * Get paywall data
   * @param {Object} [options] - Options
   * @param {string} [options.identifier] - Paywall identifier
   * @param {string} [options.locale] - Locale code
   * @param {Function} success - Success callback with PaywallResult
   * @param {Function} error - Error callback
   */
  getPaywall: function(options, success, error) {
    if (typeof options === 'function') {
      error = success;
      success = options;
      options = {};
    }
    exec(success, error, 'PayCat', 'getPaywall', [options.identifier || null, options.locale || null]);
  },

  /**
   * Present paywall UI
   * @param {Object} [options] - Options
   * @param {string} [options.identifier] - Paywall identifier
   * @param {string} [options.locale] - Locale code
   * @param {Function} success - Success callback with PaywallPresentResult
   * @param {Function} error - Error callback
   */
  presentPaywall: function(options, success, error) {
    if (typeof options === 'function') {
      error = success;
      success = options;
      options = {};
    }
    exec(success, error, 'PayCat', 'presentPaywall', [options.identifier || null, options.locale || null]);
  },

  /**
   * Track a custom event
   * @param {string} eventName - Event name
   * @param {Object} [properties] - Event properties
   * @param {Function} success - Success callback
   * @param {Function} error - Error callback
   */
  trackEvent: function(eventName, properties, success, error) {
    if (typeof properties === 'function') {
      error = success;
      success = properties;
      properties = null;
    }
    exec(success, error, 'PayCat', 'trackEvent', [eventName, properties]);
  },

  /**
   * Add listener for subscription updates
   * @param {Function} callback - Callback function
   */
  addSubscriptionUpdateListener: function(callback) {
    exec(callback, function() {}, 'PayCat', 'addSubscriptionUpdateListener', []);
  },

  /**
   * Add listener for purchase completed
   * @param {Function} callback - Callback function
   */
  addPurchaseCompletedListener: function(callback) {
    exec(callback, function() {}, 'PayCat', 'addPurchaseCompletedListener', []);
  },

  /**
   * Add listener for purchase failed
   * @param {Function} callback - Callback function
   */
  addPurchaseFailedListener: function(callback) {
    exec(callback, function() {}, 'PayCat', 'addPurchaseFailedListener', []);
  },

  /**
   * Remove all listeners
   * @param {Function} success - Success callback
   * @param {Function} error - Error callback
   */
  removeAllListeners: function(success, error) {
    exec(success, error, 'PayCat', 'removeAllListeners', []);
  }
};

module.exports = PayCat;
