const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    console.error(err);

    // Sequelize errors
    if (err.name === 'SequelizeValidationError') {
        error.message = err.errors.map(e => e.message);
        error.statusCode = 400;
    }

    if (err.name === 'SequelizeUniqueConstraintError') {
        error.message = 'Duplicate field value';
        error.statusCode = 400;
    }

    res.status(error.statusCode || 500).json({
        success: false,
        error: error.message || 'Server Error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
