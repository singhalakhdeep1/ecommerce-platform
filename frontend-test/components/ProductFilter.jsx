export default function ProductFilter({ categories, selectedCategory, setSelectedCategory }) {
    return (
        <div className="bg-white rounded-2xl shadow-md p-6 mb-6">
            <div className="flex gap-3 items-center flex-wrap">
                <label className="font-semibold">Category:</label>
                <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 transition-all bg-white cursor-pointer w-48">
                    <option value="all">All Categories</option>
                    {categories.map((cat) => (
                        <option key={cat._id} value={cat._id}>{cat.name}</option>
                    ))}
                </select>
            </div>
        </div>
    );
}
