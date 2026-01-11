/// PayCat Exception base class
class PayCatException implements Exception {
  final String code;
  final String message;

  PayCatException(this.code, this.message);

  @override
  String toString() => 'PayCatException($code): $message';
}

/// Thrown when PayCat is not configured
class PayCatNotConfiguredException extends PayCatException {
  PayCatNotConfiguredException()
      : super('not_configured', 'PayCat is not configured. Call PayCat.configure() first.');
}

/// Thrown when purchase is cancelled by user
class PayCatPurchaseCancelledException extends PayCatException {
  PayCatPurchaseCancelledException()
      : super('purchase_cancelled', 'Purchase was cancelled by user.');
}

/// Thrown when purchase verification fails
class PayCatVerificationFailedException extends PayCatException {
  PayCatVerificationFailedException([String? details])
      : super('verification_failed', details ?? 'Purchase verification failed.');
}

/// Thrown for API errors
class PayCatApiException extends PayCatException {
  PayCatApiException(String code, String message) : super(code, message);
}

/// Thrown for HTTP errors
class PayCatHttpException extends PayCatException {
  final int statusCode;

  PayCatHttpException(this.statusCode)
      : super('http_error', 'HTTP request failed with status $statusCode');
}

/// Thrown for network errors
class PayCatNetworkException extends PayCatException {
  PayCatNetworkException([String? details])
      : super('network_error', details ?? 'Network request failed.');
}

/// Thrown when product is not found
class PayCatProductNotFoundException extends PayCatException {
  final String productId;

  PayCatProductNotFoundException(this.productId)
      : super('product_not_found', 'Product not found: $productId');
}
