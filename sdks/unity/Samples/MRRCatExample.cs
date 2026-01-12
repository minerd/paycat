using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using MRRCat;

/// <summary>
/// Example usage of MRRCat SDK in Unity
/// </summary>
public class MRRCatExample : MonoBehaviour
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
        // Initialize MRRCat SDK
        MRRCatSDK.Configure(apiKey, serverUrl);
        MRRCatSDK.SetDebugMode(true);

        // Subscribe to events
        MRRCatSDK.Instance.OnSubscriberUpdated += OnSubscriberUpdated;
        MRRCatSDK.Instance.OnError += OnMRRCatError;

        // Setup UI
        loginButton.onClick.AddListener(OnLoginClicked);
        checkPremiumButton.onClick.AddListener(OnCheckPremiumClicked);
        purchaseButton.onClick.AddListener(OnPurchaseClicked);

        UpdateUI();
    }

    private void OnDestroy()
    {
        if (MRRCatSDK.Instance != null)
        {
            MRRCatSDK.Instance.OnSubscriberUpdated -= OnSubscriberUpdated;
            MRRCatSDK.Instance.OnError -= OnMRRCatError;
        }
    }

    private async void OnLoginClicked()
    {
        statusText.text = "Logging in...";

        try
        {
            // Login with a user ID (in real app, use your auth system's user ID)
            var subscriber = await MRRCatSDK.Instance.Login("unity_user_" + SystemInfo.deviceUniqueIdentifier);

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
            bool hasPremium = await MRRCatSDK.Instance.HasEntitlement("premium");

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
            var offerings = await MRRCatSDK.Instance.GetOfferings();

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
                    // 3. Verify with MRRCat:
                    //
                    // #if UNITY_IOS
                    //     await MRRCatSDK.Instance.VerifyiOSPurchase(transactionId);
                    // #elif UNITY_ANDROID
                    //     await MRRCatSDK.Instance.VerifyAndroidPurchase(purchaseToken, productId);
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

    private void OnMRRCatError(string error)
    {
        Debug.LogError($"MRRCat Error: {error}");
        statusText.text = $"Error: {error}";
    }

    private void UpdateUI()
    {
        bool isLoggedIn = MRRCatSDK.Instance != null && MRRCatSDK.Instance.IsLoggedIn;

        loginButton.interactable = !isLoggedIn;
        checkPremiumButton.interactable = isLoggedIn;
        purchaseButton.interactable = isLoggedIn;

        // Quick check from cache
        if (isLoggedIn && MRRCatSDK.Instance.HasEntitlementCached("premium"))
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
        if (MRRCatSDK.Instance.IsLoggedIn)
        {
            await MRRCatSDK.Instance.TrackEvent("paywall_viewed", new Dictionary<string, object>
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
        if (MRRCatSDK.Instance.IsLoggedIn)
        {
            await MRRCatSDK.Instance.SetAttributes(new Dictionary<string, object>
            {
                { "$email", "player@example.com" },
                { "level", 42 },
                { "coins_earned", 15000 }
            });
        }
    }
}
