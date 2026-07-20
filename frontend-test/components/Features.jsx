export default function Features() {
    const features = [
        'Product Catalog',
        'Shopping Cart',
        'Order Management',
        'Categories',
        'PostgreSQL',
        'Sequelize ORM',
        'Stripe Payments',
        'API Documentation'
    ];

    return (
        <div className="bg-white rounded-2xl shadow-md p-8">
            <h3 className="text-xl font-bold mb-5">✅ Features</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {features.map((feature, index) => (
                    <div key={index} className="bg-gray-50 rounded-lg p-4 text-center">
                        {feature}
                    </div>
                ))}
            </div>
        </div>
    );
}
