module.exports = {
  success: (data, message = "Success") => {
    // Safely serialize data to avoid circular references
    let safeData = data;
    try {
      if (data && typeof data === 'object') {
        // Handle Sequelize instances and arrays
        if (Array.isArray(data)) {
          safeData = data.map(item => {
            if (item && item.toJSON) return item.toJSON();
            return item;
          });
        } else if (data.toJSON) {
          safeData = data.toJSON();
        } else {
          // Deep clone to break circular references
          safeData = JSON.parse(JSON.stringify(data));
        }
      }
    } catch (err) {
      // Fallback if serialization fails
      safeData = { message: 'Data serialization failed', originalType: typeof data };
    }
    
    return { success: true, message, data: safeData };
  },
  
  error: (error, code = 400) => {
    return {
      success: false,
      message: error.message || "Something went wrong",
      details: error.details || null,
      code
    };
  }
};
