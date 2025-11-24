/**
 * @module rss.feed
 * @description Exports the {@link Feed} class, which manages a single RSS/Atom source.
 *				It is responsible for fetching data, parsing the content, and delegating history
 *				checks and storage to the {@link ItemService}.
 */

import { parseFeed } from 'htmlparser2';
import FeedError from './FeedError.js';

// Import the ItemService to manage item persistence in SQL.
import ItemService from '../services/ItemService.js';

/**
 * @constant {Object<string, number>} RESPONSE_CODES - Standard HTTP response codes used for status checking.
 */
const RESPONSE_CODES = {
	OK: 200,
	NOT_FOUND: 404,
	ISE: 500,
};


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

		if (!data || !data.url || !data.id) { // Ensure ID is present as it's used for persistence/linking
			throw new TypeError('Feed initialization failed: Missing required field `url` or `id`.');
		}

		this.id = data.id;								/** @type {number} */
		this.name = data.name;							/** @type {string} */
		this.url = data.url;							/** @type {string} */
		this.category = data.category || null;			/** @type {number|null} */
		this.refresh = data.refresh || (60000 * 60);	/** @type {number} */
		this.userAgent = data.userAgent;				/** @type {string} */
		this.eventName = data.eventName || 'new-item';	/** @type {string} */
		this.handler = data.handler;					/** @type {Object} */

		// Initialize the asynchronous ItemService layer
		this.itemService = new ItemService();
	}

	/**
	 * @method addBulkInsertIgnore
	 * @description Delegates the race-safe, high-performance insertion of a list of items
	 * 				to the underlying ItemService.
	 * 
	 * @param {Array<Array>} bulkValues - The array of [title, url, category, website] arrays.
	 * @returns {Promise<void>}
	 */
	async addBulkInsertIgnore(bulkValues) {
		await this.itemService.addBulkInsertIgnore(bulkValues);
	}

	/**
	 * @method getInsertedItemsByUrlAndDate
	 * @description Delegates retrieval of new items to the ItemService.
	 * 
	 * @returns {Promise<Object[]>}
	 */
	async getInsertedItemsByUrlAndDate(websiteId, urls, startTime) {
		return await this.itemService.getInsertedItemsByUrlAndDate(websiteId, urls, startTime);
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
			// Fetch the data using the custom User-Agent and Accept headers.
			const response = await fetch(this.url, {
				headers: {
					'User-Agent': this.userAgent,
					'Accept': ALLOWED_MIMES.join(','),
				},
			});

			// Check HTTP Status
			if (response.status !== RESPONSE_CODES.OK) {
				// Throw a custom FeedError for backoff and logging logic to pick up.
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

			// Filter and Normalize items before returning.
			const feedItems = this.filterItems(parsedFeed.items);

			return feedItems;

		} catch (error) {

			// If the error is NOT already a FeedError (e.g., network error from `fetch`),
			// wrap it before routing it to the handler.
			const routedError = (error instanceof FeedError)
				? error
				: new FeedError(
					error.message,
					error.name || 'fetch_url_error', // Default to fetch error name
					this.url,
					this.id
				);

			this.handleError(routedError);

			// Must return an empty array on failure as expected by FeedManager.getContent
			return [];
		}
	}

	/**
	 * @method filterItems
	 * @description Normalizes an array of raw feed items into standardized objects
	 * 				and filters them to only include items published within the last 24 hours.
	 *
	 * @param {Object[]} items - Array of raw item objects from the parser.
	 * @returns {Object[]} - Array of standardized feed items (with title, url, date, website, category).
	 */
	filterItems = items => {

		// Return empty array if input is invalid or empty
		if (!items || items.length === 0) return [];

		// Initialize an empty array to store the normalized feed items
		const feedItems = [];

		const now = new Date();
		const oneDayMs = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

		items.forEach(item => {

			// Determine the publication date, prioritizing 'pubDate' over 'published'
			const itemDate = new Date(item.pubDate || item.published);

			// Check if itemDate is a valid date object and within the last 24 hours
			if (
				!isNaN(itemDate.getTime()) &&
				(now.getTime() - itemDate.getTime() <= oneDayMs)
			) {
				// Push a new object to feedItems with standardized properties
				feedItems.push({
					title: item.title,
					url: item.link,             // The parser uses 'link' for the article URL
					date: itemDate,
					category: this.category,    // Pass the feed's category ID
					website: this.id,           // Pass the feed's website ID (used as feed_id)
				});
			}
		});

		// Return the array of normalized feed items
		return feedItems;
	};

	/**
	 * @method handleError
	 * @description Routes the error to the provided error handler (`this.handler`)
	 * 				or logs it to the console if no handler is registered.
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
	 * @description Cleans up the feed instance. (No action needed here since intervals are
	 * 				managed externally in FeedEmitter).
	 * 
	 * @depricated This function is deprecated.
	 * @returns {void}
	 */
	destroy() {
		// No resources (intervals, maps) are held by this instance, so destruction is a no-op.
	}
	
}

export default Feed;