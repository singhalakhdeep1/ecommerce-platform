import { useState, useEffect } from 'react';

export default function AnalyticsDashboard() {
    const [analytics, setAnalytics] = useState(null);
    const [loading, setLoading] = useState(true);
    const [timeRange, setTimeRange] = useState('7d');

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        fetchAnalytics();
    }, [timeRange]);

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const endDate = new Date().toISOString();
            const startDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

            const [salesRes, funnelRes, inventoryRes] = await Promise.all([
                fetch(`${API_URL}/analytics/sales?startDate=${startDate}&endDate=${endDate}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                }),
                fetch(`${API_URL}/analytics/funnel`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                }),
                fetch(`${API_URL}/analytics/inventory?startDate=${startDate}&endDate=${endDate}`, {
                    headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
                })
            ]);

            const salesData = await salesRes.json();
            const funnelData = await funnelRes.json();
            const inventoryData = await inventoryRes.json();

            setAnalytics({
                sales: salesData.success ? salesData.data : null,
                funnel: funnelData.success ? funnelData.data : null,
                inventory: inventoryData.success ? inventoryData.data : null
            });
        } catch (error) {
            console.error('Error fetching analytics:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 bg-gray-200 rounded w-1/4"></div>
                    <div className="grid grid-cols-3 gap-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Analytics Dashboard</h2>
                <select
                    value={timeRange}
                    onChange={(e) => setTimeRange(e.target.value)}
                    className="p-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                >
                    <option value="7d">Last 7 days</option>
                    <option value="30d">Last 30 days</option>
                    <option value="90d">Last 90 days</option>
                </select>
            </div>

            {/* Sales Overview */}
            {analytics?.sales && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                    <div className="p-6 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl text-white">
                        <div className="text-sm opacity-80">Total Revenue</div>
                        <div className="text-3xl font-bold">${analytics.sales.totalRevenue.toFixed(2)}</div>
                        <div className="text-sm opacity-80 mt-2">{analytics.sales.totalOrders} orders</div>
                    </div>
                    <div className="p-6 bg-gradient-to-br from-green-500 to-green-600 rounded-xl text-white">
                        <div className="text-sm opacity-80">Average Order Value</div>
                        <div className="text-3xl font-bold">${analytics.sales.averageOrderValue.toFixed(2)}</div>
                        <div className="text-sm opacity-80 mt-2">Per order</div>
                    </div>
                    <div className="p-6 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl text-white">
                        <div className="text-sm opacity-80">Total Orders</div>
                        <div className="text-3xl font-bold">{analytics.sales.totalOrders}</div>
                        <div className="text-sm opacity-80 mt-2">Completed</div>
                    </div>
                </div>
            )}

            {/* Conversion Funnel */}
            {analytics?.funnel && (
                <div className="mb-8 p-6 bg-gray-50 rounded-xl">
                    <h3 className="text-lg font-semibold mb-4">Conversion Funnel</h3>
                    <div className="space-y-4">
                        {analytics.funnel.conversionRates && (
                            <>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>View to Cart</span>
                                        <span className="font-semibold">{analytics.funnel.conversionRates.view_to_cart.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-blue-600 h-2 rounded-full" 
                                            style={{ width: `${analytics.funnel.conversionRates.view_to_cart}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Cart to Checkout</span>
                                        <span className="font-semibold">{analytics.funnel.conversionRates.cart_to_checkout.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-green-600 h-2 rounded-full" 
                                            style={{ width: `${analytics.funnel.conversionRates.cart_to_checkout}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Checkout to Purchase</span>
                                        <span className="font-semibold">{analytics.funnel.conversionRates.checkout_to_purchase.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-purple-600 h-2 rounded-full" 
                                            style={{ width: `${analytics.funnel.conversionRates.checkout_to_purchase}%` }}
                                        />
                                    </div>
                                </div>
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span>Overall Conversion</span>
                                        <span className="font-semibold">{analytics.funnel.conversionRates.overall.toFixed(1)}%</span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div 
                                            className="bg-yellow-600 h-2 rounded-full" 
                                            style={{ width: `${analytics.funnel.conversionRates.overall}%` }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Inventory Overview */}
            {analytics?.inventory && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="p-6 bg-gray-50 rounded-xl">
                        <h3 className="text-lg font-semibold mb-4">Inventory Summary</h3>
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-600">Total Products</span>
                                <span className="font-semibold">{analytics.inventory.summary.totalProducts}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Low Stock</span>
                                <span className="font-semibold text-yellow-600">{analytics.inventory.summary.lowStockCount}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Out of Stock</span>
                                <span className="font-semibold text-red-600">{analytics.inventory.summary.outOfStockCount}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Inventory Value</span>
                                <span className="font-semibold">${analytics.inventory.summary.totalInventoryValue.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-600">Turnover Rate</span>
                                <span className="font-semibold">{analytics.inventory.summary.turnoverRate.toFixed(1)}%</span>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-gray-50 rounded-xl">
                        <h3 className="text-lg font-semibold mb-4">Top Selling Products</h3>
                        <div className="space-y-3">
                            {analytics.inventory.topSellingProducts?.slice(0, 5).map((product, index) => (
                                <div key={index} className="flex justify-between items-center">
                                    <div>
                                        <div className="font-medium">{product.name}</div>
                                        <div className="text-sm text-gray-500">{product.sku}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-semibold">{product.quantitySold} sold</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Sales Trend */}
            {analytics?.sales?.salesTrend && (
                <div className="mt-8 p-6 bg-gray-50 rounded-xl">
                    <h3 className="text-lg font-semibold mb-4">Sales Trend</h3>
                    <div className="h-64 flex items-end gap-2">
                        {analytics.sales.salesTrend.slice(-7).map((day, index) => {
                            const maxRevenue = Math.max(...analytics.sales.salesTrend.map(d => d.revenue));
                            const height = maxRevenue > 0 ? (day.revenue / maxRevenue) * 100 : 0;
                            return (
                                <div key={index} className="flex-1 flex flex-col items-center">
                                    <div 
                                        className="w-full bg-blue-500 rounded-t transition-all hover:bg-blue-600"
                                        style={{ height: `${height}%` }}
                                    />
                                    <div className="text-xs text-gray-500 mt-2">
                                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
