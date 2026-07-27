import { useState } from 'react';

export default function Auth({ onLogin, onRegister }) {
    const [isLogin, setIsLogin] = useState(true);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (isLogin) {
            await onLogin({ email: formData.email, password: formData.password });
        } else {
            if (formData.password !== formData.confirmPassword) {
                alert('Passwords do not match');
                return;
            }
            await onRegister({ 
                name: formData.name, 
                email: formData.email, 
                password: formData.password 
            });
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-md p-6 max-w-md mx-auto">
            <h2 className="text-2xl font-bold mb-6 text-center">
                {isLogin ? 'Login' : 'Create Account'}
            </h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
                {!isLogin && (
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
                )}
                
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
                    <label className="block text-sm font-medium mb-2">Password</label>
                    <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                        required
                    />
                </div>
                
                {!isLogin && (
                    <div>
                        <label className="block text-sm font-medium mb-2">Confirm Password</label>
                        <input
                            type="password"
                            value={formData.confirmPassword}
                            onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                            required
                        />
                    </div>
                )}
                
                <button
                    type="submit"
                    className="w-full bg-gradient-to-r from-blue-600 to-blue-800 text-white py-3 px-6 rounded-lg font-semibold hover:shadow-lg transition-all"
                >
                    {isLogin ? 'Login' : 'Register'}
                </button>
            </form>
            
            <p className="text-center mt-4 text-gray-600">
                {isLogin ? "Don't have an account? " : "Already have an account? "}
                <button
                    onClick={() => setIsLogin(!isLogin)}
                    className="text-blue-600 font-semibold hover:underline"
                >
                    {isLogin ? 'Register' : 'Login'}
                </button>
            </p>
        </div>
    );
}
