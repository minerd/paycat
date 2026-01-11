import Foundation

/// PayCat SDK Errors
public enum PayCatError: LocalizedError {
    case notConfigured
    case invalidURL
    case networkError
    case httpError(Int)
    case apiError(String, String)
    case productNotFound(String)
    case purchaseCancelled
    case purchasePending
    case verificationFailed(String)
    case noEntitlements
    case unknown

    public var errorDescription: String? {
        switch self {
        case .notConfigured:
            return "PayCat is not configured. Call PayCat.shared.configure() first."
        case .invalidURL:
            return "Invalid API URL"
        case .networkError:
            return "Network request failed"
        case .httpError(let code):
            return "HTTP error: \(code)"
        case .apiError(let code, let message):
            return "API error [\(code)]: \(message)"
        case .productNotFound(let id):
            return "Product not found: \(id)"
        case .purchaseCancelled:
            return "Purchase was cancelled"
        case .purchasePending:
            return "Purchase is pending approval"
        case .verificationFailed(let reason):
            return "Transaction verification failed: \(reason)"
        case .noEntitlements:
            return "No entitlements found"
        case .unknown:
            return "An unknown error occurred"
        }
    }

    public var recoverySuggestion: String? {
        switch self {
        case .notConfigured:
            return "Configure PayCat in your app delegate with your API key."
        case .networkError:
            return "Check your internet connection and try again."
        case .purchaseCancelled:
            return "User cancelled the purchase. No action needed."
        case .purchasePending:
            return "The purchase requires approval (e.g., Ask to Buy)."
        default:
            return nil
        }
    }
}
