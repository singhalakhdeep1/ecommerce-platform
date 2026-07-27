import { useState } from 'react';

export default function Payment({ orderTotal, onPaymentComplete, onCancel }) {
    const [paymentMethod, setPaymentMethod] = useState('card');
    const [loading, setLoading] = useState(false);
    const [cardDetails, setCardDetails] = useState({
        number: '',
        expiry: '',
        cvv: '',
        name: ''
    });
    const [paypalEmail, setPaypalEmail] = useState('');
    const [discountCode, setDiscountCode] = useState('');
    const [discountApplied, setDiscountApplied] = useState(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    const handleApplyDiscount = async () => {
        if (!discountCode) return;

        try {
            const res = await fetch(`${API_URL}/discounts/validate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    code: discountCode,
                    cartTotal: orderTotal
                })
            });
            const data = await res.json();
            
            if (data.success) {
                setDiscountApplied(data.data);
            } else {
                alert(data.message || 'Invalid discount code');
            }
        } catch (error) {
            console.error('Error applying discount:', error);
        }
    };

    const handleCardPayment = async () => {
        setLoading(true);
        try {
            // Create Stripe payment intent
            const res = await fetch(`${API_URL}/payments/create-intent`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    amount: discountApplied ? orderTotal - discountApplied.discountAmount : orderTotal
                })
            });
            const data = await res.json();

            if (data.success) {
                // In production, use Stripe Elements here
                // For demo, we'll simulate payment
                await simulateStripePayment(data.data.clientSecret);
            }
        } catch (error) {
            console.error('Payment error:', error);
            alert('Payment failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const simulateStripePayment = async (clientSecret) => {
        // Simulate payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        onPaymentComplete({ method: 'card', amount: orderTotal });
    };

    const handlePayPalPayment = async () => {
        setLoading(true);
        try {
            // Create PayPal order
            const res = await fetch(`${API_URL}/payments/paypal/create`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify({
                    amount: discountApplied ? orderTotal - discountApplied.discountAmount : orderTotal
                })
            });
            const data = await res.json();

            if (data.success) {
                // In production, redirect to PayPal or use PayPal SDK
                // For demo, we'll simulate payment
                await simulatePayPalPayment(data.orderId);
            }
        } catch (error) {
            console.error('PayPal error:', error);
            alert('PayPal payment failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const simulatePayPalPayment = async (orderId) => {
        // Simulate PayPal payment processing
        await new Promise(resolve => setTimeout(resolve, 2000));
        onPaymentComplete({ method: 'paypal', amount: orderTotal });
    };

    const finalAmount = discountApplied 
        ? orderTotal - discountApplied.discountAmount 
        : orderTotal;

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6">Payment</h2>

            {/* Order Summary */}
            <div className="bg-gray-50 p-4 rounded-lg mb-6">
                <div className="flex justify-between mb-2">
                    <span>Subtotal:</span>
                    <span>${orderTotal.toFixed(2)}</span>
                </div>
                {discountApplied && (
                    <div className="flex justify-between mb-2 text-green-600">
                        <span>Discount ({discountApplied.discount.code}):</span>
                        <span>-${discountApplied.discountAmount.toFixed(2)}</span>
                    </div>
                )}
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                    <span>Total:</span>
                    <span>${finalAmount.toFixed(2)}</span>
                </div>
            </div>

            {/* Discount Code */}
            <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Discount Code</label>
                <div className="flex gap-2">
                    <input
                        type="text"
                        value={discountCode}
                        onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
                        placeholder="Enter code"
                        className="flex-1 p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                    <button
                        onClick={handleApplyDiscount}
                        className="bg-gray-200 px-6 rounded-lg hover:bg-gray-300 transition-all"
                    >
                        Apply
                    </button>
                </div>
            </div>

            {/* Payment Method Selection */}
            <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Payment Method</label>
                <div className="space-y-3">
                    <button
                        onClick={() => setPaymentMethod('card')}
                        className={`w-full p-4 border-2 rounded-lg flex items-center gap-4 transition-all ${
                            paymentMethod === 'card' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                    >
                        <div className="text-2xl">💳</div>
                        <div className="text-left">
                            <div className="font-semibold">Credit/Debit Card</div>
                            <div className="text-sm text-gray-500">Visa, Mastercard, Amex</div>
                        </div>
                    </button>

                    <button
                        onClick={() => setPaymentMethod('paypal')}
                        className={`w-full p-4 border-2 rounded-lg flex items-center gap-4 transition-all ${
                            paymentMethod === 'paypal' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                        }`}
                    >
                        <div className="text-2xl">🅿️</div>
                        <div className="text-left">
                            <div className="font-semibold">PayPal</div>
                            <div className="text-sm text-gray-500">Pay with your PayPal account</div>
                        </div>
                    </button>
                </div>
            </div>

            {/* Card Payment Form */}
            {paymentMethod === 'card' && (
                <div className="space-y-4 mb-6">
                    <div>
                        <label className="block text-sm font-medium mb-2">Card Number</label>
                        <input
                            type="text"
                            value={cardDetails.number}
                            onChange={(e) => setCardDetails({ ...cardDetails, number: e.target.value })}
                            placeholder="1234 5678 9012 3456"
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                            maxLength={19}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium mb-2">Expiry Date</label>
                            <input
                                type="text"
                                value={cardDetails.expiry}
                                onChange={(e) => setCardDetails({ ...cardDetails, expiry: e.target.value })}
                                placeholder="MM/YY"
                                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                                maxLength={5}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium mb-2">CVV</label>
                            <input
                                type="text"
                                value={cardDetails.cvv}
                                onChange={(e) => setCardDetails({ ...cardDetails, cvv: e.target.value })}
                                placeholder="123"
                                className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                                maxLength={4}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium mb-2">Name on Card</label>
                        <input
                            type="text"
                            value={cardDetails.name}
                            onChange={(e) => setCardDetails({ ...cardDetails, name: e.target.value })}
                            placeholder="John Doe"
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                    </div>
                </div>
            )}

            {/* PayPal Form */}
            {paymentMethod === 'paypal' && (
                <div className="mb-6">
                    <label className="block text-sm font-medium mb-2">PayPal Email</label>
                    <input
                        type="email"
                        value={paypalEmail}
                        onChange={(e) => setPaypalEmail(e.target.value)}
                        placeholder="your@email.com"
                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-4">
                <button
                    onClick={onCancel}
                    className="flex-1 bg-gray-200 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300 transition-all"
                >
                    Cancel
                </button>
                <button
                    onClick={paymentMethod === 'card' ? handleCardPayment : handlePayPalPayment}
                    disabled={loading}
                    className="flex-1 bg-green-500 text-white py-3 px-6 rounded-lg font-semibold hover:bg-green-600 transition-all disabled:opacity-50"
                >
                    {loading ? 'Processing...' : `Pay $${finalAmount.toFixed(2)}`}
                </button>
            </div>

            {/* Security Note */}
            <div className="mt-6 text-center text-sm text-gray-500">
                🔒 Your payment information is secure and encrypted
            </div>
        </div>
    );
}
