/**
 * @module rss.feed
 * @description Defines the {@link Feed} class, which manages a single RSS/Atom source.
 * It is responsible for fetching data, parsing the content, filtering new items,
 * and maintaining item history.
 * 
 */

import { parseFeed } from 'htmlparser2';
import FeedError from './FeedError.js';
import FeedItem from './FeedItem.js';

/**
 * @constant {Object<string, number>} RESPONSE_CODES - Standard HTTP response codes used for status checking.
 */
const RESPONSE_CODES = {
	OK: 200,
	NOT_FOUND: 404,
	ISE: 500,
};

/**
 * @constant {number} historyLengthMultiplier - Multiplier used to determine the maximum item history length
 * based on the number of items fetched in a single update cycle.
 */
const historyLengthMultiplier = 1; //3;	// Multiplier to set feed history length

/**
 * @constant {string[]} ALLOWED_MIMES - List of acceptable MIME types for RSS/Atom feeds in the Accept header.
 */
const ALLOWED_MIMES = [
	'text/html',
	'application/xhtml+xml',
	'application/xml',
	'text/xml',
	'application/atom+xml',
	'application/rss+xml'
  ];

/**
 * @class Feed
 * @description Manages the fetching, parsing, and storage of items for a single feed URL.
 */
class Feed {

	/**
     * @typedef {Object} FeedData
     * @property {number} id - Unique ID of the feed in the database (`rss_sites.id`).
     * @property {string} name - Custom name for the feed source.
     * @property {string} url - The URL of the RSS/Atom feed source.
     * @property {number} category - The category ID (`rss_cats.id`) this feed belongs to.
     * @property {number} refresh - The refresh interval in milliseconds.
     * @property {Object[]} [items=[]] - Array of initial feed items (history).
     * @property {string} userAgent - User agent string to use for fetching.
     * @property {string} [eventName='new-item'] - Event name to emit when a new item is found.
     * @property {Object} [handler] - Optional error handler object with a `handle` method.
     */
	constructor(data) {

		if (!data.url) {
            // Throw early if the most critical piece of data is missing.
            throw new TypeError('Feed initialization failed: Missing required field `url`.');
        }

        this.id = data.id;
        this.name = data.name;
        this.url = data.url;
        this.category = data.category || null;
        this.refresh = data.refresh || (60000 * 60); // Default to 1 hour
        this.items = data.items || [];
        this.userAgent = data.userAgent;
        this.eventName = data.eventName || 'new-item';
        this.maxHistoryLength = this.items.length * historyLengthMultiplier;
        this.handler = data.handler; // Store the optional error handler
        this.interval = null; // Used to store the setInterval reference
	}

	/**
     * @method findItem
     * @description Checks if an item (identified by URL or Title) already exists in the feed's history.
     *
     * @param {Object} item - The item object to check, containing `url` and `title`.
     * @returns {FeedItem|undefined} The existing item object if found, otherwise `undefined`.
     */
	findItem(item) {
        // Find an item where either the URL OR the Title matches an entry in history.
        // This is generally safer than relying on GUIDs which are inconsistent.
        return this.items.find(entry =>
            (entry.url === item.url || entry.title === item.title)
        );
    }

	/**
     * @method updateHxLength
     * @description Updates the maximum history length for the feed based on the size of the latest fetch result.
     * This prevents history from growing indefinitely or being static if the feed size changes.
     *
     * @param {Object[]} newItems - The array of recently fetched items.
     * @returns {void}
     */
    updateHxLength(newItems) {
        this.maxHistoryLength = newItems.length * historyLengthMultiplier;
    }

	/**
     * @method addItem
     * @description Adds a new item to the feed history and trims the history array
     * to maintain `this.maxHistoryLength`.
     *
     * @param {Object} item - The standardized item object to add to the feed history.
     * @returns {void}
     */
    addItem(item) {
        this.items.push(item);
        // Slice from the end to keep only the most recent items up to maxHistoryLength.
        this.items = this.items.slice(-this.maxHistoryLength);
    }

	/**
     * @method fetchData
     * @description Fetches feed data from `this.url`, validates the response, and parses the content.
     *
     * @async
     * @returns {Promise<Object[]>} A promise that resolves to an array of parsed and standardized feed item objects.
     */
	async fetchData() {

		try {
			// Fetch the data
			const response = await fetch(this.url, {
				headers: {
					'User-Agent': this.userAgent,
					// Send the comprehensive list of accepted MIME types
					'Accept': ALLOWED_MIMES.join(','),
				},
			});

			// Check HTTP Status
			if (response.status !== RESPONSE_CODES.OK) {
				// Throw an error with context for the handler
				throw new FeedError(
					`Feed fetch failed. HTTP status: ${response.status}`,
					'fetch_url_error',
					this.url,
					this.id
				);
			}

			// Get text and Parse
			const feedData = await response.text();

			// htmlparser2's parseFeed is used to convert the raw XML/HTML into a structured feed object
			const parsedFeed = await parseFeed(feedData, { xmlMode: true });

			// Ensure the parsing was successful and resulted in items
            if (!parsedFeed || !Array.isArray(parsedFeed.items) || parsedFeed.items.length === 0) {
                throw new FeedError(
                    'Feed parsing failed or returned no items.',
                    'parse_url_error',
                    this.url,
                    this.id
                );
            }

			// Filter and Normalize
            const feedItems = this.filterItems(parsedFeed.items);

            return feedItems;

		} catch (error) {
			this.handleError(error);
			//console.error("Failed to fetch data:", error);
			return [];
		}
	}

	/**
     * @method filterItems
     * @description Normalizes an array of raw feed items into standardized objects
     * and filters them to only include items published within the last 24 hours.
     *
     * @param {Object[]} items - Array of raw item objects from the parser.
     * @returns {Object[]} - Array of standardized feed items (with title, url, date).
     */
	filterItems = items => {

		if (!items || items.length === 0) return []; // Return empty array if input is invalid or empty

		// Initialize an empty array to store the normalized feed items
		const feedItems = [];

		const now = new Date();
		const oneDayMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

		items.forEach(item => {
			// Determine the publication date, prioritizing 'pubDate' over 'published'
			const itemDate = new Date(item.pubDate || item.published);

			// // Check if itemDate is a valid date object and within the last 24 hours
			// if (now - itemDate <= oneDayMs) {
			// 	// Push a new object to feedItems with standardized properties
			// 	feedItems.push({
			// 		title: item.title,                      // Set the title of the feed item
			// 		url: item.link,                         // Set the url of the feed item
			// 		date: itemDate,                      // Set the standardized date
			// 		//content: item.description             // Set the description as content
			// 	});
			// }

			// Check if itemDate is a valid date object and within the last 24 hours
            if (
                !isNaN(itemDate.getTime()) && // Check for valid date
                (now.getTime() - itemDate.getTime() <= oneDayMs)
            ) {
                // Push a new object to feedItems with standardized properties
                feedItems.push({
                    title: item.title,
                    url: item.link, 			// The parser uses 'link' for the article URL
                    date: itemDate,
                    category: this.category,	// Pass the feed's category ID
                    website: this.id,			// Pass the feed's website ID
                });
            }
		});

		// Return the array of normalized feed items
		return feedItems;
	};

	/**
     * @method handleError
     * @description Routes the error to the provided error handler (`this.handler`)
     * or logs it to the console if no handler is registered.
     *
     * @param {Error|FeedError} error - The error object to handle.
     * @returns {void}
     */
    handleError(error) {
        if (this.handler && typeof this.handler.handle === 'function') {
            this.handler.handle(error);
        } else {
            // Fallback: log the error if no handler is set or if the handler is invalid.
            console.error(`Feed Error (ID: ${this.id}, URL: ${this.url}):`, error);
        }
    }	

	/**
     * @method destroy
     * @description Cleans up the feed instance by clearing its refresh interval (`this.interval`).
     * This should be called when the feed is removed from monitoring.
     *
     * @returns {void}
     */
    destroy() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
    }
}

export default Feed;