import { useState, useEffect } from 'react';

export default function UserProfile({ userId, onUpdate }) {
    const [user, setUser] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: {
            street: '',
            city: '',
            state: '',
            zip: '',
            country: ''
        }
    });

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    useEffect(() => {
        if (userId) {
            fetchUser();
        }
    }, [userId]);

    const fetchUser = async () => {
        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                }
            });
            const data = await res.json();
            if (data.success) {
                setUser(data.data);
                setFormData({
                    name: data.data.name || '',
                    email: data.data.email || '',
                    phone: data.data.phone || '',
                    address: data.data.address || {
                        street: '',
                        city: '',
                        state: '',
                        zip: '',
                        country: ''
                    }
                });
            }
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_URL}/auth/me`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: JSON.stringify(formData)
            });
            const data = await res.json();
            if (data.success) {
                setUser(data.data);
                setIsEditing(false);
                onUpdate && onUpdate(data.data);
            }
        } catch (error) {
            console.error('Error updating user:', error);
        }
    };

    if (!user) {
        return (
            <div className="bg-white rounded-2xl shadow-md p-6 text-center">
                <div className="text-6xl mb-4">👤</div>
                <h3 className="text-xl font-semibold mb-2">Please login to view your profile</h3>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-md p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">My Profile</h2>
                {!isEditing && (
                    <button
                        onClick={() => setIsEditing(true)}
                        className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-all"
                    >
                        Edit Profile
                    </button>
                )}
            </div>

            {isEditing ? (
                <form onSubmit={handleUpdate} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-2">Name</label>
                        <input
                            type="text"
                            value={formData.name}
                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Email</label>
                        <input
                            type="email"
                            value={formData.email}
                            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-2">Phone</label>
                        <input
                            type="tel"
                            value={formData.phone}
                            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                        />
                    </div>

                    <div className="border-t pt-4">
                        <h3 className="font-semibold mb-4">Address</h3>
                        
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2">Street Address</label>
                                <input
                                    type="text"
                                    value={formData.address.street}
                                    onChange={(e) => setFormData({ 
                                        ...formData, 
                                        address: { ...formData.address, street: e.target.value }
                                    })}
                                    className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">City</label>
                                    <input
                                        type="text"
                                        value={formData.address.city}
                                        onChange={(e) => setFormData({ 
                                            ...formData, 
                                            address: { ...formData.address, city: e.target.value }
                                        })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">State</label>
                                    <input
                                        type="text"
                                        value={formData.address.state}
                                        onChange={(e) => setFormData({ 
                                            ...formData, 
                                            address: { ...formData.address, state: e.target.value }
                                        })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-2">ZIP Code</label>
                                    <input
                                        type="text"
                                        value={formData.address.zip}
                                        onChange={(e) => setFormData({ 
                                            ...formData, 
                                            address: { ...formData.address, zip: e.target.value }
                                        })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium mb-2">Country</label>
                                    <input
                                        type="text"
                                        value={formData.address.country}
                                        onChange={(e) => setFormData({ 
                                            ...formData, 
                                            address: { ...formData.address, country: e.target.value }
                                        })}
                                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="flex gap-4">
                        <button
                            type="submit"
                            className="flex-1 bg-blue-600 text-white py-3 px-6 rounded-lg font-semibold hover:bg-blue-700 transition-all"
                        >
                            Save Changes
                        </button>
                        <button
                            type="button"
                            onClick={() => setIsEditing(false)}
                            className="flex-1 bg-gray-200 py-3 px-6 rounded-lg font-semibold hover:bg-gray-300 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            ) : (
                <div className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center text-3xl">
                            👤
                        </div>
                        <div>
                            <h3 className="text-xl font-semibold">{user.name}</h3>
                            <p className="text-gray-500">{user.email}</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500">Member Since</div>
                            <div className="font-semibold">
                                {new Date(user.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500">Total Orders</div>
                            <div className="font-semibold">{user.orderCount || 0}</div>
                        </div>
                    </div>

                    {user.phone && (
                        <div>
                            <h4 className="font-semibold mb-2">Phone</h4>
                            <p className="text-gray-600">{user.phone}</p>
                        </div>
                    )}

                    {user.address && (user.address.street || user.address.city) && (
                        <div>
                            <h4 className="font-semibold mb-2">Address</h4>
                            <p className="text-gray-600">
                                {user.address.street && <>{user.address.street}<br /></>}
                                {user.address.city && user.address.city}{user.address.state && `, ${user.address.state}`}<br />
                                {user.address.zip && user.address.zip}{user.address.country && `, ${user.address.country}`}
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
