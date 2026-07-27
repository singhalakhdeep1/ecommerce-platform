import { useState, useEffect } from 'react';

export default function SubscriptionManagement({ userId }) {
    const [subscriptions, setSubscriptions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [selectedSubscription, setSelectedSubscription] = useState(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        if (userId) {
            fetchSubscriptions();
        }
    }, [userId]);

    const fetchSubscriptions = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/subscriptions`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            setSubscriptions(data.data || []);
        } catch (error) {
            console.error('Error fetching subscriptions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleCancelSubscription = async (subscriptionId) => {
        try {
            const res = await fetch(`${API_URL}/subscriptions/${subscriptionId}/cancel`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (res.ok) {
                setSubscriptions(subscriptions.map(sub => 
                    sub.id === subscriptionId 
                        ? { ...sub, status: 'cancelled' } 
                        : sub
                ));
                setShowCancelModal(false);
            }
        } catch (error) {
            console.error('Error cancelling subscription:', error);
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            active: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800',
            past_due: 'bg-yellow-100 text-yellow-800',
            trial: 'bg-blue-100 text-blue-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    if (!userId) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                <div className="text-6xl mb-4">🔒</div>
                <h3 className="text-xl font-semibold mb-2">Please login to view your subscriptions</h3>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6">
                <div className="animate-pulse space-y-4">
                    {[1, 2].map(i => (
                        <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6">My Subscriptions</h2>

            {subscriptions.length === 0 ? (
                <div className="text-center py-8">
                    <div className="text-6xl mb-4">📦</div>
                    <h3 className="text-xl font-semibold mb-2">No active subscriptions</h3>
                    <p className="text-gray-500">Subscribe to products to get regular deliveries</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {subscriptions.map(subscription => (
                        <div key={subscription.id} className="border border-gray-200 rounded-lg p-6">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <h3 className="text-lg font-semibold">{subscription.plan?.name || 'Subscription'}</h3>
                                    <p className="text-gray-500 text-sm">
                                        {subscription.frequency === 'monthly' ? 'Monthly' : 
                                         subscription.frequency === 'weekly' ? 'Weekly' : 
                                         subscription.frequency === 'quarterly' ? 'Quarterly' : 'One-time'}
                                    </p>
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(subscription.status)}`}>
                                    {subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div>
                                    <div className="text-sm text-gray-500">Amount</div>
                                    <div className="font-semibold">${parseFloat(subscription.amount).toFixed(2)}</div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Next Delivery</div>
                                    <div className="font-semibold">
                                        {subscription.nextDeliveryDate 
                                            ? new Date(subscription.nextDeliveryDate).toLocaleDateString() 
                                            : 'N/A'}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Started</div>
                                    <div className="font-semibold">
                                        {new Date(subscription.startDate).toLocaleDateString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-sm text-gray-500">Deliveries</div>
                                    <div className="font-semibold">{subscription.deliveriesCompleted || 0}</div>
                                </div>
                            </div>

                            {subscription.items && subscription.items.length > 0 && (
                                <div className="mb-4">
                                    <h4 className="font-semibold mb-2">Items</h4>
                                    <div className="space-y-2">
                                        {subscription.items.map((item, index) => (
                                            <div key={index} className="flex justify-between text-sm">
                                                <span>{item.product?.name || 'Product'}</span>
                                                <span>Qty: {item.quantity}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {subscription.status === 'active' && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setSelectedSubscription(subscription);
                                            setShowCancelModal(true);
                                        }}
                                        className="text-red-500 hover:text-red-700 text-sm font-semibold"
                                    >
                                        Cancel Subscription
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {showCancelModal && selectedSubscription && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4">
                        <h3 className="text-xl font-bold mb-4">Cancel Subscription</h3>
                        <p className="text-gray-600 mb-6">
                            Are you sure you want to cancel your subscription to {selectedSubscription.plan?.name || 'this plan'}?
                            You will continue to receive deliveries until the end of the current billing cycle.
                        </p>
                        <div className="flex gap-4">
                            <button
                                onClick={() => setShowCancelModal(false)}
                                className="flex-1 bg-gray-200 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300 transition-all"
                            >
                                Keep Subscription
                            </button>
                            <button
                                onClick={() => handleCancelSubscription(selectedSubscription.id)}
                                className="flex-1 bg-red-500 text-white py-3 px-6 rounded-lg font-semibold hover:bg-red-600 transition-all"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
