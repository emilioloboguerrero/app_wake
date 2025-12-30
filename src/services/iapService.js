// IAP Service - Clean implementation for In-App Purchases
import * as InAppPurchases from 'expo-in-app-purchases';
import Constants from 'expo-constants';
import logger from '../utils/logger';

// Check if we're in development mode
// __DEV__ is true in development, false in production builds (TestFlight, App Store)
const isDevelopment = __DEV__;

class IAPService {
  constructor() {
    this.isConnected = false;
    this.purchaseUpdateListener = null;
    this.pendingPurchases = new Map(); // Store userId and courseId for pending purchases
    this.purchaseInProgress = false; // Track if a purchase is currently in progress
  }

  /**
   * Initialize connection to App Store
   */
  async initialize() {
    try {
      if (this.isConnected) {
        logger.log('✅ IAP already connected');
        // CRITICAL: Always ensure listener is set up, even if already connected
        if (!this.purchaseUpdateListener) {
          logger.log('🔄 Re-setting up purchase listener...');
          this.setupPurchaseListener();
        }
        return { success: true };
      }

      logger.log('🔄 Connecting to App Store...');
      await InAppPurchases.connectAsync();
      this.isConnected = true;
      logger.log('✅ IAP connected successfully');

      // Set up purchase listener
      this.setupPurchaseListener();

      return { success: true };
    } catch (error) {
      logger.error('❌ Error connecting to IAP:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Set up listener for purchase updates
   * IMPORTANT: In production, we need to ensure the listener is fresh and active
   * We'll re-setup if needed, but carefully to avoid timing issues
   */
  setupPurchaseListener(forceReset = false) {
      // In production, force reset to ensure listener is fresh
      // This helps with cases where listener stops working
      if (this.purchaseUpdateListener && !forceReset) {
        logger.log('⚠️ Purchase listener already exists, keeping existing listener');
        return;
      }
      
      // Remove existing listener if forcing reset
      if (this.purchaseUpdateListener && forceReset) {
        logger.log('🔄 Force resetting purchase listener...');
        try {
        this.purchaseUpdateListener.remove();
        } catch (removeError) {
          logger.warn('⚠️ Error removing old listener (may already be removed):', removeError);
        }
        this.purchaseUpdateListener = null;
      }
      
    logger.log('🔧 Setting up purchase listener...');
    try {
    this.purchaseUpdateListener = InAppPurchases.setPurchaseListener(
      async ({ response, error }) => {
          logger.log('📥 Purchase listener fired!', {
            hasResponse: !!response,
            responseLength: response?.length || 0,
            hasError: !!error,
            listenerActive: !!this.purchaseUpdateListener,
            timestamp: new Date().toISOString(),
            environment: isDevelopment ? 'development' : 'production'
          });

        if (error) {
          logger.error('❌ IAP purchase error:', error);
          logger.log('📊 Error details:', {
            code: error.code,
            message: error.message,
            userCanceled: error.code === InAppPurchases.IAPResponseCode.USER_CANCELED
          });
          
          // Reset purchase state on any error (including user cancellation)
          this.purchaseInProgress = false;
          
          // Clear pending purchases if user canceled
          if (error.code === InAppPurchases.IAPResponseCode.USER_CANCELED) {
            logger.log('👤 User canceled purchase, clearing pending purchases');
            this.pendingPurchases.clear();
          }
          return;
        }

        if (response) {
          // Handle empty response (user might have canceled)
          if (response.length === 0) {
            logger.log('⚠️ Empty purchase response - purchase may have been canceled');
            this.purchaseInProgress = false;
            return;
          }

          logger.log('✅ Processing purchases from listener:', response.length);
          for (const purchase of response) {
            logger.log('🔄 Processing purchase from listener:', {
              productId: purchase.productId,
              orderId: purchase.orderId,
              transactionId: purchase.transactionId,
              hasTransactionReceipt: !!purchase.transactionReceipt,
              hasReceipt: !!purchase.receipt
            });
            await this.handlePurchase(purchase);
          }
        } else {
          // No response and no error - likely user canceled
          logger.log('⚠️ No purchase response - purchase may have been canceled');
          this.purchaseInProgress = false;
        }
      }
    );
      logger.log('✅ Purchase listener set up successfully');
    } catch (error) {
      logger.error('❌ Error setting up purchase listener:', error);
      throw error;
    }
  }

  /**
   * Get products from App Store
   * @param {string[]} productIds - Array of product IDs to fetch
   */
  async getProducts(productIds) {
    try {
      if (!this.isConnected) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return { success: false, error: 'Failed to initialize IAP' };
        }
      }

      logger.log('🔄 Fetching products from App Store:', productIds);
      logger.log('📋 Request details:', {
        productIds,
        productIdsCount: productIds.length,
        isConnected: this.isConnected,
        timestamp: new Date().toISOString()
      });
      
      // Log each product ID individually for debugging
      productIds.forEach((id, index) => {
        logger.log(`📋 Product ${index + 1}:`, {
          id,
          type: typeof id,
          length: id?.length,
          trimmed: id?.trim(),
          hasWhitespace: id !== id?.trim()
        });
      });
      
      const { responseCode, results } = await InAppPurchases.getProductsAsync(productIds);
      
      logger.log('📊 Response Code:', responseCode, `(${this.getResponseCodeName(responseCode)})`);
      logger.log('📊 Products found:', results?.length || 0);
      logger.log('📊 Full response:', JSON.stringify({ responseCode, resultsCount: results?.length || 0 }, null, 2));

      if (responseCode !== InAppPurchases.IAPResponseCode.OK) {
        const errorMessage = this.getResponseCodeMessage(responseCode);
        logger.error('❌ Error fetching products:', errorMessage);
        logger.error('📊 Full error details:', {
          responseCode,
          responseCodeName: this.getResponseCodeName(responseCode),
          results: results || []
        });
        return { 
          success: false, 
          error: errorMessage,
          responseCode,
          products: []
        };
      }

      if (!results || results.length === 0) {
        logger.warn('⚠️ No products found');
        logger.warn('💡 Make sure:');
        logger.warn('   1. Product ID matches exactly in App Store Connect');
        logger.warn('   2. Product is associated with your app version');
        logger.warn('   3. Product status is "Ready to Submit"');
        logger.warn('   4. You are signed in with a sandbox tester account');
        logger.warn('   5. Waited 2-24 hours after creating/associating product');
        return {
          success: false,
          error: 'No products found',
          responseCode,
          products: []
        };
      }

      logger.log('✅ Products fetched successfully');
      results.forEach((product, index) => {
        logger.log(`📦 Product ${index + 1}:`, {
          productId: product.productId,
          title: product.title,
          description: product.description,
          price: product.price,
          currency: product.currency,
          priceString: product.priceString,
          subscriptionPeriod: product.subscriptionPeriod || 'N/A (not a subscription)',
          subscriptionGroupIdentifier: product.subscriptionGroupIdentifier || 'N/A',
          type: product.type || 'N/A'
        });
      });

      return {
        success: true,
        products: results,
        responseCode
      };
    } catch (error) {
      logger.error('❌ Error getting products:', error);
      logger.error('📊 Error details:', {
        message: error.message,
        stack: error.stack?.split('\n').slice(0, 5).join('\n')
      });
      return { success: false, error: error.message, products: [] };
    }
  }

  /**
   * Debug method: Test IAP connection and log all available information
   */
  async debugIAPConnection() {
    try {
      logger.log('🔬 ========== IAP DEBUG START ==========');
      
      // Check connection
      logger.log('📡 Connection Status:', {
        isConnected: this.isConnected,
        hasListener: !!this.purchaseUpdateListener
      });

      // Initialize if not connected
      if (!this.isConnected) {
        logger.log('🔄 Initializing connection...');
        const initResult = await this.initialize();
        logger.log('📊 Init result:', initResult);
      }
      
      // Ensure listener is set up
      if (!this.purchaseUpdateListener) {
        logger.log('🔄 Setting up purchase listener...');
        this.setupPurchaseListener();
      }

      // Try to get purchase history (this can trigger sandbox sign-in)
      logger.log('🔄 Attempting to get purchase history...');
      try {
        const { results } = await InAppPurchases.getPurchaseHistoryAsync();
        logger.log('✅ Purchase history accessible:', {
          purchaseCount: results?.length || 0,
          purchases: results?.map(p => ({
            productId: p.productId,
            transactionId: p.transactionId,
            orderId: p.orderId,
            purchaseTime: p.purchaseTime
          })) || []
        });
        logger.log('💡 This suggests sandbox account is signed in');
        
        // If there are purchases, log the product IDs
        if (results && results.length > 0) {
          const productIds = [...new Set(results.map(p => p.productId))];
          logger.log('📦 Product IDs from purchase history:', productIds);
          logger.log('💡 These are products that were previously purchased');
        }
      } catch (historyError) {
        logger.warn('⚠️ Cannot access purchase history:', {
          error: historyError.message,
          code: historyError.code
        });
        logger.warn('💡 This might indicate:');
        logger.warn('   1. Not signed in with sandbox account');
        logger.warn('   2. Sandbox account not set up');
        logger.warn('   3. Need to sign out and sign in with sandbox');
      }

      logger.log('🔬 ========== IAP DEBUG END ==========');
      
      return {
        success: true,
        isConnected: this.isConnected,
        message: 'Debug completed - check logs for details'
      };
    } catch (error) {
      logger.error('❌ Debug error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Generate a detailed verification report for App Store Connect
   */
  async generateVerificationReport(productId) {
    try {
      const appInfo = await this.getAppInfo();
      const productsResult = await this.getProducts([productId]);
      
      const report = {
        timestamp: new Date().toISOString(),
        appInfo: {
          bundleId: appInfo.bundleId,
          version: appInfo.version,
          buildNumber: appInfo.buildNumber
        },
        requestedProduct: {
          productId: productId,
          found: productsResult.success && productsResult.products.length > 0,
          responseCode: productsResult.responseCode,
          responseCodeName: this.getResponseCodeName(productsResult.responseCode || 0)
        },
        connectionStatus: {
        isConnected: this.isConnected,
          sandboxAccountSignedIn: null // Will be set below
        },
        verificationSteps: []
      };

      // Check sandbox account
      try {
        await InAppPurchases.getPurchaseHistoryAsync();
        report.connectionStatus.sandboxAccountSignedIn = true;
      } catch (e) {
        report.connectionStatus.sandboxAccountSignedIn = false;
      }

      // Generate verification steps
      report.verificationSteps = [
        {
          step: 1,
          title: 'Product ID Match',
          description: `Verify Product ID in App Store Connect matches exactly: "${productId}"`,
          status: 'pending',
          action: 'Go to: Features → Subscriptions → Your Subscription → Check Product ID field'
        },
        {
          step: 2,
          title: 'App Version Association',
          description: `Verify subscription is associated with version ${appInfo.version} (Build ${appInfo.buildNumber})`,
          status: 'pending',
          action: 'Go to: App Store → Versions → Edit version → "In-App Purchases and Subscriptions" → Verify subscription is listed'
        },
        {
          step: 3,
          title: 'Subscription Status',
          description: 'Verify subscription status is "Ready to Submit" (green badge)',
          status: 'pending',
          action: 'Go to: Features → Subscriptions → Your Subscription → Check status badge'
        },
        {
          step: 4,
          title: 'Sandbox Sync',
          description: 'Wait 2-24 hours after creating/associating subscription',
          status: 'pending',
          action: 'If you just created/associated it, wait longer. Sandbox sync cannot be accelerated.'
        },
        {
          step: 5,
          title: 'Bundle ID Match',
          description: `Verify Bundle ID matches: ${appInfo.bundleId}`,
          status: 'pending',
          action: 'Go to: App Information → Check Bundle ID matches exactly'
        }
      ];

      logger.log('📋 ========== VERIFICATION REPORT ==========');
      logger.log(JSON.stringify(report, null, 2));
      logger.log('📋 ========== END VERIFICATION REPORT ==========');

      return report;
    } catch (error) {
      logger.error('❌ Error generating verification report:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get app bundle identifier and version info for debugging
   */
  async getAppInfo() {
      try {
        const Constants = require('expo-constants').default;
      const bundleId = Constants?.expoConfig?.ios?.bundleIdentifier || 
                  Constants?.manifest?.ios?.bundleIdentifier ||
                  'com.lab.wake.co';
      const version = Constants?.expoConfig?.version || 
                 Constants?.manifest?.version ||
                 '1.1.12';
      const buildNumber = Constants?.expoConfig?.ios?.buildNumber ||
                     Constants?.manifest?.ios?.buildNumber ||
                         '54';
      
        return { 
        bundleId,
        version,
        buildNumber
      };
    } catch (error) {
      logger.error('❌ Error getting app info:', error);
      return {
        bundleId: 'com.lab.wake.co',
        version: '1.1.12',
        buildNumber: '54'
      };
    }
  }

  /**
   * Debug method: Try fetching products with various product IDs to see what's available
   * This helps identify if IAP is working at all
   */
  async debugAvailableProducts(testProductIds = []) {
    try {
      logger.log('🔬 ========== PRODUCT AVAILABILITY DEBUG ==========');
      
      if (!this.isConnected) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return { success: false, error: 'Failed to initialize IAP' };
        }
      }
      
      // Test with empty array first (should return error, but helps test connection)
      logger.log('🔄 Testing connection with empty product array...');
      try {
        const emptyResult = await InAppPurchases.getProductsAsync([]);
        logger.log('📊 Empty array result:', emptyResult);
      } catch (emptyError) {
        logger.log('📊 Empty array error (expected):', emptyError.message);
      }
      
      // Test with the requested product IDs
      if (testProductIds.length > 0) {
        logger.log('🔄 Testing with requested product IDs:', testProductIds);
        const requestedResult = await this.getProducts(testProductIds);
        logger.log('📊 Requested products result:', {
          success: requestedResult.success,
          productsFound: requestedResult.products?.length || 0,
          responseCode: requestedResult.responseCode,
          responseCodeName: this.getResponseCodeName(requestedResult.responseCode || 0)
        });
      }

      // Try some common test product IDs to see if ANY products are available
      const commonTestIds = [
        'test_product',
        'test_subscription',
        'com.test.product',
        'monthly_subscription',
        'yearly_subscription'
      ];

      logger.log('🔄 Testing with common test product IDs to check if IAP is working...');
      for (const testId of commonTestIds) {
        try {
          const { responseCode, results } = await InAppPurchases.getProductsAsync([testId]);
          if (results && results.length > 0) {
            logger.log(`✅ Found product with test ID "${testId}":`, results);
      } else {
            logger.log(`❌ No product found for test ID "${testId}" (response: ${this.getResponseCodeName(responseCode)})`);
          }
        } catch (testError) {
          logger.log(`⚠️ Error testing "${testId}":`, testError.message);
        }
      }

      // Get app info for verification
      const appInfo = await this.getAppInfo();
      logger.log('📱 App Information:', {
        bundleId: appInfo.bundleId,
        version: appInfo.version,
        buildNumber: appInfo.buildNumber
      });
      logger.log('💡 Verify in App Store Connect:');
      logger.log(`   1. Bundle ID matches: ${appInfo.bundleId}`);
      logger.log(`   2. Version matches: ${appInfo.version}`);
      logger.log(`   3. Build number matches: ${appInfo.buildNumber}`);
      logger.log(`   4. Product ID in App Store Connect: ${testProductIds[0] || 'N/A'}`);
      logger.log('   5. Product is associated with this version/build');
      logger.log('   6. Product status is "Ready to Submit"');
      
      logger.log('🔬 ========== PRODUCT AVAILABILITY DEBUG END ==========');
      
          return { 
            success: true,
        message: 'Debug completed - check logs for all product availability tests',
        appInfo,
        requestedProductId: testProductIds[0] || null
      };
    } catch (error) {
      logger.error('❌ Debug products error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Test method: Comprehensive product fetching test
   * This method will test fetching specific products and log all details
   * @param {string[]} productIds - Array of product IDs to test
   * @returns {Promise<Object>} Detailed test results
   */
  async testProductFetching(productIds = ['wake.monthly.subscription']) {
    try {
      logger.log('🧪 ========== PRODUCT FETCHING TEST START ==========');
      logger.log('📋 Testing product IDs:', productIds);
      
      const results = {
        timestamp: new Date().toISOString(),
        productIdsTested: productIds,
        connectionStatus: null,
        appInfo: null,
        testResults: [],
        summary: {
          totalTested: productIds.length,
          found: 0,
          notFound: 0,
          errors: 0
        }
      };

      // 1. Get app info
      results.appInfo = await this.getAppInfo();
      logger.log('📱 App Info:', results.appInfo);

      // 2. Test connection
      logger.log('🔄 Testing IAP connection...');
      if (!this.isConnected) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          results.connectionStatus = { connected: false, error: initResult.error };
          logger.error('❌ Failed to initialize IAP:', initResult.error);
          return { success: false, error: 'Failed to initialize IAP', ...results };
        }
      }
      results.connectionStatus = { connected: true, hasListener: !!this.purchaseUpdateListener };

      // 3. Test sandbox account access
      logger.log('🔄 Testing sandbox account access...');
      try {
        const { results: history } = await InAppPurchases.getPurchaseHistoryAsync();
        logger.log('✅ Purchase history accessible (sandbox account likely signed in)');
        logger.log('📦 Previous purchases:', history?.length || 0);
      } catch (historyError) {
        logger.warn('⚠️ Cannot access purchase history:', historyError.message);
        logger.warn('💡 You may need to sign in with a sandbox tester account');
      }

      // 4. Test each product ID
      for (const productId of productIds) {
        logger.log(`\n🔄 Testing product: ${productId}`);
        const testResult = {
          productId,
          timestamp: new Date().toISOString()
        };

        try {
          const productsResult = await this.getProducts([productId]);
          
          testResult.responseCode = productsResult.responseCode;
          testResult.responseCodeName = this.getResponseCodeName(productsResult.responseCode || 0);
          testResult.success = productsResult.success;
          testResult.productsFound = productsResult.products?.length || 0;
          testResult.error = productsResult.error;

          if (productsResult.products && productsResult.products.length > 0) {
            const product = productsResult.products[0];
            testResult.productDetails = {
              productId: product.productId,
              title: product.title,
              description: product.description,
              price: product.price,
              priceString: product.priceString,
              currency: product.currency,
              subscriptionPeriod: product.subscriptionPeriod,
              subscriptionGroupIdentifier: product.subscriptionGroupIdentifier,
              type: product.type
            };
            logger.log('✅ Product found!');
            logger.log('📦 Product details:', testResult.productDetails);
            results.summary.found++;
      } else {
            logger.warn('❌ Product not found');
            logger.warn('📊 Response:', {
              responseCode: testResult.responseCode,
              responseCodeName: testResult.responseCodeName,
              error: testResult.error
            });
            results.summary.notFound++;
          }
    } catch (error) {
          logger.error('❌ Error testing product:', error);
          testResult.error = error.message;
          testResult.success = false;
          results.summary.errors++;
        }

        results.testResults.push(testResult);
      }

      // 5. Generate summary and recommendations
      logger.log('\n📊 ========== TEST SUMMARY ==========');
      logger.log(`Total products tested: ${results.summary.totalTested}`);
      logger.log(`Found: ${results.summary.found}`);
      logger.log(`Not found: ${results.summary.notFound}`);
      logger.log(`Errors: ${results.summary.errors}`);

      if (results.summary.found === 0) {
        logger.warn('\n⚠️ NO PRODUCTS FOUND - Troubleshooting checklist:');
        logger.warn('1. ✅ Agreements signed? (Check App Store Connect → Agreements, Tax, and Banking)');
        logger.warn('2. ✅ Product ID matches exactly in App Store Connect');
        logger.warn('3. ✅ Product status is "Ready to Submit"');
        logger.warn('4. ✅ Product is associated with app version:', results.appInfo.version);
        logger.warn('5. ✅ Bundle ID matches:', results.appInfo.bundleId);
        logger.warn('6. ✅ Signed in with sandbox tester account');
        logger.warn('7. ⏰ Wait 2-24 hours after creating/associating product for sandbox sync');
      }

      logger.log('🧪 ========== PRODUCT FETCHING TEST END ==========\n');

      return {
        success: results.summary.found > 0,
        ...results
      };
    } catch (error) {
      logger.error('❌ Error in testProductFetching:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Purchase a product
   * @param {string} productId - Product ID to purchase
   */
  async purchaseProduct(productId) {
    try {
      // Prevent concurrent purchase attempts
      if (this.purchaseInProgress) {
        logger.warn('⚠️ Purchase already in progress, ignoring duplicate call');
        logger.log('📊 Current purchase state:', this.getPurchaseState());
        
        // If it's been stuck for too long, allow reset
        // This handles cases where purchase got stuck
        logger.log('💡 If purchase is stuck, call iapService.cancelPurchase() to reset');
          
          return { 
            success: false, 
          error: 'A purchase is already in progress. Please wait for it to complete or call cancelPurchase() to reset.'
        };
      }

      // CRITICAL: Ensure listener is set up BEFORE initiating purchase
      if (!this.isConnected) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return { success: false, error: 'Failed to initialize IAP' };
        }
      }

      // CRITICAL: Ensure listener is active before purchase
      // In production, re-setup listener to ensure it's fresh and working
      // This helps prevent listener not firing in production builds
      const needsReset = !isDevelopment; // Force reset in production for reliability
      
      if (!this.purchaseUpdateListener || needsReset) {
        logger.log(`🔧 ${needsReset ? 'Re-setting up' : 'Setting up'} purchase listener before purchase...`);
        this.setupPurchaseListener(needsReset);
        // Longer delay in production to ensure listener is fully registered
        const delay = needsReset ? 300 : 100;
        await new Promise(resolve => setTimeout(resolve, delay));
        logger.log('✅ Purchase listener ready');
      } else {
        logger.log('✅ Purchase listener already active');
      }
          
      // IMPORTANT: Fetch products first to ensure they're available
      logger.log('🔄 Fetching product before purchase:', productId);
      const productsResult = await this.getProducts([productId]);
      
      if (!productsResult.success || productsResult.products.length === 0) {
          return { 
            success: false, 
          error: productsResult.error || 'Product not available',
          responseCode: productsResult.responseCode
          };
      }

      // Mark purchase as in progress AFTER product is confirmed available
      this.purchaseInProgress = true;

      logger.log('🔄 Initiating purchase for:', productId);
      logger.log('💡 Payment modal should appear now...');

      try {
        // This will show the payment modal (or auto-complete in sandbox if already purchased)
          await InAppPurchases.purchaseItemAsync(productId);
          
        logger.log('✅ purchaseItemAsync returned');
        logger.log('💡 Waiting for purchase listener to fire...');
        
        // Wait longer in production - listener can take more time in production builds
        // Production builds may have different timing due to code optimization
        const maxWaitTime = isDevelopment ? 3000 : 8000; // 3s dev, 8s production
        const checkInterval = 100; // Check every 100ms
        let waitTime = 0;
        
        logger.log(`⏱️ Waiting up to ${maxWaitTime/1000}s for listener (${isDevelopment ? 'dev' : 'production'} mode)...`);
        
        while (this.purchaseInProgress && waitTime < maxWaitTime) {
          await new Promise(resolve => setTimeout(resolve, checkInterval));
          waitTime += checkInterval;
          
          // Log progress every second
          if (waitTime % 1000 === 0) {
            logger.log(`⏳ Still waiting... ${waitTime/1000}s elapsed`);
          }
        }
        
        // Check if listener handled it
        if (!this.purchaseInProgress) {
          logger.log('✅ Purchase was handled by listener');
          return { success: true };
        }
        
        // If still in progress after waiting, try to refresh listener and wait a bit more
        // This handles cases where listener got into a bad state
        if (waitTime >= maxWaitTime && !isDevelopment) {
          logger.warn('⚠️ Listener didn\'t fire after extended wait - attempting listener refresh...');
          try {
            // Re-setup listener
            this.setupPurchaseListener(true);
            // Wait a bit more with refreshed listener
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            if (!this.purchaseInProgress) {
              logger.log('✅ Purchase handled after listener refresh');
              return { success: true };
            }
          } catch (refreshError) {
            logger.error('❌ Error refreshing listener:', refreshError);
          }
        }
        
        // If still in progress, listener might not have fired
        logger.log('⚠️ Purchase may have completed but listener didn\'t fire');
        logger.log('💡 The setTimeout fallback in CourseDetailScreen will handle verification');
        logger.log('📊 Listener status:', {
          hasListener: !!this.purchaseUpdateListener,
          purchaseInProgress: this.purchaseInProgress,
          waitTimeMs: waitTime,
          environment: isDevelopment ? 'development' : 'production'
        });
        
        // Purchase will be handled by the listener OR by the setTimeout fallback
        // Note: purchaseInProgress flag will be reset by handlePurchase() 
        // when the purchase completes (or by error handler if it fails)
      return { success: true };
      } catch (purchaseError) {
        // Reset flag immediately on error
        this.purchaseInProgress = false;
        logger.error('❌ purchaseItemAsync error:', purchaseError);
        throw purchaseError; // Re-throw to be caught by outer catch
      }
    } catch (error) {
      logger.error('❌ Error purchasing product:', error);
      this.purchaseInProgress = false; // Reset on error
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel/reset ongoing purchase operation
   * Use this if a purchase gets stuck
   */
  cancelPurchase() {
    logger.log('🛑 Canceling/resetting purchase operation...');
    logger.log('📊 Current state before reset:', {
      purchaseInProgress: this.purchaseInProgress,
      pendingPurchasesCount: this.pendingPurchases.size,
      hasListener: !!this.purchaseUpdateListener
    });
    this.purchaseInProgress = false;
    // Clear all pending purchases as a safety measure
    this.pendingPurchases.clear();
    logger.log('✅ Purchase state reset');
    return { success: true, message: 'Purchase state reset' };
  }

  /**
   * Get current purchase state for debugging
   */
  getPurchaseState() {
    return {
      purchaseInProgress: this.purchaseInProgress,
      pendingPurchasesCount: this.pendingPurchases.size,
      pendingPurchases: Array.from(this.pendingPurchases.entries()),
      hasListener: !!this.purchaseUpdateListener,
      isConnected: this.isConnected
    };
  }

  /**
   * Set pending purchase info (userId and courseId) for a product
   */
  setPendingPurchase(productId, data) {
    this.pendingPurchases.set(productId, data);
    logger.log('📝 Stored pending purchase info for:', productId);
  }

  /**
   * Get pending purchase info
   */
  getPendingPurchase(productId) {
    return this.pendingPurchases.get(productId);
  }

  /**
   * Clear pending purchase info
   */
  clearPendingPurchase(productId) {
    this.pendingPurchases.delete(productId);
  }

  /**
   * Handle completed purchase
   * This will be called by the purchase listener
   * Verifies receipt with cloud function, which will assign the course
   */
  async handlePurchase(purchase) {
    try {
      logger.log('🔄 Processing purchase:', purchase.productId);
      logger.log('📦 Purchase object fields:', {
        productId: purchase.productId,
        orderId: purchase.orderId,
        transactionId: purchase.transactionId,
        hasTransactionReceipt: !!purchase.transactionReceipt,
        transactionReceiptLength: purchase.transactionReceipt?.length || 0,
        hasReceipt: !!purchase.receipt,
        receiptLength: purchase.receipt?.length || 0
      });
      
      // Reset purchase in progress flag since purchase is complete
      this.purchaseInProgress = false;

      // Get userId and courseId from pending purchases
      const pendingData = this.pendingPurchases.get(purchase.productId);
      if (!pendingData) {
        logger.error('❌ No pending data found for product:', purchase.productId);
        // Still try to finish the transaction
        await InAppPurchases.finishTransactionAsync(purchase, true);
        return { success: false, error: 'No user/course data found for purchase' };
      }

      const { userId, courseId } = pendingData;
      this.clearPendingPurchase(purchase.productId);

      // IMPORTANT: Verify receipt with cloud function
      // The cloud function will verify with Apple AND assign the course
      logger.log('🔐 Verifying receipt with cloud function...');
      const verificationResult = await this.verifyReceipt(purchase, userId, courseId);
      
      if (verificationResult.success) {
        // Finish the transaction
        await InAppPurchases.finishTransactionAsync(purchase, true);
        logger.log('✅ Purchase verified and course assigned by cloud function');
      } else {
        logger.error('❌ Receipt verification failed:', verificationResult.error);
        // Don't finish transaction if verification failed
      }
      
      return verificationResult;
    } catch (error) {
      logger.error('❌ Error handling purchase:', error);
      this.purchaseInProgress = false; // Reset on error
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify receipt with Firebase Function
   * The cloud function verifies with Apple and assigns the course
   * Includes retry logic for network failures
   */
  async verifyReceipt(purchase, userId, courseId, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY = 1000; // 1 second
    
    try {
      // expo-in-app-purchases provides receipt as transactionReceipt, not receipt
      const receipt = purchase.transactionReceipt || purchase.receipt;
      
      if (!receipt) {
        logger.error('❌ Purchase missing receipt/transactionReceipt');
        logger.log('📦 Available purchase fields:', Object.keys(purchase));
        return { success: false, error: 'Purchase missing receipt data' };
      }

      logger.log('🔄 Verifying receipt with cloud function...', {
        attempt: retryCount + 1,
        maxRetries: MAX_RETRIES
      });
      logger.log('📋 Receipt details:', {
        productId: purchase.productId,
        transactionId: purchase.orderId || purchase.transactionId,
        userId,
        courseId,
        receiptLength: receipt.length,
        hasTransactionReceipt: !!purchase.transactionReceipt,
        hasReceipt: !!purchase.receipt
      });
      
      try {
        // Create AbortController for timeout (AbortSignal.timeout not available in React Native)
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      const response = await fetch(
        'https://us-central1-wolf-20b8b.cloudfunctions.net/verifyIAPReceipt',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              receipt: receipt, // Send transactionReceipt as receipt
            transactionId: purchase.orderId || purchase.transactionId,
            productId: purchase.productId,
            userId: userId,
            courseId: courseId
            }),
            signal: controller.signal
        }
      );
        
        clearTimeout(timeoutId);

      const result = await response.json();
        
        logger.log('📊 Receipt verification response:', {
          success: result.success,
          statusCode: response.status,
          attempt: retryCount + 1,
          result
        });
      
      if (result.success) {
          logger.log('✅ Receipt verified and course assigned by cloud function');
          return result;
      } else {
          // Don't retry on Apple verification errors (status codes)
          if (result.status && result.status !== 0) {
            logger.error('❌ Receipt verification failed (Apple error):', {
              error: result.error,
              status: result.status,
              statusDescription: result.statusDescription
            });
            return result;
          }
          
          // Retry on other errors
          if (retryCount < MAX_RETRIES) {
            logger.warn(`⚠️ Retrying receipt verification (${retryCount + 1}/${MAX_RETRIES})...`);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
            return this.verifyReceipt(purchase, userId, courseId, retryCount + 1);
          }
          
          logger.error('❌ Receipt verification failed after retries:', {
            error: result.error,
            status: result.status,
            statusDescription: result.statusDescription
          });
      return result;
        }
      } catch (fetchError) {
        // Network error - retry
        if (retryCount < MAX_RETRIES && (
          fetchError.name === 'AbortError' || 
          fetchError.message.includes('network') ||
          fetchError.message.includes('timeout') ||
          fetchError.message.includes('fetch') ||
          fetchError.message.includes('aborted')
        )) {
          logger.warn(`⚠️ Network error, retrying receipt verification (${retryCount + 1}/${MAX_RETRIES})...`, {
            error: fetchError.message,
            name: fetchError.name
          });
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * (retryCount + 1)));
          return this.verifyReceipt(purchase, userId, courseId, retryCount + 1);
        }
        
        throw fetchError;
      }
    } catch (error) {
      logger.error('❌ Error verifying receipt:', {
        error: error.message,
        stack: error.stack,
        attempt: retryCount + 1
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify the latest purchase for a product
   * Note: Purchase history may not include receipts - this is a fallback
   * The purchase listener should handle new purchases with receipts
   */
  async verifyLatestPurchase(productId, userId, courseId) {
    try {
      logger.log('🔄 Verifying latest purchase for product:', productId);
      
      if (!this.isConnected) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return { success: false, error: 'Failed to initialize IAP' };
        }
      }

      // Get purchase history to find the latest purchase
        const { results } = await InAppPurchases.getPurchaseHistoryAsync();
      
      if (!results || results.length === 0) {
        logger.warn('⚠️ No purchases found in history');
        return { success: false, error: 'No purchases found' };
      }

      // Find the most recent purchase for this product
      const productPurchases = results
        .filter(p => p.productId === productId)
        .sort((a, b) => (b.purchaseTime || 0) - (a.purchaseTime || 0));

      if (productPurchases.length === 0) {
        logger.warn('⚠️ No purchases found for product:', productId);
        return { success: false, error: `No purchases found for product ${productId}` };
      }

      const latestPurchase = productPurchases[0];
      logger.log('📦 Latest purchase found:', {
        productId: latestPurchase.productId,
        orderId: latestPurchase.orderId,
        transactionId: latestPurchase.transactionId,
        purchaseTime: latestPurchase.purchaseTime,
        hasTransactionReceipt: !!latestPurchase.transactionReceipt,
        hasReceipt: !!latestPurchase.receipt
      });

      // Check if purchase has receipt data
      let receipt = latestPurchase.transactionReceipt || latestPurchase.receipt;
      
      if (!receipt) {
        logger.warn('⚠️ Purchase history entry missing receipt - trying to get app receipt...');
        logger.warn('💡 This can happen if listener didn\'t fire - attempting alternative method');
        
        // In production, if listener didn't fire and purchase history has no receipt,
        // we need to rely on the CourseDetailScreen setTimeout fallback or user restore
        // Unfortunately, expo-in-app-purchases doesn't provide a way to get receipt 
        // without the listener callback
        
        // However, we can try to refresh the connection and check again
        // This sometimes helps in production scenarios
        try {
          logger.log('🔄 Attempting to refresh IAP connection...');
          await InAppPurchases.disconnectAsync();
          this.isConnected = false;
          await new Promise(resolve => setTimeout(resolve, 500));
          await InAppPurchases.connectAsync();
          this.isConnected = true;
          
          // Re-setup listener after reconnection
          this.setupPurchaseListener(true);
          await new Promise(resolve => setTimeout(resolve, 200));
          
          // Re-check purchase history after reconnection
          const { results: refreshedResults } = await InAppPurchases.getPurchaseHistoryAsync();
          if (refreshedResults && refreshedResults.length > 0) {
            const refreshedProductPurchases = refreshedResults
              .filter(p => p.productId === productId)
              .sort((a, b) => (b.purchaseTime || 0) - (a.purchaseTime || 0));
            
            if (refreshedProductPurchases.length > 0) {
              const refreshedPurchase = refreshedProductPurchases[0];
              receipt = refreshedPurchase.transactionReceipt || refreshedPurchase.receipt;
              if (receipt) {
                logger.log('✅ Got receipt after reconnection');
                // Use the refreshed purchase object
                Object.assign(latestPurchase, refreshedPurchase);
              }
            }
          }
        } catch (reconnectError) {
          logger.error('❌ Error during reconnection attempt:', reconnectError);
        }
        
        // If still no receipt, return error
        if (!receipt) {
          logger.warn('⚠️ Still no receipt after reconnection attempt');
          logger.warn('💡 Purchase should be handled by listener, but it may not have fired');
          logger.warn('💡 User should try "Restore Purchases" if purchase completed');
        return { 
          success: false, 
            error: 'Purchase history entry missing receipt. The purchase listener may not have fired. Please try "Restore Purchases" if the purchase completed.' 
          };
        }
      }

      // Verify receipt with cloud function (which will assign the course)
      logger.log('🔐 Verifying receipt with cloud function...');
      const verificationResult = await this.verifyReceipt(latestPurchase, userId, courseId);
      
      if (verificationResult.success) {
        // Finish the transaction
        await InAppPurchases.finishTransactionAsync(latestPurchase, true);
        logger.log('✅ Purchase verified and course assigned by cloud function');
      } else {
        logger.error('❌ Receipt verification failed:', verificationResult.error);
      }

      return verificationResult;
    } catch (error) {
      logger.error('❌ Error verifying latest purchase:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Restore purchases
   * This will fetch purchase history and attempt to verify each purchase
   * Note: Purchase history may not include receipts, so verification may not be possible
   * The app should handle this gracefully
   */
  async restorePurchases() {
    try {
      if (!this.isConnected) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return { success: false, error: 'Failed to initialize IAP' };
        }
      }

      logger.log('🔄 Restoring purchases...');
      
      try {
        const { results } = await InAppPurchases.getPurchaseHistoryAsync();
        
        logger.log('✅ Found purchases:', results?.length || 0);

        if (!results || results.length === 0) {
        return {
          success: true,
            purchases: [],
            count: 0,
            message: 'No purchases found to restore'
          };
        }

        // Log purchase details for debugging
        const purchaseDetails = results.map(p => ({
          productId: p.productId,
          orderId: p.orderId,
          transactionId: p.transactionId,
          purchaseTime: p.purchaseTime,
          hasReceipt: !!(p.transactionReceipt || p.receipt)
        }));
        
        logger.log('📦 Purchase details:', purchaseDetails);

        // Note: Purchase history entries typically don't include receipts
        // Receipts are only available in the purchase listener for new purchases
        // The app should handle restoration by checking user's courses/subscriptions
        // which should already be synced from previous purchases
        
          return {
          success: true,
          purchases: results,
          count: results.length,
          message: `Found ${results.length} purchase(s). Note: Purchase history may not include receipts. Your purchases should already be synced.`
        };
      } catch (historyError) {
        logger.error('❌ Error fetching purchase history:', historyError);
        
        // Check if it's a sandbox account issue
        if (historyError.code === InAppPurchases.IAPResponseCode.USER_CANCELED || 
            historyError.message?.includes('sandbox')) {
        return {
          success: false,
            error: 'Please sign in with a sandbox tester account to restore purchases',
            code: historyError.code
        };
        }
        
        return { success: false, error: historyError.message || 'Failed to fetch purchase history' };
      }
    } catch (error) {
      logger.error('❌ Error restoring purchases:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Force sandbox sign-in prompt by attempting to restore purchases
   * This can trigger the sandbox sign-in dialog if user is not signed in
   */
  async attemptSandboxSignIn() {
    try {
      if (!this.isConnected) {
        const initResult = await this.initialize();
        if (!initResult.success) {
          return { success: false, error: 'Failed to initialize IAP' };
        }
      }

      logger.log('🔄 Attempting to trigger sandbox sign-in...');
      logger.log('💡 This may prompt you to sign in with a sandbox account');
      
      // Try to get purchase history - this often triggers sandbox sign-in
      try {
      const { results } = await InAppPurchases.getPurchaseHistoryAsync();
        logger.log('✅ Purchase history accessible - sandbox account may be signed in');
        return { 
          success: true, 
          message: 'Purchase history check completed. If prompted, sign in with sandbox account.',
          purchases: results || []
        };
    } catch (error) {
        logger.warn('⚠️ Purchase history check may trigger sandbox sign-in:', error.message);
        return { 
          success: true,
          message: 'Attempted to trigger sandbox sign-in. Check if sign-in prompt appeared.',
          attempted: true
        };
      }
    } catch (error) {
      logger.error('❌ Error attempting sandbox sign-in:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Disconnect from IAP
   */
  async disconnect() {
    try {
      if (this.purchaseUpdateListener) {
        this.purchaseUpdateListener.remove();
        this.purchaseUpdateListener = null;
      }

      if (this.isConnected) {
        await InAppPurchases.disconnectAsync();
        this.isConnected = false;
        logger.log('✅ IAP disconnected');
      }
    } catch (error) {
      logger.error('❌ Error disconnecting IAP:', error);
    }
  }

  /**
   * Get human-readable name for response code
   */
  getResponseCodeName(responseCode) {
    const names = {
      [InAppPurchases.IAPResponseCode.OK]: 'OK',
      [InAppPurchases.IAPResponseCode.USER_CANCELED]: 'USER_CANCELED',
      [InAppPurchases.IAPResponseCode.ERROR]: 'ERROR',
      [InAppPurchases.IAPResponseCode.DEFERRED]: 'DEFERRED',
      [InAppPurchases.IAPResponseCode.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
      [InAppPurchases.IAPResponseCode.PAYMENT_INVALID]: 'PAYMENT_INVALID',
      [InAppPurchases.IAPResponseCode.PAYMENT_NOT_ALLOWED]: 'PAYMENT_NOT_ALLOWED',
      [InAppPurchases.IAPResponseCode.STORE_PRODUCT_NOT_AVAILABLE]: 'STORE_PRODUCT_NOT_AVAILABLE',
    };
    return names[responseCode] || `UNKNOWN(${responseCode})`;
  }

  /**
   * Get human-readable message for response code
   */
  getResponseCodeMessage(responseCode) {
    const messages = {
      [InAppPurchases.IAPResponseCode.OK]: 'OK',
      [InAppPurchases.IAPResponseCode.USER_CANCELED]: 'User canceled',
      [InAppPurchases.IAPResponseCode.ERROR]: 'Error occurred',
      [InAppPurchases.IAPResponseCode.DEFERRED]: 'Purchase deferred',
      [InAppPurchases.IAPResponseCode.SERVICE_UNAVAILABLE]: 'Service unavailable',
      [InAppPurchases.IAPResponseCode.PAYMENT_INVALID]: 'Payment invalid',
      [InAppPurchases.IAPResponseCode.PAYMENT_NOT_ALLOWED]: 'Payment not allowed',
      [InAppPurchases.IAPResponseCode.STORE_PRODUCT_NOT_AVAILABLE]: 'Product not available in store',
    };
    return messages[responseCode] || `Unknown error: ${responseCode}`;
  }
}

export default new IAPService();

