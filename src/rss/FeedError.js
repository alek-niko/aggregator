/**
 * @module FeedError
 * @description Exports a custom error class, {@link FeedError}, used to handle
 * specific errors occurring during RSS feed processing (fetching, parsing, etc.).
 * It extends the standard JavaScript {@link Error} class with added context.
 */

'use strict';

/**
 * @class FeedError
 * @augments {Error}
 * @description Custom error class for handling feed-related errors, 
 * 				adding contextual properties like the feed URL and database ID.
 */
class FeedError extends Error {
	/**
     * @constructor
     * @param {string} message - The human-readable error message.
     * @param {string} [type='FeedError'] - The specific type of error (e.g., 'fetch_url_error'). This sets the `name` property.
     * @param {string} [feed=''] - The URL of the feed that caused the error.
     * @param {number|null} [feedId=null] - The database ID of the feed (`rss_sites.id`).
     */
	constructor(message, type = 'FeedError', feed = '', feedId = null) {
		super(message);

		// Ensure the prototype chain is correctly set for error subclassing
        // This is good practice for compatibility, though Node.js handles it often.
		if (Error.captureStackTrace) {
            Error.captureStackTrace(this, FeedError);
        }
		
		this.name = type;		/** @type {string} */
		this.feed = feed;		/** @type {string} */
		this.feedId = feedId;	/** @type {number|null} */
	}

	/**
     * @method toString
     * @description Overrides the default `Error.prototype.toString()` to provide a descriptive
     * string representation of the error, including the type, message, and feed URL.
     *
     * @returns {string} Error message string with type and feed information.
     */
	toString() {
		return `${this.name}: ${this.message}${this.feed ? `\nFeed URL: ${this.feed}` : ''}`;
	}

	/**
     * @method toJSON
     * @description Provides a structured JSON representation of the error, useful for logging
     * and external communication (e.g., Redis publishing).
     *
     * @returns {Object} A serializable object containing key error properties.
     */
	toJSON() {
		return {
			message: this.message,
			type: this.name,
			feed: this.feed,
			feedId: this.feedId
		}
	}
}

export default FeedError;