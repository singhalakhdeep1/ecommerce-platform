import './globals.css';

export const metadata = {
    title: 'E-Commerce Shop',
    description: 'Complete e-commerce platform with products, cart, and orders',
};

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
