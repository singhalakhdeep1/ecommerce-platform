export default function CartItem({ item, onUpdateQuantity, onRemove }) {
    return (
        <div className="flex gap-4 p-4 bg-gray-50 rounded-xl mb-3">
            <div className="w-20 h-20 object-cover bg-gray-100 rounded-lg flex items-center justify-center text-3xl">
                📦
            </div>
            <div className="flex-1">
                <h3 className="text-base font-semibold mb-1">{item.product?.name}</h3>
                <p className="text-gray-600 text-sm">${item.price.toFixed(2)}</p>
            </div>
            <div className="flex items-center gap-2">
                <button className="w-8 h-8 border border-gray-300 bg-white rounded-lg cursor-pointer text-base flex items-center justify-center hover:bg-gray-100" onClick={() => onUpdateQuantity(item._id, item.quantity - 1)}>-</button>
                <span className="w-8 text-center">{item.quantity}</span>
                <button className="w-8 h-8 border border-gray-300 bg-white rounded-lg cursor-pointer text-base flex items-center justify-center hover:bg-gray-100" onClick={() => onUpdateQuantity(item._id, item.quantity + 1)}>+</button>
            </div>
            <div className="font-semibold w-20 text-right">
                ${(item.price * item.quantity).toFixed(2)}
            </div>
            <button onClick={() => onRemove(item._id)} className="bg-red-500 hover:bg-red-600 text-white py-2 px-3 rounded-lg font-semibold transition-all">
                🗑️
            </button>
        </div>
    );
}
