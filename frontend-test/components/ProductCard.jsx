export default function ProductCard({ product, onAddToCart }) {
    return (
        <div className="bg-white rounded-2xl overflow-hidden shadow-md transition-all hover:-translate-y-1 hover:shadow-lg">
            <div className="w-full h-52 object-cover bg-gray-100 flex items-center justify-center text-5xl">
                📦
            </div>
            <div className="p-4">
                <span className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-semibold mb-3">{product.category?.name || 'General'}</span>
                <h3 className="text-base font-semibold mb-2 text-gray-800">{product.name}</h3>
                <p className="text-gray-600 text-sm mb-3">{product.description}</p>
                <div className="text-xl font-bold text-blue-600 mb-3">${product.price.toFixed(2)}</div>
                <div className="flex gap-2">
                    <button onClick={() => onAddToCart(product._id)} className="flex-1 bg-gradient-to-r from-blue-600 to-blue-800 text-white py-3 px-4 rounded-lg font-semibold hover:shadow-lg transition-all">
                        Add to Cart
                    </button>
                </div>
            </div>
        </div>
    );
}
