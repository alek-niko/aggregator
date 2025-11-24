/**
 * @module rss.feed.manager
 * @description Exports the {@link FeedManager} class, which handles the lifecycle,
 * 				data fetching, sorting, filtering, and event emission for a single {@link Feed} instance.
 */

'use strict';

import { normalizeUrl } from "../lib/url-normalize.js";

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
			
			// Prepare data, Insert data, and Identify new data
			await this.persistFeedItems(data);
			
			// NO AWAIT needed: Perform synchronous emission.
	   		this.emitNewItems(data, firstLoad);

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

	/**
	 * @method emitNewItems
	 * @description Emits the array of items identified as new in the current batch via the emitter. 
	 * Database persistence is handled by the atomic logic in filterNewItems.
	 * 
	 * @param {FeedDataWrapper} data - Contains the `newItems` array to emit.
	 * @param {boolean} firstLoad - Flag indicating whether this is the initial load.
	 * @returns {void}
	 */
	emitNewItems(data, firstLoad) { 
		// Logic remains: loop through data.newItems and emit events.
		const shouldEmit = !firstLoad || !this.instance.skipFirstLoad;
		
		if (shouldEmit) {
			for (const item of data.newItems) {
				this.instance.emit(this.feed.eventName, item);
			}
		}
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
	 * @method persistFeedItems
	 * @description Performs URL normalization, bulk inserts items atomically using UPSERT, and reliably 
	 * 				identifies items that were truly new by checking the database post-insertion.
	 * 
	 * @param {FeedDataWrapper} data - Contains raw feed items.
	 * @returns {Promise<void>} Resolves after processing. `data.newItems` is updated.
	 */
	async persistFeedItems(data) {

		if (!data.items || data.items.length === 0) {
			data.newItems = [];
			return;
		}
		
		// Prepare Data and Record Start Time
		
		// CRITICAL: Record the start time before any database I/O.
		const startTime = new Date().toISOString().slice(0, 19).replace('T', ' '); 
		
		// Normalize and enrich all items for the atomic write.
		const normalizedItems = data.items.map(item => {

			const normalizedUrl = normalizeUrl(item.url); 
			
			if (!normalizedUrl) return null; 

			return {
				...item,
				url: normalizedUrl, 
				website: item.website || this.feed.id,
				category: item.category || this.feed.category
			};
		}).filter(i => i !== null);

		if (normalizedItems.length === 0) {
			data.newItems = [];
			return;
		}

		// Prepare values for the model's bulk function.
		const bulkValues = normalizedItems.map(i => [
			i.title,
			i.url,
			i.category,
			i.website
		]);
		
		// Atomic Bulk Insertion

		// Call the race-safe model function. No return value is needed here.
		await this.feed.addBulkInsertIgnore(bulkValues);

		// Reliable Identification of New Items
		
		const urls = normalizedItems.map(i => i.url);
		
		// Call the specialized model function to retrieve only the new items.
		const rows = await this.feed.getInsertedItemsByUrlAndDate(this.feed.id, urls, startTime);

		// Final Cleanup and Output 

		// Create a quick lookup Set of the URLs that were successfully inserted.
		// The model returned rows containing only the 'url' field.
		const newUrlsSet = new Set(rows.map(r => r.url));
		
		// Filter the original batch to find only the items that match the inserted URLs.
		data.newItems = normalizedItems.filter(i => newUrlsSet.has(i.url));
		
		//console.log(`[Aggregator] Inserted ${data.newItems.length} new items out of ${normalizedItems.length} processed.`);
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

}

export default FeedManager;