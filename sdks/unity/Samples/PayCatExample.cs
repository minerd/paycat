using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using PayCat;

/// <summary>
/// Example usage of PayCat SDK in Unity
/// </summary>
public class PayCatExample : MonoBehaviour
{
    [Header("Configuration")]
    [SerializeField] private string apiKey = "pk_test_your_api_key";
    [SerializeField] private string serverUrl = "https://your-server.workers.dev";

    [Header("UI References")]
    [SerializeField] private Text statusText;
    [SerializeField] private Button loginButton;
    [SerializeField] private Button checkPremiumButton;
    [SerializeField] private Button purchaseButton;
    [SerializeField] private GameObject premiumContent;

    private void Start()
    {
        // Initialize PayCat SDK
        PayCatSDK.Configure(apiKey, serverUrl);
        PayCatSDK.SetDebugMode(true);

        // Subscribe to events
        PayCatSDK.Instance.OnSubscriberUpdated += OnSubscriberUpdated;
        PayCatSDK.Instance.OnError += OnPayCatError;

        // Setup UI
        loginButton.onClick.AddListener(OnLoginClicked);
        checkPremiumButton.onClick.AddListener(OnCheckPremiumClicked);
        purchaseButton.onClick.AddListener(OnPurchaseClicked);

        UpdateUI();
    }

    private void OnDestroy()
    {
        if (PayCatSDK.Instance != null)
        {
            PayCatSDK.Instance.OnSubscriberUpdated -= OnSubscriberUpdated;
            PayCatSDK.Instance.OnError -= OnPayCatError;
        }
    }

    private async void OnLoginClicked()
    {
        statusText.text = "Logging in...";

        try
        {
            // Login with a user ID (in real app, use your auth system's user ID)
            var subscriber = await PayCatSDK.Instance.Login("unity_user_" + SystemInfo.deviceUniqueIdentifier);

            statusText.text = $"Logged in as: {subscriber.original_app_user_id}";
            UpdateUI();
        }
        catch (System.Exception e)
        {
            statusText.text = $"Login failed: {e.Message}";
        }
    }

    private async void OnCheckPremiumClicked()
    {
        statusText.text = "Checking entitlements...";

        try
        {
            bool hasPremium = await PayCatSDK.Instance.HasEntitlement("premium");

            if (hasPremium)
            {
                statusText.text = "You have Premium access!";
                premiumContent.SetActive(true);
            }
            else
            {
                statusText.text = "No Premium access. Purchase to unlock!";
                premiumContent.SetActive(false);
            }
        }
        catch (System.Exception e)
        {
            statusText.text = $"Check failed: {e.Message}";
        }
    }

    private async void OnPurchaseClicked()
    {
        statusText.text = "Getting offerings...";

        try
        {
            // Get available offerings
            var offerings = await PayCatSDK.Instance.GetOfferings();

            if (offerings.offerings != null && offerings.offerings.Count > 0)
            {
                var currentOffering = offerings.offerings.Find(o => o.identifier == offerings.current_offering_id);

                if (currentOffering != null && currentOffering.packages.Count > 0)
                {
                    var package = currentOffering.packages[0];
                    statusText.text = $"Available: {package.product.display_name} - {package.product.price.formatted}";

                    // In real implementation:
                    // 1. Use Unity IAP to make the purchase
                    // 2. Get transaction ID from Unity IAP
                    // 3. Verify with PayCat:
                    //
                    // #if UNITY_IOS
                    //     await PayCatSDK.Instance.VerifyiOSPurchase(transactionId);
                    // #elif UNITY_ANDROID
                    //     await PayCatSDK.Instance.VerifyAndroidPurchase(purchaseToken, productId);
                    // #endif
                }
            }
            else
            {
                statusText.text = "No offerings available";
            }
        }
        catch (System.Exception e)
        {
            statusText.text = $"Error: {e.Message}";
        }
    }

    private void OnSubscriberUpdated(SubscriberInfo subscriber)
    {
        Debug.Log($"Subscriber updated: {subscriber.original_app_user_id}");
        UpdateUI();
    }

    private void OnPayCatError(string error)
    {
        Debug.LogError($"PayCat Error: {error}");
        statusText.text = $"Error: {error}";
    }

    private void UpdateUI()
    {
        bool isLoggedIn = PayCatSDK.Instance != null && PayCatSDK.Instance.IsLoggedIn;

        loginButton.interactable = !isLoggedIn;
        checkPremiumButton.interactable = isLoggedIn;
        purchaseButton.interactable = isLoggedIn;

        // Quick check from cache
        if (isLoggedIn && PayCatSDK.Instance.HasEntitlementCached("premium"))
        {
            premiumContent.SetActive(true);
        }
        else
        {
            premiumContent.SetActive(false);
        }
    }

    /// <summary>
    /// Example: Track a custom event
    /// </summary>
    public async void TrackPaywallView()
    {
        if (PayCatSDK.Instance.IsLoggedIn)
        {
            await PayCatSDK.Instance.TrackEvent("paywall_viewed", new Dictionary<string, object>
            {
                { "paywall_id", "main_paywall" },
                { "source", "level_complete" }
            });
        }
    }

    /// <summary>
    /// Example: Set user attributes for analytics
    /// </summary>
    public async void SetUserAttributes()
    {
        if (PayCatSDK.Instance.IsLoggedIn)
        {
            await PayCatSDK.Instance.SetAttributes(new Dictionary<string, object>
            {
                { "$email", "player@example.com" },
                { "level", 42 },
                { "coins_earned", 15000 }
            });
        }
    }
}
