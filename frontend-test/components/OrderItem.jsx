import { format } from 'date-fns';

export default function OrderItem({ order }) {
    const getStatusBadgeClass = (status) => {
        const classes = {
            pending: 'bg-yellow-100 text-yellow-800',
            processing: 'bg-blue-100 text-blue-800',
            shipped: 'bg-green-100 text-green-800',
            delivered: 'bg-green-100 text-green-600',
            cancelled: 'bg-red-100 text-red-800'
        };
        return classes[status.toLowerCase()] || classes.pending;
    };

    return (
        <div className="p-5 bg-gray-50 rounded-xl mb-4">
            <div className="flex justify-between mb-3">
                <div>
                    <span className="font-semibold">Order #{order._id.substring(0, 8)}</span>
                    <span className="text-gray-600 ml-3">{format(new Date(order.createdAt), 'MMM dd, yyyy')}</span>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadgeClass(order.status)}`}>{order.status}</span>
            </div>
            <div className="text-lg font-bold">
                Total: ${order.total.toFixed(2)}
            </div>
            <div className="mt-2 text-gray-600 text-sm">
                {order.items?.length || 0} items
            </div>
        </div>
    );
}
