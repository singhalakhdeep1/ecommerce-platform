import ProductCard from './ProductCard';

export default function ProductGrid({ products, onAddToCart }) {
    if (products.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 text-center text-gray-400">
                <div className="text-6xl mb-4">📦</div>
                <h3>No products found</h3>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {products.map((product) => (
                <ProductCard key={product._id} product={product} onAddToCart={onAddToCart} />
            ))}
        </div>
    );
}
