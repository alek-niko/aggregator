/**
 * @module rss.feed.manager
 * @description Exports the {@link FeedManager} class, which handles the lifecycle,
 * 				data fetching, sorting, filtering, and event emission for a single {@link Feed} instance.
 */

'use strict';

/**
 * @typedef {Object} FeedDataWrapper
 * @property {Object[]} items - Array of raw feed item objects fetched from the source.
 * @property {string} url - The URL of the feed.
 * @property {Object[]} [newItems] - Array of items that are new and not in the feed's history.
 */

/**
 * @class FeedManager
 * @description Manages the fetching, processing, and emitting of events for a single Feed object.
 */
class FeedManager {
	/**
	 * @constructor
	 * @param {FeedEmitter} emitter - The parent emitter instance to publish events to.
	 * @param {Feed} feed - The Feed instance this manager is responsible for.
	 */
	constructor(emitter, feed) {

		this.instance = emitter;	/** @type {FeedEmitter} */
		this.feed = feed;			/** @type {Feed} */

		// Register this manager's error handler on the feed instance to catch internal fetch/parse errors.
		this.feed.handler = { handle: this.onError.bind(this) };
	}

	/**
	 * @method sortItems
	 * @description Sorts the `items` array in `feedData` by the `date` property in ascending order.
     * 				This ensures that items are processed chronologically (older first) to correctly populate history.
	 *
	 * @param {FeedDataWrapper} feedData - An object containing the array of items to sort.
	 * @returns {FeedDataWrapper} The input object with its `items` array sorted by date.
	 */
	sortItems(feedData) {

		feedData.items.sort((a, b) => {

			const dateA = new Date(a.date);
			const dateB = new Date(b.date);

			// Robust check: Move invalid dates to the end of the array.
			if (isNaN(dateA) || isNaN(dateB)) {
				return isNaN(dateA) ? 1 : -1;
			}

			// Sort valid dates in ascending order (older items first).
			return dateA.getTime() - dateB.getTime();
		});

		return feedData;
	}

	/**
	 * @method filterNewItems
	 * @description Identifies new items by asynchronously checking which fetched items don't 
     * 				already exist in the feed's persistent history (via ItemService).
	 *
	 * @param {FeedDataWrapper} data - Contains items from the latest fetch.
	 * @returns {Promise<void>} The result is stored in the `data.newItems` property.
	 */
	async filterNewItems(data) {
		
		const newItems = [];

		for (const item of data.items) {

			const exists = await this.feed.findItem(item);

			if (!exists) {
				// Attach the current feed's unique ID for database insertion later
				// item.website = this.feed.id;
				// item.category = this.feed.category; 
				newItems.push(item);
			}
		}
		data.newItems = newItems;
		
	}

	/**
	 * @method addItemsToFeed
	 * @description Adds identified new items to the feed's history (database) and emits them via the emitter.
	 * 				Emission is skipped during the first load if `skipFirstLoad` is enabled on the emitter.
	 * 
	 * @param {FeedDataWrapper} data - Contains the `newItems` array to process.
	 * @param {boolean} firstLoad - Flag indicating whether this is the initial load for the feed.
	 * @returns {Promise<void>}
	 */
	async addItemsToFeed(data, firstLoad) { // Make it async

		for (const item of data.newItems) {

			// Add item to the feed's history (DATABASE INSERT).
			await this.feed.addItem(item); 
						
			// Check if the item should be emitted (skip emission on first load if configured).
			if (!firstLoad || !this.instance.skipFirstLoad) {

				// Emit the new item event. The Aggregator handles Redis publication here.
				this.instance.emit(this.feed.eventName, item);
			}
		}
	}

	/**
	 * @method onError
	 * @description Handles errors originating from the associated Feed instance by emitting them
	 * 				to the parent FeedEmitter instance. This is the implementation for `this.feed.handler`.
	 *
	 * @param {Error|FeedError} error - The error object to emit.
	 * @returns {void}
	 */
	onError(error) {
		this.instance.emit('error', error);
	}

	/**
	 * @method getContent
	 * @description Fetches new content for the managed feed, processes it, and emits any new items.
	 * 				This method orchestrates the core fetching and filtering workflow.
	 *
	 * @param {boolean} [firstLoad=false] - Whether this is the first load of the feed since startup.
	 * @returns {Promise<boolean>} Resolves to `true` if content was successfully fetched/processed, `false` otherwise.
	 */
	async getContent(firstLoad = false) {

		try {
			// Fetch items from the source.
			const items = await this.feed.fetchData();

			// Guard clause: stop processing if no valid items are returned.
			if (!items || !Array.isArray(items) || items.length === 0) {
				return true; 
			}

			// Wrap the items and URL for processing.
			const data = { items, url: this.feed.url };

			// Sort items chronologically before filtering.
			this.sortItems(data);
			
			// AWAIT the asynchronous filtering (checks DB history)
			await this.filterNewItems(data);
			
			// AWAIT the asynchronous insertion and emission (inserts into DB)
			await this.addItemsToFeed(data, firstLoad);

			// Emit special event if it was an initial load (optional, useful for startup status)
			if (firstLoad && !this.instance.skipFirstLoad) {
				// NOTE: The `items` property is intentionally omitted as history is now fully in SQL.
				this.instance.emit(`initial-load:${this.feed.url}`, { url: this.feed.url });
			}

			return true;

		} catch (error) {
			// If any error occurs (fetch, parse, DB), emit it via the central error handler.
			this.onError(error);

			// Signal failure for the FeedEmitter/Aggregator to trigger backoff logic.
			return false;
		}
	}
}

export default FeedManager;