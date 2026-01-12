using System;
using System.Collections.Generic;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace MRRCat
{
    /// <summary>
    /// MRRCat SDK for Unity
    /// Unified subscription management across iOS, Android, and Web
    /// </summary>
    public class MRRCatSDK : MonoBehaviour
    {
        private static MRRCatSDK _instance;
        public static MRRCatSDK Instance => _instance;

        [SerializeField] private string apiKey;
        [SerializeField] private string serverUrl = "https://your-server.workers.dev";
        [SerializeField] private bool debugMode = false;

        private string _currentUserId;
        private SubscriberInfo _cachedSubscriber;

        public string CurrentUserId => _currentUserId;
        public SubscriberInfo CachedSubscriber => _cachedSubscriber;

        public event Action<SubscriberInfo> OnSubscriberUpdated;
        public event Action<string> OnError;

        #region Initialization

        private void Awake()
        {
            if (_instance != null && _instance != this)
            {
                Destroy(gameObject);
                return;
            }

            _instance = this;
            DontDestroyOnLoad(gameObject);
        }

        /// <summary>
        /// Initialize MRRCat SDK with configuration
        /// </summary>
        public static void Configure(string apiKey, string serverUrl = null)
        {
            if (_instance == null)
            {
                var go = new GameObject("MRRCat");
                _instance = go.AddComponent<MRRCatSDK>();
            }

            _instance.apiKey = apiKey;
            if (!string.IsNullOrEmpty(serverUrl))
            {
                _instance.serverUrl = serverUrl.TrimEnd('/');
            }

            Log("MRRCat SDK configured");
        }

        /// <summary>
        /// Set debug mode for logging
        /// </summary>
        public static void SetDebugMode(bool enabled)
        {
            if (_instance != null)
            {
                _instance.debugMode = enabled;
            }
        }

        #endregion

        #region User Management

        /// <summary>
        /// Login with app user ID
        /// </summary>
        public async Task<SubscriberInfo> Login(string appUserId)
        {
            if (string.IsNullOrEmpty(appUserId))
            {
                throw new ArgumentException("appUserId cannot be null or empty");
            }

            _currentUserId = appUserId;
            Log($"User logged in: {appUserId}");

            return await GetSubscriber();
        }

        /// <summary>
        /// Login anonymously
        /// </summary>
        public async Task<SubscriberInfo> LoginAnonymously()
        {
            var anonymousId = "$RCAnonymousID:" + Guid.NewGuid().ToString();
            return await Login(anonymousId);
        }

        /// <summary>
        /// Logout current user
        /// </summary>
        public void Logout()
        {
            _currentUserId = null;
            _cachedSubscriber = null;
            Log("User logged out");
        }

        /// <summary>
        /// Check if user is logged in
        /// </summary>
        public bool IsLoggedIn => !string.IsNullOrEmpty(_currentUserId);

        #endregion

        #region Subscriber Operations

        /// <summary>
        /// Get current subscriber information
        /// </summary>
        public async Task<SubscriberInfo> GetSubscriber()
        {
            EnsureLoggedIn();

            var url = $"{serverUrl}/v1/subscribers/{Uri.EscapeDataString(_currentUserId)}";
            var response = await MakeRequest<SubscriberResponse>("GET", url);

            _cachedSubscriber = response.subscriber;
            OnSubscriberUpdated?.Invoke(_cachedSubscriber);

            return _cachedSubscriber;
        }

        /// <summary>
        /// Check if user has active entitlement
        /// </summary>
        public async Task<bool> HasEntitlement(string entitlementId)
        {
            var subscriber = await GetSubscriber();

            if (subscriber?.entitlements == null)
                return false;

            if (subscriber.entitlements.TryGetValue(entitlementId, out var entitlement))
            {
                return entitlement.is_active;
            }

            return false;
        }

        /// <summary>
        /// Check entitlement from cache (synchronous)
        /// </summary>
        public bool HasEntitlementCached(string entitlementId)
        {
            if (_cachedSubscriber?.entitlements == null)
                return false;

            if (_cachedSubscriber.entitlements.TryGetValue(entitlementId, out var entitlement))
            {
                return entitlement.is_active;
            }

            return false;
        }

        /// <summary>
        /// Set subscriber attributes
        /// </summary>
        public async Task SetAttributes(Dictionary<string, object> attributes)
        {
            EnsureLoggedIn();

            var url = $"{serverUrl}/v1/subscribers/{Uri.EscapeDataString(_currentUserId)}/attributes";
            await MakeRequest<object>("POST", url, new { attributes });

            Log("Attributes updated");
        }

        #endregion

        #region Purchase Operations

        /// <summary>
        /// Verify iOS receipt
        /// </summary>
        public async Task<SubscriberInfo> VerifyiOSPurchase(string transactionId)
        {
            EnsureLoggedIn();

            var url = $"{serverUrl}/v1/receipts";
            var body = new
            {
                app_user_id = _currentUserId,
                platform = "ios",
                fetch_policy = "fetch_current",
                receipt_data = new { transaction_id = transactionId }
            };

            var response = await MakeRequest<SubscriberResponse>("POST", url, body);
            _cachedSubscriber = response.subscriber;
            OnSubscriberUpdated?.Invoke(_cachedSubscriber);

            Log($"iOS purchase verified: {transactionId}");
            return _cachedSubscriber;
        }

        /// <summary>
        /// Verify Android purchase
        /// </summary>
        public async Task<SubscriberInfo> VerifyAndroidPurchase(string purchaseToken, string productId)
        {
            EnsureLoggedIn();

            var url = $"{serverUrl}/v1/receipts";
            var body = new
            {
                app_user_id = _currentUserId,
                platform = "android",
                fetch_policy = "fetch_current",
                receipt_data = new { purchase_token = purchaseToken, product_id = productId }
            };

            var response = await MakeRequest<SubscriberResponse>("POST", url, body);
            _cachedSubscriber = response.subscriber;
            OnSubscriberUpdated?.Invoke(_cachedSubscriber);

            Log($"Android purchase verified: {productId}");
            return _cachedSubscriber;
        }

        #endregion

        #region Offerings

        /// <summary>
        /// Get current offerings
        /// </summary>
        public async Task<OfferingsResponse> GetOfferings()
        {
            var url = $"{serverUrl}/v1/offerings";
            if (!string.IsNullOrEmpty(_currentUserId))
            {
                url += $"?app_user_id={Uri.EscapeDataString(_currentUserId)}";
            }

            return await MakeRequest<OfferingsResponse>("GET", url);
        }

        /// <summary>
        /// Get specific offering
        /// </summary>
        public async Task<Offering> GetOffering(string identifier)
        {
            var url = $"{serverUrl}/v1/offerings/{Uri.EscapeDataString(identifier)}";
            var response = await MakeRequest<OfferingResponse>("GET", url);
            return response.offering;
        }

        #endregion

        #region Events

        /// <summary>
        /// Track custom event
        /// </summary>
        public async Task TrackEvent(string eventName, Dictionary<string, object> properties = null)
        {
            EnsureLoggedIn();

            var url = $"{serverUrl}/v1/events";
            var body = new
            {
                app_user_id = _currentUserId,
                event_name = eventName,
                properties = properties,
                timestamp = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
            };

            await MakeRequest<object>("POST", url, body);
            Log($"Event tracked: {eventName}");
        }

        #endregion

        #region HTTP Client

        private async Task<T> MakeRequest<T>(string method, string url, object body = null)
        {
            using (var request = new UnityWebRequest(url, method))
            {
                request.SetRequestHeader("X-API-Key", apiKey);
                request.SetRequestHeader("Content-Type", "application/json");

                if (body != null)
                {
                    var json = JsonUtility.ToJson(body);
                    var bodyRaw = System.Text.Encoding.UTF8.GetBytes(json);
                    request.uploadHandler = new UploadHandlerRaw(bodyRaw);
                }

                request.downloadHandler = new DownloadHandlerBuffer();

                var operation = request.SendWebRequest();

                while (!operation.isDone)
                {
                    await Task.Yield();
                }

                if (request.result != UnityWebRequest.Result.Success)
                {
                    var errorMessage = $"Request failed: {request.error}";
                    LogError(errorMessage);
                    OnError?.Invoke(errorMessage);
                    throw new MRRCatException(errorMessage, (int)request.responseCode);
                }

                var responseText = request.downloadHandler.text;
                Log($"Response: {responseText}");

                return JsonUtility.FromJson<T>(responseText);
            }
        }

        #endregion

        #region Helpers

        private void EnsureLoggedIn()
        {
            if (!IsLoggedIn)
            {
                throw new InvalidOperationException("User must be logged in. Call Login() first.");
            }
        }

        private static void Log(string message)
        {
            if (_instance != null && _instance.debugMode)
            {
                Debug.Log($"[MRRCat] {message}");
            }
        }

        private static void LogError(string message)
        {
            Debug.LogError($"[MRRCat] {message}");
        }

        #endregion
    }

    #region Models

    [Serializable]
    public class SubscriberResponse
    {
        public SubscriberInfo subscriber;
    }

    [Serializable]
    public class SubscriberInfo
    {
        public string original_app_user_id;
        public string first_seen;
        public Dictionary<string, Subscription> subscriptions;
        public Dictionary<string, Entitlement> entitlements;
    }

    [Serializable]
    public class Subscription
    {
        public string platform;
        public string product_id;
        public string status;
        public string purchase_date;
        public string expires_date;
        public bool is_sandbox;
        public bool is_trial_period;
        public bool will_renew;
    }

    [Serializable]
    public class Entitlement
    {
        public bool is_active;
        public string product_identifier;
        public string expires_date;
    }

    [Serializable]
    public class OfferingsResponse
    {
        public string current_offering_id;
        public List<Offering> offerings;
    }

    [Serializable]
    public class OfferingResponse
    {
        public Offering offering;
    }

    [Serializable]
    public class Offering
    {
        public string identifier;
        public string display_name;
        public string description;
        public List<Package> packages;
    }

    [Serializable]
    public class Package
    {
        public string identifier;
        public string package_type;
        public Product product;
    }

    [Serializable]
    public class Product
    {
        public string store_product_id;
        public string platform;
        public string product_type;
        public string display_name;
        public Price price;
    }

    [Serializable]
    public class Price
    {
        public float amount;
        public string currency;
        public string formatted;
    }

    public class MRRCatException : Exception
    {
        public int StatusCode { get; }

        public MRRCatException(string message, int statusCode = 0) : base(message)
        {
            StatusCode = statusCode;
        }
    }

    #endregion
}
