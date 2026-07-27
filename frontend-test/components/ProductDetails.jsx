import { useState, useEffect } from 'react';
import ProductReviews from './ProductReviews';

export default function ProductDetails({ productId, onAddToCart, onAddToWishlist }) {
    const [product, setProduct] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [showReviews, setShowReviews] = useState(false);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        if (productId) {
            fetchProduct();
        }
    }, [productId]);

    const fetchProduct = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_URL}/products/${productId}`);
            const data = await res.json();
            setProduct(data.data);
            if (data.data?.variants?.length > 0) {
                setSelectedVariant(data.data.variants[0]);
            }
        } catch (error) {
            console.error('Error fetching product:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddToCart = () => {
        const itemToAdd = selectedVariant || product;
        onAddToCart(itemToAdd.id || itemToAdd._id, quantity);
    };

    const handleAddToWishlist = () => {
        const itemToAdd = selectedVariant || product;
        onAddToWishlist && onAddToWishlist(itemToAdd.id || itemToAdd._id);
    };

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6">
                <div className="animate-pulse">
                    <div className="h-96 bg-gray-200 rounded-lg mb-6"></div>
                    <div className="h-8 bg-gray-200 rounded w-3/4 mb-4"></div>
                    <div className="h-4 bg-gray-200 rounded w-1/2 mb-4"></div>
                    <div className="h-6 bg-gray-200 rounded w-1/4 mb-4"></div>
                </div>
            </div>
        );
    }

    if (!product) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                <div className="text-6xl mb-4">📦</div>
                <h3 className="text-xl font-semibold">Product not found</h3>
            </div>
        );
    }

    const currentPrice = selectedVariant ? selectedVariant.price : product.price;
    const currentStock = selectedVariant ? selectedVariant.quantity : product.stock;

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Product Images */}
                <div className="space-y-4">
                    <div className="w-full h-96 bg-gray-100 rounded-lg flex items-center justify-center text-8xl">
                        📦
                    </div>
                    {product.images && product.images.length > 1 && (
                        <div className="flex gap-2">
                            {product.images.map((image, index) => (
                                <div key={index} className="w-20 h-20 bg-gray-100 rounded-lg flex items-center justify-center text-2xl cursor-pointer hover:ring-2 ring-blue-500">
                                    📦
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Product Info */}
                <div>
                    {product.category && (
                        <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold mb-3">
                            {product.category.name}
                        </span>
                    )}
                    
                    <h1 className="text-3xl font-bold mb-2">{product.name}</h1>
                    
                    <div className="flex items-center gap-2 mb-4">
                        <div className="text-yellow-400">
                            {'★'.repeat(Math.round(product.rating || 0))}
                        </div>
                        <span className="text-gray-500">
                            ({product.numReviews || 0} reviews)
                        </span>
                    </div>

                    <div className="text-3xl font-bold text-blue-600 mb-4">
                        ${currentPrice.toFixed(2)}
                        {product.comparePrice && product.comparePrice > currentPrice && (
                            <span className="text-lg text-gray-400 line-through ml-2">
                                ${product.comparePrice.toFixed(2)}
                            </span>
                        )}
                    </div>

                    <p className="text-gray-600 mb-6">{product.description}</p>

                    {/* Variants */}
                    {product.variants && product.variants.length > 0 && (
                        <div className="mb-6">
                            <h3 className="font-semibold mb-2">Select Variant</h3>
                            <div className="flex flex-wrap gap-2">
                                {product.variants.map((variant, index) => (
                                    <button
                                        key={index}
                                        onClick={() => setSelectedVariant(variant)}
                                        className={`px-4 py-2 border-2 rounded-lg transition-all ${
                                            selectedVariant === variant 
                                                ? 'border-blue-500 bg-blue-50' 
                                                : 'border-gray-200 hover:border-gray-300'
                                        }`}
                                    >
                                        {variant.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stock Status */}
                    <div className="mb-6">
                        {currentStock > 10 ? (
                            <span className="text-green-600 font-semibold">✓ In Stock</span>
                        ) : currentStock > 0 ? (
                            <span className="text-yellow-600 font-semibold">⚠ Low Stock ({currentStock} left)</span>
                        ) : (
                            <span className="text-red-600 font-semibold">✗ Out of Stock</span>
                        )}
                    </div>

                    {/* Quantity */}
                    <div className="mb-6">
                        <label className="block text-sm font-medium mb-2">Quantity</label>
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                                className="w-10 h-10 bg-gray-200 rounded-lg hover:bg-gray-300 transition-all"
                            >
                                -
                            </button>
                            <span className="text-xl font-semibold w-12 text-center">{quantity}</span>
                            <button
                                onClick={() => setQuantity(Math.min(currentStock, quantity + 1))}
                                className="w-10 h-10 bg-gray-200 rounded-lg hover:bg-gray-300 transition-all"
                                disabled={currentStock === 0}
                            >
                                +
                            </button>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4 mb-6">
                        <button
                            onClick={handleAddToCart}
                            disabled={currentStock === 0}
                            className="flex-1 bg-gradient-to-r from-blue-600 to-blue-800 text-white py-3 px-6 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Add to Cart
                        </button>
                        <button
                            onClick={handleAddToWishlist}
                            className="w-12 h-12 border-2 border-gray-200 rounded-lg hover:border-red-500 hover:text-red-500 transition-all flex items-center justify-center"
                        >
                            ❤️
                        </button>
                    </div>

                    {/* Product Specifications */}
                    {product.specifications && Object.keys(product.specifications).length > 0 && (
                        <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                            <h3 className="font-semibold mb-2">Specifications</h3>
                            <dl className="space-y-2">
                                {Object.entries(product.specifications).map(([key, value]) => (
                                    <div key={key} className="flex justify-between">
                                        <dt className="text-gray-500">{key}:</dt>
                                        <dd className="font-medium">{value}</dd>
                                    </div>
                                ))}
                            </dl>
                        </div>
                    )}

                    {/* Tags */}
                    {product.tags && product.tags.length > 0 && (
                        <div className="mb-6">
                            <h3 className="font-semibold mb-2">Tags</h3>
                            <div className="flex flex-wrap gap-2">
                                {product.tags.map((tag, index) => (
                                    <span key={index} className="px-3 py-1 bg-gray-100 rounded-full text-sm">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* SKU */}
                    <div className="text-sm text-gray-500">
                        SKU: {product.sku}
                    </div>
                </div>
            </div>

            {/* Reviews Section */}
            <div className="mt-8">
                <button
                    onClick={() => setShowReviews(!showReviews)}
                    className="w-full bg-gray-100 py-3 rounded-lg font-semibold hover:bg-gray-200 transition-all mb-4"
                >
                    {showReviews ? 'Hide Reviews' : 'Show Reviews'}
                </button>
                
                {showReviews && (
                    <ProductReviews 
                        productId={productId}
                        reviews={product.reviews || []}
                        onAddReview={(id, review) => console.log('Add review:', review)}
                    />
                )}
            </div>
        </div>
    );
}
