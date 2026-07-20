import CartItem from './CartItem';

export default function Cart({ cart, onUpdateQuantity, onRemove, cartTotal, onCheckout, loading, onBrowseProducts }) {
    if (cart.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6">
                <h2 className="text-2xl mb-5">Shopping Cart (0 items)</h2>
                <div className="text-center text-gray-400 py-16">
                    <div className="text-6xl mb-4">🛒</div>
                    <h3>Your cart is empty</h3>
                    <button onClick={onBrowseProducts} className="bg-gradient-to-r from-blue-600 to-blue-800 text-white py-3 px-6 rounded-lg font-semibold hover:shadow-lg transition-all mt-4">
                        Browse Products
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-2xl mb-5">Shopping Cart ({cart.length} items)</h2>
            {cart.map((item) => (
                <CartItem 
                    key={item._id} 
                    item={item} 
                    onUpdateQuantity={onUpdateQuantity}
                    onRemove={onRemove}
                />
            ))}
            <div className="mt-6 pt-6 border-t-2 border-gray-200">
                <div className="flex justify-between text-xl font-bold mb-4">
                    <span>Total:</span>
                    <span>${cartTotal.toFixed(2)}</span>
                </div>
                <button onClick={onCheckout} className="w-full bg-green-500 hover:bg-green-600 text-white py-3 px-6 rounded-lg font-semibold transition-all disabled:opacity-60" disabled={loading}>
                    {loading ? 'Processing...' : 'Checkout'}
                </button>
            </div>
        </div>
    );
}
