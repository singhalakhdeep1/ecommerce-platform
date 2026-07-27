import { useState } from 'react';

export default function ProductReviews({ productId, reviews = [], onAddReview }) {
    const [showReviewForm, setShowReviewForm] = useState(false);
    const [newReview, setNewReview] = useState({
        rating: 5,
        title: '',
        comment: ''
    });

    const handleSubmitReview = (e) => {
        e.preventDefault();
        onAddReview(productId, newReview);
        setNewReview({ rating: 5, title: '', comment: '' });
        setShowReviewForm(false);
    };

    const averageRating = reviews.length > 0 
        ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
        : '0.0';

    const ratingDistribution = [5, 4, 3, 2, 1].map(stars => ({
        stars,
        count: reviews.filter(r => r.rating === stars).length,
        percentage: reviews.length > 0 
            ? (reviews.filter(r => r.rating === stars).length / reviews.length) * 100 
            : 0
    }));

    return (
        <div className="bg-white rounded-2xl shadow-md p-6 mt-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Customer Reviews</h2>
                <button
                    onClick={() => setShowReviewForm(!showReviewForm)}
                    className="bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 transition-all"
                >
                    {showReviewForm ? 'Cancel' : 'Write a Review'}
                </button>
            </div>

            {/* Rating Summary */}
            <div className="flex gap-8 mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="text-center">
                    <div className="text-4xl font-bold text-blue-600">{averageRating}</div>
                    <div className="text-yellow-400 text-xl">{'★'.repeat(Math.round(averageRating))}</div>
                    <div className="text-gray-500 text-sm">{reviews.length} reviews</div>
                </div>
                <div className="flex-1">
                    {ratingDistribution.map(({ stars, count, percentage }) => (
                        <div key={stars} className="flex items-center gap-2 mb-1">
                            <span className="text-sm w-8">{stars} ★</span>
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                                <div 
                                    className="bg-yellow-400 h-2 rounded-full" 
                                    style={{ width: `${percentage}%` }}
                                />
                            </div>
                            <span className="text-sm text-gray-500 w-8">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Review Form */}
            {showReviewForm && (
                <form onSubmit={handleSubmitReview} className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-semibold mb-4">Write Your Review</h3>
                    
                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Rating</label>
                        <div className="flex gap-2">
                            {[1, 2, 3, 4, 5].map(star => (
                                <button
                                    key={star}
                                    type="button"
                                    onClick={() => setNewReview({ ...newReview, rating: star })}
                                    className={`text-2xl ${newReview.rating >= star ? 'text-yellow-400' : 'text-gray-300'}`}
                                >
                                    ★
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Title</label>
                        <input
                            type="text"
                            value={newReview.title}
                            onChange={(e) => setNewReview({ ...newReview, title: e.target.value })}
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500"
                            required
                        />
                    </div>

                    <div className="mb-4">
                        <label className="block text-sm font-medium mb-2">Review</label>
                        <textarea
                            value={newReview.comment}
                            onChange={(e) => setNewReview({ ...newReview, comment: e.target.value })}
                            className="w-full p-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-blue-500 h-32"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="bg-blue-600 text-white py-2 px-6 rounded-lg hover:bg-blue-700 transition-all"
                    >
                        Submit Review
                    </button>
                </form>
            )}

            {/* Reviews List */}
            <div className="space-y-4">
                {reviews.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">No reviews yet. Be the first to review!</p>
                ) : (
                    reviews.map(review => (
                        <div key={review.id} className="border-b border-gray-200 pb-4 last:border-0">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="text-yellow-400">
                                        {'★'.repeat(review.rating)}
                                    </div>
                                    <h4 className="font-semibold">{review.title}</h4>
                                </div>
                                <span className="text-sm text-gray-500">
                                    {new Date(review.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                            <p className="text-gray-600">{review.comment}</p>
                            {review.user && (
                                <div className="text-sm text-gray-500 mt-2">
                                    By {review.user.name}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
