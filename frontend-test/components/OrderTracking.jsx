import { useState, useEffect } from 'react';

export default function OrderTracking({ orderId }) {
    const [order, setOrder] = useState(null);
    const [trackingInfo, setTrackingInfo] = useState(null);
    const [loading, setLoading] = useState(true);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        if (orderId) {
            fetchOrder();
        }
    }, [orderId]);

    const fetchOrder = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/orders/${orderId}`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            if (data.success) {
                setOrder(data.data);
                if (data.data.trackingNumber) {
                    fetchTrackingInfo(data.data.trackingNumber);
                }
            }
        } catch (error) {
            console.error('Error fetching order:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchTrackingInfo = async (trackingNumber) => {
        try {
            const res = await fetch(`${API_URL}/orders/${orderId}/track`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            if (data.success) {
                setTrackingInfo(data.data);
            }
        } catch (error) {
            console.error('Error fetching tracking info:', error);
        }
    };

    const getStatusColor = (status) => {
        const colors = {
            pending: 'bg-yellow-100 text-yellow-800',
            processing: 'bg-blue-100 text-blue-800',
            shipped: 'bg-purple-100 text-purple-800',
            delivered: 'bg-green-100 text-green-800',
            cancelled: 'bg-red-100 text-red-800'
        };
        return colors[status] || 'bg-gray-100 text-gray-800';
    };

    const statusSteps = ['pending', 'processing', 'shipped', 'delivered'];

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-1/2"></div>
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                </div>
            </div>
        );
    }

    if (!order) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                <div className="text-6xl mb-4">📦</div>
                <h3 className="text-xl font-semibold">Order not found</h3>
            </div>
        );
    }

    const currentStepIndex = statusSteps.indexOf(order.status);

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Order Tracking</h2>
                <span className={`px-4 py-2 rounded-full text-sm font-semibold ${getStatusColor(order.status)}`}>
                    {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
                </span>
            </div>

            {/* Order Info */}
            <div className="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                <div>
                    <div className="text-sm text-gray-500">Order Number</div>
                    <div className="font-semibold">{order.orderNumber}</div>
                </div>
                <div>
                    <div className="text-sm text-gray-500">Order Date</div>
                    <div className="font-semibold">{new Date(order.createdAt).toLocaleDateString()}</div>
                </div>
                <div>
                    <div className="text-sm text-gray-500">Total Amount</div>
                    <div className="font-semibold">${parseFloat(order.totalAmount).toFixed(2)}</div>
                </div>
                {order.trackingNumber && (
                    <div>
                        <div className="text-sm text-gray-500">Tracking Number</div>
                        <div className="font-semibold">{order.trackingNumber}</div>
                    </div>
                )}
            </div>

            {/* Progress Tracker */}
            <div className="mb-8">
                <h3 className="font-semibold mb-4">Order Progress</h3>
                <div className="flex items-center justify-between">
                    {statusSteps.map((step, index) => (
                        <div key={step} className="flex flex-col items-center flex-1">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${
                                index <= currentStepIndex ? 'bg-blue-600' : 'bg-gray-300'
                            }`}>
                                {index < currentStepIndex ? '✓' : index + 1}
                            </div>
                            <div className="text-xs mt-2 text-center capitalize">{step}</div>
                            {index < statusSteps.length - 1 && (
                                <div className={`flex-1 h-1 mt-4 ${
                                    index < currentStepIndex ? 'bg-blue-600' : 'bg-gray-300'
                                }`} style={{ marginLeft: '20px', marginRight: '20px' }}></div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            {/* Tracking Events */}
            {trackingInfo && trackingInfo.events && (
                <div className="mb-8">
                    <h3 className="font-semibold mb-4">Tracking History</h3>
                    <div className="space-y-4">
                        {trackingInfo.events.map((event, index) => (
                            <div key={index} className="flex gap-4">
                                <div className="w-3 h-3 bg-blue-600 rounded-full mt-2"></div>
                                <div className="flex-1 pb-4 border-l-2 border-gray-200 pl-4">
                                    <div className="font-semibold">{event.status}</div>
                                    <div className="text-sm text-gray-500">{event.location}</div>
                                    <div className="text-sm text-gray-400">
                                        {new Date(event.date).toLocaleString()}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Shipping Address */}
            {order.shippingAddress && (
                <div className="mb-6">
                    <h3 className="font-semibold mb-2">Shipping Address</h3>
                    <div className="text-gray-600">
                        {order.shippingAddress.name && <>{order.shippingAddress.name}<br /></>}
                        {order.shippingAddress.street && <>{order.shippingAddress.street}<br /></>}
                        {order.shippingAddress.city && order.shippingAddress.city}{order.shippingAddress.state && `, ${order.shippingAddress.state}`}<br />
                        {order.shippingAddress.zip && order.shippingAddress.zip}{order.shippingAddress.country && `, ${order.shippingAddress.country}`}
                    </div>
                </div>
            )}

            {/* Order Items */}
            {order.items && order.items.length > 0 && (
                <div>
                    <h3 className="font-semibold mb-4">Order Items</h3>
                    <div className="space-y-4">
                        {order.items.map((item, index) => (
                            <div key={index} className="flex gap-4 p-4 border border-gray-200 rounded-lg">
                                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center text-2xl">
                                    📦
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-semibold">{item.product?.name || 'Product'}</h4>
                                    <p className="text-sm text-gray-500">Quantity: {item.quantity}</p>
                                    <p className="text-sm text-gray-500">Price: ${parseFloat(item.price).toFixed(2)}</p>
                                </div>
                                <div className="font-semibold">
                                    ${(parseFloat(item.price) * item.quantity).toFixed(2)}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Estimated Delivery */}
            {trackingInfo && trackingInfo.estimatedDelivery && (
                <div className="mt-6 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                        <span className="text-2xl">🚚</span>
                        <div>
                            <div className="font-semibold">Estimated Delivery</div>
                            <div className="text-sm text-gray-600">
                                {new Date(trackingInfo.estimatedDelivery).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
