import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'package:in_app_purchase/in_app_purchase.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'models.dart';
import 'exceptions.dart';

/// MRRCat Flutter SDK
class MRRCat {
  static MRRCat? _instance;
  static MRRCat get instance {
    if (_instance == null) {
      throw MRRCatNotConfiguredException();
    }
    return _instance!;
  }

  /// Check if MRRCat is configured
  static bool get isConfigured => _instance != null;

  final String _apiKey;
  String _appUserID;
  final String _baseURL;

  final InAppPurchase _iap = InAppPurchase.instance;
  StreamSubscription<List<PurchaseDetails>>? _purchaseSubscription;

  SubscriberInfo? _cachedSubscriberInfo;
  DateTime? _cacheExpiry;
  final Duration _cacheDuration = const Duration(minutes: 5);

  final _subscriberInfoController = StreamController<SubscriberInfo>.broadcast();

  /// Stream of subscriber info updates
  Stream<SubscriberInfo> get subscriberInfoStream => _subscriberInfoController.stream;

  /// Current subscriber info (cached)
  SubscriberInfo? get subscriberInfo => _cachedSubscriberInfo;

  /// Current app user ID
  String get appUserID => _appUserID;

  MRRCat._({
    required String apiKey,
    required String appUserID,
    required String baseURL,
  })  : _apiKey = apiKey,
        _appUserID = appUserID,
        _baseURL = baseURL;

  /// Configure MRRCat SDK
  static Future<MRRCat> configure({
    required String apiKey,
    String? appUserID,
    String baseURL = 'https://mrrcat.ongoru.workers.dev',
  }) async {
    if (_instance != null) {
      return _instance!;
    }

    final userID = appUserID ?? await _getOrCreateAnonymousID();

    _instance = MRRCat._(
      apiKey: apiKey,
      appUserID: userID,
      baseURL: baseURL,
    );

    await _instance!._initialize();
    return _instance!;
  }

  Future<void> _initialize() async {
    // Setup purchase listener
    _purchaseSubscription = _iap.purchaseStream.listen(
      _onPurchaseUpdated,
      onError: (error) {
        debugPrint('MRRCat: Purchase stream error: $error');
      },
    );

    // Fetch initial subscriber info
    try {
      await getSubscriberInfo();
    } catch (e) {
      debugPrint('MRRCat: Failed to fetch initial subscriber info: $e');
    }
  }

  /// Get subscriber info
  Future<SubscriberInfo> getSubscriberInfo({bool forceRefresh = false}) async {
    if (!forceRefresh &&
        _cachedSubscriberInfo != null &&
        _cacheExpiry != null &&
        DateTime.now().isBefore(_cacheExpiry!)) {
      return _cachedSubscriberInfo!;
    }

    final response = await _apiRequest('GET', '/v1/subscribers/$_appUserID');
    final data = jsonDecode(response.body);
    final info = SubscriberInfo.fromJson(data['subscriber']);

    _cachedSubscriberInfo = info;
    _cacheExpiry = DateTime.now().add(_cacheDuration);
    _subscriberInfoController.add(info);

    return info;
  }

  /// Check if user has active entitlement
  Future<bool> hasEntitlement(String identifier) async {
    final info = await getSubscriberInfo();
    return info.entitlements[identifier]?.isActive ?? false;
  }

  /// Identify user (login)
  Future<SubscriberInfo> identify(String newAppUserID) async {
    _appUserID = newAppUserID;
    _cachedSubscriberInfo = null;
    _cacheExpiry = null;
    return getSubscriberInfo();
  }

  /// Log out and switch to anonymous user
  Future<SubscriberInfo> logOut() async {
    _appUserID = await _getOrCreateAnonymousID(forceNew: true);
    _cachedSubscriberInfo = null;
    _cacheExpiry = null;
    return getSubscriberInfo();
  }

  /// Get available products
  Future<List<ProductDetails>> getProducts(Set<String> productIDs) async {
    final available = await _iap.isAvailable();
    if (!available) {
      throw MRRCatException('store_unavailable', 'In-app purchases are not available');
    }

    final response = await _iap.queryProductDetails(productIDs);
    if (response.error != null) {
      throw MRRCatException('product_query_failed', response.error!.message);
    }

    return response.productDetails;
  }

  /// Purchase a product
  Future<SubscriberInfo> purchase(ProductDetails product) async {
    final purchaseParam = PurchaseParam(productDetails: product);

    final result = await _iap.buyNonConsumable(purchaseParam: purchaseParam);
    if (!result) {
      throw MRRCatPurchaseCancelledException();
    }

    // Wait for purchase to complete via stream
    final completer = Completer<SubscriberInfo>();

    late StreamSubscription<SubscriberInfo> subscription;
    subscription = subscriberInfoStream.listen((info) {
      if (!completer.isCompleted) {
        completer.complete(info);
        subscription.cancel();
      }
    });

    // Timeout after 60 seconds
    Future.delayed(const Duration(seconds: 60), () {
      if (!completer.isCompleted) {
        subscription.cancel();
        completer.completeError(
          MRRCatException('purchase_timeout', 'Purchase timed out'),
        );
      }
    });

    return completer.future;
  }

  /// Restore purchases
  Future<SubscriberInfo> restorePurchases() async {
    await _iap.restorePurchases();
    return getSubscriberInfo(forceRefresh: true);
  }

  // Offerings
  Offerings? _cachedOfferings;
  DateTime? _offeringsCacheExpiry;

  /// Cached offerings
  Offerings? get offerings => _cachedOfferings;

  /// Get offerings
  Future<Offerings> getOfferings({bool forceRefresh = false}) async {
    if (!forceRefresh &&
        _cachedOfferings != null &&
        _offeringsCacheExpiry != null &&
        DateTime.now().isBefore(_offeringsCacheExpiry!)) {
      return _cachedOfferings!;
    }

    final response = await _apiRequest('GET', '/v1/offerings?app_user_id=$_appUserID');
    final data = jsonDecode(response.body);
    final offerings = Offerings.fromJson(data);

    _cachedOfferings = offerings;
    _offeringsCacheExpiry = DateTime.now().add(_cacheDuration);

    return offerings;
  }

  /// Get current offering
  Future<Offering?> getCurrentOffering() async {
    final offerings = await getOfferings();
    return offerings.current;
  }

  /// Get offering by identifier
  Future<Offering?> getOffering(String identifier) async {
    final offerings = await getOfferings();
    return offerings.all[identifier];
  }

  void _onPurchaseUpdated(List<PurchaseDetails> purchases) async {
    for (final purchase in purchases) {
      if (purchase.status == PurchaseStatus.purchased ||
          purchase.status == PurchaseStatus.restored) {
        try {
          await _syncPurchase(purchase);

          if (purchase.pendingCompletePurchase) {
            await _iap.completePurchase(purchase);
          }

          await getSubscriberInfo(forceRefresh: true);
        } catch (e) {
          debugPrint('MRRCat: Failed to sync purchase: $e');
        }
      } else if (purchase.status == PurchaseStatus.error) {
        debugPrint('MRRCat: Purchase error: ${purchase.error}');
      }
    }
  }

  Future<void> _syncPurchase(PurchaseDetails purchase) async {
    final platform = Platform.isIOS ? 'ios' : 'android';

    final body = {
      'app_user_id': _appUserID,
      'platform': platform,
      'receipt_data': {
        if (Platform.isIOS) 'transaction_id': purchase.purchaseID,
        if (Platform.isAndroid) 'purchase_token': purchase.verificationData.serverVerificationData,
        'product_id': purchase.productID,
      },
    };

    await _apiRequest('POST', '/v1/receipts', body: body);
  }

  Future<http.Response> _apiRequest(
    String method,
    String path, {
    Map<String, dynamic>? body,
  }) async {
    final uri = Uri.parse('$_baseURL$path');

    final headers = {
      'Content-Type': 'application/json',
      'X-API-Key': _apiKey,
      'User-Agent': 'MRRCat-Flutter/1.0.0',
    };

    http.Response response;

    switch (method) {
      case 'GET':
        response = await http.get(uri, headers: headers);
        break;
      case 'POST':
        response = await http.post(
          uri,
          headers: headers,
          body: body != null ? jsonEncode(body) : null,
        );
        break;
      default:
        throw MRRCatException('invalid_method', 'Invalid HTTP method: $method');
    }

    if (response.statusCode >= 400) {
      try {
        final error = jsonDecode(response.body);
        throw MRRCatApiException(
          error['error']['code'] ?? 'unknown',
          error['error']['message'] ?? 'Request failed',
        );
      } catch (e) {
        if (e is MRRCatException) rethrow;
        throw MRRCatHttpException(response.statusCode);
      }
    }

    return response;
  }

  static Future<String> _getOrCreateAnonymousID({bool forceNew = false}) async {
    final prefs = await SharedPreferences.getInstance();
    const key = 'mrrcat_anonymous_id';

    if (!forceNew) {
      final stored = prefs.getString(key);
      if (stored != null) return stored;
    }

    final id = '\$anon_${DateTime.now().millisecondsSinceEpoch}_${_generateRandomString(8)}';
    await prefs.setString(key, id);
    return id;
  }

  static String _generateRandomString(int length) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    final random = DateTime.now().millisecondsSinceEpoch;
    return String.fromCharCodes(
      Iterable.generate(
        length,
        (_) => chars.codeUnitAt((random + _) % chars.length),
      ),
    );
  }

  /// Dispose resources
  void dispose() {
    _purchaseSubscription?.cancel();
    _subscriberInfoController.close();
  }
}
