/// MRRCat Exception base class
class MRRCatException implements Exception {
  final String code;
  final String message;

  MRRCatException(this.code, this.message);

  @override
  String toString() => 'MRRCatException($code): $message';
}

/// Thrown when MRRCat is not configured
class MRRCatNotConfiguredException extends MRRCatException {
  MRRCatNotConfiguredException()
      : super('not_configured', 'MRRCat is not configured. Call MRRCat.configure() first.');
}

/// Thrown when purchase is cancelled by user
class MRRCatPurchaseCancelledException extends MRRCatException {
  MRRCatPurchaseCancelledException()
      : super('purchase_cancelled', 'Purchase was cancelled by user.');
}

/// Thrown when purchase verification fails
class MRRCatVerificationFailedException extends MRRCatException {
  MRRCatVerificationFailedException([String? details])
      : super('verification_failed', details ?? 'Purchase verification failed.');
}

/// Thrown for API errors
class MRRCatApiException extends MRRCatException {
  MRRCatApiException(String code, String message) : super(code, message);
}

/// Thrown for HTTP errors
class MRRCatHttpException extends MRRCatException {
  final int statusCode;

  MRRCatHttpException(this.statusCode)
      : super('http_error', 'HTTP request failed with status $statusCode');
}

/// Thrown for network errors
class MRRCatNetworkException extends MRRCatException {
  MRRCatNetworkException([String? details])
      : super('network_error', details ?? 'Network request failed.');
}

/// Thrown when product is not found
class MRRCatProductNotFoundException extends MRRCatException {
  final String productId;

  MRRCatProductNotFoundException(this.productId)
      : super('product_not_found', 'Product not found: $productId');
}
