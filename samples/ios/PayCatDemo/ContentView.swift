import SwiftUI
import PayCat
import StoreKit

struct ContentView: View {
    @StateObject private var viewModel = SubscriptionViewModel()

    var body: some View {
        NavigationView {
            List {
                // Status Section
                Section("Subscription Status") {
                    if viewModel.isLoading {
                        ProgressView()
                    } else if let info = viewModel.subscriberInfo {
                        if info.hasActiveEntitlement {
                            Label("Premium Active", systemImage: "checkmark.seal.fill")
                                .foregroundColor(.green)

                            if let expiry = info.entitlements["premium"]?.expiresDate {
                                Text("Expires: \(expiry.formatted())")
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        } else {
                            Label("Free User", systemImage: "person.fill")
                                .foregroundColor(.orange)
                        }

                        Text("User ID: \(info.originalAppUserID)")
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }

                // Offerings Section
                if let offering = viewModel.currentOffering {
                    Section("Available Plans") {
                        ForEach(offering.availablePackages, id: \.identifier) { package in
                            PackageRow(package: package, viewModel: viewModel)
                        }
                    }
                }

                // Actions Section
                Section("Actions") {
                    Button("Restore Purchases") {
                        Task {
                            await viewModel.restorePurchases()
                        }
                    }

                    Button("Refresh") {
                        Task {
                            await viewModel.refresh()
                        }
                    }
                }
            }
            .navigationTitle("PayCat Demo")
            .alert("Error", isPresented: $viewModel.showError) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(viewModel.errorMessage)
            }
        }
    }
}

struct PackageRow: View {
    let package: Package
    @ObservedObject var viewModel: SubscriptionViewModel

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(package.displayName ?? package.identifier)
                    .font(.headline)

                if let description = package.description {
                    Text(description)
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                if let product = package.products.first, let price = product.price {
                    Text(price.formatted)
                        .font(.subheadline)
                        .foregroundColor(.blue)
                }
            }

            Spacer()

            Button("Subscribe") {
                Task {
                    await viewModel.purchase(package: package)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(viewModel.isPurchasing)
        }
        .padding(.vertical, 8)
    }
}

@MainActor
class SubscriptionViewModel: ObservableObject {
    @Published var subscriberInfo: SubscriberInfo?
    @Published var currentOffering: Offering?
    @Published var isLoading = true
    @Published var isPurchasing = false
    @Published var showError = false
    @Published var errorMessage = ""

    init() {
        Task {
            await configure()
        }
    }

    func configure() async {
        // Configure PayCat with your API key
        PayCat.shared.configure(
            apiKey: "pk_test_your_api_key_here"
        )

        await refresh()
    }

    func refresh() async {
        isLoading = true
        defer { isLoading = false }

        do {
            async let infoTask = PayCat.shared.getSubscriberInfo(forceRefresh: true)
            async let offeringsTask = PayCat.shared.getOfferings(forceRefresh: true)

            let (info, offerings) = try await (infoTask, offeringsTask)

            subscriberInfo = info
            currentOffering = offerings.current
        } catch {
            showError(error)
        }
    }

    @available(iOS 15.0, *)
    func purchase(package: Package) async {
        guard let productInfo = package.products.first else { return }

        isPurchasing = true
        defer { isPurchasing = false }

        do {
            let info = try await PayCat.shared.purchase(productID: productInfo.storeProductId)
            subscriberInfo = info
        } catch PayCatError.purchaseCancelled {
            // User cancelled, no error needed
        } catch {
            showError(error)
        }
    }

    func restorePurchases() async {
        isLoading = true
        defer { isLoading = false }

        do {
            if #available(iOS 15.0, *) {
                subscriberInfo = try await PayCat.shared.restorePurchases()
            }
        } catch {
            showError(error)
        }
    }

    private func showError(_ error: Error) {
        errorMessage = error.localizedDescription
        showError = true
    }
}

#Preview {
    ContentView()
}
