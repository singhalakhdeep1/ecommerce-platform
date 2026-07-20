export default function Navbar({ activeTab, setActiveTab, cart, searchQuery, setSearchQuery }) {
    return (
        <nav className="bg-white p-4 rounded-2xl shadow-md mb-6 flex items-center justify-between">
            <div className="flex gap-6">
                <span className={`cursor-pointer font-medium transition-colors ${activeTab === 'products' ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`} onClick={() => setActiveTab('products')}>
                    Products
                </span>
                <span className={`cursor-pointer font-medium transition-colors ${activeTab === 'cart' ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`} onClick={() => setActiveTab('cart')}>
                    Cart {cart.length > 0 && <span className="bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-semibold ml-1 inline-flex">{cart.length}</span>}
                </span>
                <span className={`cursor-pointer font-medium transition-colors ${activeTab === 'orders' ? 'text-blue-600' : 'text-gray-600 hover:text-blue-600'}`} onClick={() => setActiveTab('orders')}>
                    Orders
                </span>
            </div>
            <div>
                <input
                    type="text"
                    placeholder="Search products..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-64 p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-all"
                />
            </div>
        </nav>
    );
}
