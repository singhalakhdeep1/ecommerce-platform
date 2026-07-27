import { useState, useEffect } from 'react';

export default function Wishlist({ userId, onAddToCart, onRemove }) {
    const [wishlist, setWishlist] = useState([]);
    const [loading, setLoading] = useState(true);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        fetchWishlist();
    }, [userId]);

    const fetchWishlist = async () => {
        if (!userId) return;
        
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/wishlist`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            setWishlist(data.data || []);
        } catch (error) {
            console.error('Error fetching wishlist:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRemoveFromWishlist = async (itemId) => {
        try {
            const res = await fetch(`${API_URL}/wishlist/${itemId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (res.ok) {
                setWishlist(wishlist.filter(item => item.id !== itemId));
            }
        } catch (error) {
            console.error('Error removing from wishlist:', error);
        }
    };

    const handleMoveToCart = async (itemId) => {
        try {
            const res = await fetch(`${API_URL}/wishlist/${itemId}/move-to-cart`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            if (res.ok) {
                setWishlist(wishlist.filter(item => item.id !== itemId));
                onAddToCart && onAddToCart();
            }
        } catch (error) {
            console.error('Error moving to cart:', error);
        }
    };

    if (!userId) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                <div className="text-6xl mb-4">🔒</div>
                <h3 className="text-xl font-semibold mb-2">Please login to view your wishlist</h3>
            </div>
        );
    }

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6">
                <div className="animate-pulse space-y-4">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="flex gap-4">
                            <div className="w-24 h-24 bg-gray-200 rounded-lg"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    if (wishlist.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                <div className="text-6xl mb-4">❤️</div>
                <h3 className="text-xl font-semibold mb-2">Your wishlist is empty</h3>
                <p className="text-gray-500">Save items you love by clicking the heart icon</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-2xl font-bold mb-6">My Wishlist ({wishlist.length} items)</h2>
            
            <div className="space-y-4">
                {wishlist.map(item => (
                    <div key={item.id} className="flex gap-4 p-4 border border-gray-200 rounded-lg hover:shadow-md transition-all">
                        <div className="w-24 h-24 bg-gray-100 rounded-lg flex items-center justify-center text-4xl">
                            📦
                        </div>
                        
                        <div className="flex-1">
                            <h3 className="font-semibold text-lg">{item.product?.name || 'Product'}</h3>
                            <p className="text-gray-500 text-sm mb-2">{item.product?.sku || 'N/A'}</p>
                            <div className="text-xl font-bold text-blue-600 mb-2">
                                ${item.product?.price?.toFixed(2) || '0.00'}
                            </div>
                            
                            {item.notes && (
                                <p className="text-sm text-gray-600 italic mb-2">"{item.notes}"</p>
                            )}
                            
                            <div className="flex gap-2">
                                <button
                                    onClick={() => handleMoveToCart(item.id)}
                                    className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-all text-sm"
                                >
                                    Move to Cart
                                </button>
                                <button
                                    onClick={() => handleRemoveFromWishlist(item.id)}
                                    className="bg-red-500 text-white py-2 px-4 rounded-lg hover:bg-red-600 transition-all text-sm"
                                >
                                    Remove
                                </button>
                            </div>
                        </div>
                        
                        <div className="text-right">
                            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${
                                item.priority === 'high' ? 'bg-red-100 text-red-800' :
                                item.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-green-100 text-green-800'
                            }`}>
                                {item.priority}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
