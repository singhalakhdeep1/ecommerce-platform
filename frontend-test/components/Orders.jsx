import OrderItem from './OrderItem';

export default function Orders({ orders }) {
    if (orders.length === 0) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6">
                <h2 className="text-2xl mb-5">My Orders</h2>
                <div className="text-center text-gray-400 py-16">
                    <div className="text-6xl mb-4">📋</div>
                    <h3>No orders yet</h3>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <h2 className="text-2xl mb-5">My Orders</h2>
            <div>
                {orders.map((order) => (
                    <OrderItem key={order._id} order={order} />
                ))}
            </div>
        </div>
    );
}
