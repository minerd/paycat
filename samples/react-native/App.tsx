import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ActivityIndicator,
  Alert,
} from 'react-native';

import MRRCat, {
  useSubscriberInfo,
  useEntitlement,
  SubscriberInfo,
  Offering,
  Package,
} from 'react-native-mrrcat';

// Initialize MRRCat
MRRCat.configure({
  apiKey: 'pk_test_your_api_key_here',
});

const App = () => {
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.title}>MRRCat Demo</Text>

        <SubscriptionStatus />
        <OfferingsSection />
        <ActionsSection />
      </ScrollView>
    </SafeAreaView>
  );
};

const SubscriptionStatus = () => {
  const { subscriberInfo, loading } = useSubscriberInfo();
  const { isActive: isPremium } = useEntitlement('premium');

  if (loading) {
    return (
      <View style={styles.section}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Subscription Status</Text>

      <View style={styles.card}>
        {isPremium ? (
          <>
            <Text style={[styles.statusText, styles.activeStatus]}>
              ✓ Premium Active
            </Text>
            {subscriberInfo?.entitlements.premium?.expiresDate && (
              <Text style={styles.expiryText}>
                Expires:{' '}
                {new Date(
                  subscriberInfo.entitlements.premium.expiresDate
                ).toLocaleDateString()}
              </Text>
            )}
          </>
        ) : (
          <Text style={[styles.statusText, styles.inactiveStatus]}>
            Free User
          </Text>
        )}

        <Text style={styles.userIdText}>
          User ID: {subscriberInfo?.originalAppUserID}
        </Text>
      </View>
    </View>
  );
};

const OfferingsSection = () => {
  const [offering, setOffering] = useState<Offering | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadOfferings();
  }, []);

  const loadOfferings = async () => {
    try {
      const current = await MRRCat.shared.getCurrentOffering();
      setOffering(current);
    } catch (error) {
      console.error('Failed to load offerings:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.section}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!offering) {
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>No offerings available</Text>
      </View>
    );
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Available Plans</Text>

      {offering.availablePackages.map(pkg => (
        <PackageCard key={pkg.identifier} package={pkg} />
      ))}
    </View>
  );
};

const PackageCard = ({ package: pkg }: { package: Package }) => {
  const [purchasing, setPurchasing] = useState(false);

  const handlePurchase = async () => {
    const product = pkg.products[0];
    if (!product) return;

    setPurchasing(true);
    try {
      await MRRCat.shared.purchase(product.storeProductId);
      Alert.alert('Success', 'Purchase completed!');
    } catch (error: any) {
      if (error.code !== 'purchase_cancelled') {
        Alert.alert('Error', error.message || 'Purchase failed');
      }
    } finally {
      setPurchasing(false);
    }
  };

  const product = pkg.products[0];
  const price = product?.price;

  return (
    <View style={styles.card}>
      <View style={styles.packageInfo}>
        <Text style={styles.packageTitle}>
          {pkg.displayName || pkg.identifier}
        </Text>
        {pkg.description && (
          <Text style={styles.packageDescription}>{pkg.description}</Text>
        )}
        {price && (
          <Text style={styles.priceText}>
            {price.currency} {(price.amount / 100).toFixed(2)}
          </Text>
        )}
      </View>

      <TouchableOpacity
        style={[styles.subscribeButton, purchasing && styles.disabledButton]}
        onPress={handlePurchase}
        disabled={purchasing}>
        {purchasing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.subscribeButtonText}>Subscribe</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const ActionsSection = () => {
  const [restoring, setRestoring] = useState(false);

  const handleRestore = async () => {
    setRestoring(true);
    try {
      await MRRCat.shared.restorePurchases();
      Alert.alert('Success', 'Purchases restored!');
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Restore failed');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Actions</Text>

      <TouchableOpacity
        style={[styles.actionButton, restoring && styles.disabledButton]}
        onPress={handleRestore}
        disabled={restoring}>
        {restoring ? (
          <ActivityIndicator color="#007AFF" />
        ) : (
          <Text style={styles.actionButtonText}>Restore Purchases</Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    padding: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    textAlign: 'center',
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusText: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
  },
  activeStatus: {
    color: '#34C759',
  },
  inactiveStatus: {
    color: '#FF9500',
  },
  expiryText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  userIdText: {
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },
  packageInfo: {
    marginBottom: 12,
  },
  packageTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  packageDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 8,
  },
  priceText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#007AFF',
  },
  subscribeButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButton: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  actionButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disabledButton: {
    opacity: 0.6,
  },
});

export default App;
