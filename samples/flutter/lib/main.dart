import 'package:flutter/material.dart';
import 'package:paycat_flutter/paycat_flutter.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Configure PayCat
  await PayCat.configure(apiKey: 'pk_test_your_api_key_here');

  runApp(const PayCatDemoApp());
}

class PayCatDemoApp extends StatelessWidget {
  const PayCatDemoApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'PayCat Demo',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue),
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  SubscriberInfo? _subscriberInfo;
  Offerings? _offerings;
  bool _isLoading = true;
  bool _isPurchasing = false;

  @override
  void initState() {
    super.initState();
    _loadData();

    // Listen to subscriber info updates
    PayCat.instance.subscriberInfoStream.listen((info) {
      setState(() => _subscriberInfo = info);
    });
  }

  Future<void> _loadData() async {
    setState(() => _isLoading = true);

    try {
      final info = await PayCat.instance.getSubscriberInfo();
      final offerings = await PayCat.instance.getOfferings();

      setState(() {
        _subscriberInfo = info;
        _offerings = offerings;
      });
    } catch (e) {
      _showError('Failed to load data: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  Future<void> _purchase(Package package) async {
    final products = await PayCat.instance.getProducts(
      package.products.map((p) => p.storeProductId).toSet(),
    );

    if (products.isEmpty) {
      _showError('Product not available');
      return;
    }

    setState(() => _isPurchasing = true);

    try {
      await PayCat.instance.purchase(products.first);
      _showSuccess('Purchase completed!');
    } on PayCatPurchaseCancelledException {
      // User cancelled
    } catch (e) {
      _showError('Purchase failed: $e');
    } finally {
      setState(() => _isPurchasing = false);
    }
  }

  Future<void> _restorePurchases() async {
    setState(() => _isLoading = true);

    try {
      await PayCat.instance.restorePurchases();
      _showSuccess('Purchases restored!');
    } catch (e) {
      _showError('Restore failed: $e');
    } finally {
      setState(() => _isLoading = false);
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.red),
    );
  }

  void _showSuccess(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message), backgroundColor: Colors.green),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('PayCat Demo'),
        backgroundColor: Theme.of(context).colorScheme.inversePrimary,
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _loadData,
              child: ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _buildStatusCard(),
                  const SizedBox(height: 24),
                  _buildOfferingsSection(),
                  const SizedBox(height: 24),
                  _buildActionsSection(),
                ],
              ),
            ),
    );
  }

  Widget _buildStatusCard() {
    final isPremium = _subscriberInfo?.hasActiveEntitlement ?? false;
    final entitlement = _subscriberInfo?.entitlements['premium'];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Subscription Status',
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                Icon(
                  isPremium ? Icons.verified : Icons.person,
                  color: isPremium ? Colors.green : Colors.orange,
                ),
                const SizedBox(width: 8),
                Text(
                  isPremium ? 'Premium Active' : 'Free User',
                  style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                    color: isPremium ? Colors.green : Colors.orange,
                  ),
                ),
              ],
            ),
            if (entitlement?.expiresDate != null) ...[
              const SizedBox(height: 8),
              Text(
                'Expires: ${entitlement!.expiresDate}',
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            const SizedBox(height: 8),
            Text(
              'User ID: ${_subscriberInfo?.originalAppUserID ?? 'N/A'}',
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
                    color: Colors.grey,
                  ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildOfferingsSection() {
    final offering = _offerings?.current;

    if (offering == null) {
      return const Card(
        child: Padding(
          padding: EdgeInsets.all(16),
          child: Text('No offerings available'),
        ),
      );
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Available Plans',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        ...offering.availablePackages.map((package) => _buildPackageCard(package)),
      ],
    );
  }

  Widget _buildPackageCard(Package package) {
    final product = package.products.isNotEmpty ? package.products.first : null;

    return Card(
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              package.displayName ?? package.identifier,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            if (package.description != null) ...[
              const SizedBox(height: 4),
              Text(
                package.description!,
                style: Theme.of(context).textTheme.bodySmall,
              ),
            ],
            if (product?.price != null) ...[
              const SizedBox(height: 8),
              Text(
                product!.price!.formatted,
                style: TextStyle(
                  fontSize: 16,
                  fontWeight: FontWeight.w500,
                  color: Theme.of(context).colorScheme.primary,
                ),
              ),
            ],
            const SizedBox(height: 12),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _isPurchasing ? null : () => _purchase(package),
                child: _isPurchasing
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Subscribe'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildActionsSection() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Actions',
          style: Theme.of(context).textTheme.titleLarge,
        ),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: _restorePurchases,
            child: const Text('Restore Purchases'),
          ),
        ),
      ],
    );
  }
}
