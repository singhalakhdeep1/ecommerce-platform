'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Message from '@/components/Message';
import Navbar from '@/components/Navbar';
import ProductFilter from '@/components/ProductFilter';
import ProductGrid from '@/components/ProductGrid';
import Cart from '@/components/Cart';
import Orders from '@/components/Orders';
import Features from '@/components/Features';

export default function EcommerceApp() {
    const [activeTab, setActiveTab] = useState('products');
    const [products, setProducts] = useState([]);
    const [categories, setCategories] = useState([]);
    const [cart, setCart] = useState([]);
    const [orders, setOrders] = useState([]);
    const [selectedCategory, setSelectedCategory] = useState('all');
    const [loading, setLoading] = useState({});
    const [message, setMessage] = useState(null);
    const [showCart, setShowCart] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

    const showMessage = (msg, type = 'success') => {
        setMessage({ text: msg, type });
        setTimeout(() => setMessage(null), 5000);
    };

    const fetchProducts = async () => {
        setLoading((prev) => ({ ...prev, products: true }));
        try {
            const params = new URLSearchParams();
            if (selectedCategory !== 'all') params.append('category', selectedCategory);
            if (searchQuery) params.append('search', searchQuery);

            const res = await fetch(`${API_URL}/products?${params}`);
            const data = await res.json();
            setProducts(data.data || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading((prev) => ({ ...prev, products: false }));
        }
    };

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${API_URL}/categories`);
            const data = await res.json();
            setCategories(data.data || []);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const fetchCart = async () => {
        try {
            const res = await fetch(`${API_URL}/cart`);
            const data = await res.json();
            setCart(data.data?.items || []);
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const fetchOrders = async () => {
        setLoading((prev) => ({ ...prev, orders: true }));
        try {
            const res = await fetch(`${API_URL}/orders`);
            const data = await res.json();
            setOrders(data.data || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading((prev) => ({ ...prev, orders: false }));
        }
    };

    const addToCart = async (productId, quantity = 1) => {
        try {
            const res = await fetch(`${API_URL}/cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ productId, quantity }),
            });
            const data = await res.json();
            if (data.success) {
                showMessage('Added to cart');
                fetchCart();
            }
        } catch (error) {
            showMessage('Failed to add to cart', 'error');
        }
    };

    const updateCartItem = async (itemId, quantity) => {
        try {
            const res = await fetch(`${API_URL}/cart/items/${itemId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ quantity }),
            });
            const data = await res.json();
            if (data.success) {
                fetchCart();
            }
        } catch (error) {
            console.error('Error:', error);
        }
    };

    const removeFromCart = async (itemId) => {
        try {
            const res = await fetch(`${API_URL}/cart/items/${itemId}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (data.success) {
                showMessage('Removed from cart');
                fetchCart();
            }
        } catch (error) {
            showMessage('Failed to remove', 'error');
        }
    };

    const createOrder = async () => {
        setLoading((prev) => ({ ...prev, checkout: true }));
        try {
            const res = await fetch(`${API_URL}/orders`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            const data = await res.json();
            if (data.success) {
                showMessage('Order created successfully!');
                setCart([]);
                setShowCart(false);
                fetchOrders();
            }
        } catch (error) {
            showMessage('Failed to create order', 'error');
        } finally {
            setLoading((prev) => ({ ...prev, checkout: false }));
        }
    };

    const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

    useEffect(() => {
        fetchProducts();
        fetchCategories();
        fetchCart();
    }, [selectedCategory, searchQuery]);

    useEffect(() => {
        if (activeTab === 'orders') {
            fetchOrders();
        }
    }, [activeTab]);

    return (
        <div className="max-w-7xl mx-auto px-5 py-5">
            <Header />
            <Message message={message} />
            <Navbar 
                activeTab={activeTab}
                setActiveTab={setActiveTab}
                cart={cart}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
            />

            {activeTab === 'products' && (
                <>
                    <ProductFilter 
                        categories={categories}
                        selectedCategory={selectedCategory}
                        setSelectedCategory={setSelectedCategory}
                    />
                    <ProductGrid 
                        products={products}
                        onAddToCart={addToCart}
                    />
                </>
            )}

            {activeTab === 'cart' && (
                <Cart 
                    cart={cart}
                    onUpdateQuantity={updateCartItem}
                    onRemove={removeFromCart}
                    cartTotal={cartTotal}
                    onCheckout={createOrder}
                    loading={loading.checkout}
                    onBrowseProducts={() => setActiveTab('products')}
                />
            )}

            {activeTab === 'orders' && (
                <Orders orders={orders} />
            )}

            <Features />
        </div>
    );
}
