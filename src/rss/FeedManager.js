/**
 * @module rdd.feed.manager
 * @description Exports the {@link FeedManager} class, which handles the lifecycle,
 * 				data fetching, sorting, filtering, and event emission for a single {@link Feed} instance.
 */

'use strict';

// -----------------------------------------------------------------------------
// UNUSED UTILITY FUNCTION (REMOVE)
// The function `sortByKey` is unused after the implementation of `sortItems`.
// const sortByKey = (key) => (a, b) => (a[key] > b[key] ? 1 : (b[key] > a[key] ? -1 : 0));
// ------

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

		// Register this manager's error handler on the feed instance.
		this.feed.handler = { handle: this.onError.bind(this) };
	}

	// -------------------------------------------------------------------------
    // REDUNDANT METHOD (REMOVE)
    // The `sortByDate` method is unused/replaced by `sortItems`.
    //
    // /**
    //  * @method sortByDate
    //  * @description Sort items in ascending date order.
    //  * @note Replaced by sortItems.
    //  * @param {Object} data - Contains items to sort by date.
    //  * @returns {void}
    //  */
    // sortByDate(data) {
    //     data.items.sort(sortByKey('date'));
    // }
    // -------------------------------------------------------------------------

	/**
     * @method sortItems
     * @description Sorts the `items` array in `feedData` by the `date` property in ascending order.
     * Invalid dates are robustly handled by moving them to the end of the array.
     *
     * @param {FeedDataWrapper} feedData - An object containing the array of items to sort.
     * @returns {FeedDataWrapper} The input object with its `items` array sorted by date.
     */
	sortItems(feedData) {

		feedData.items.sort((a, b) => {

			const dateA = new Date(a.date);
			const dateB = new Date(b.date);
	
			// Move invalid dates to the end
			if (isNaN(dateA) || isNaN(dateB)) return isNaN(dateA) ? 1 : -1;

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
     * @description Identifies new items by checking which fetched items don't already exist in the feed's history.
     * The results are stored in the `newItems` property of the `data` object.
     *
     * @param {FeedDataWrapper} data - Contains items from the latest fetch.
     * @returns {void}
     */
	filterNewItems(data) {
		// Use the Feed instance's `findItem` method to check history.
        data.newItems = data.items.filter(item => !this.feed.findItem(item));		
	}

	/**
     * @method addItemsToFeed
     * @description Adds identified new items to the feed's history and emits them via the emitter.
     * Emission is skipped during the first load if `skipFirstLoad` is enabled on the emitter.
     *
     * @param {FeedDataWrapper} data - Contains the `newItems` array to process.
     * @param {boolean} firstLoad - Flag indicating whether this is the initial load for the feed.
     * @returns {void}
     */
	addItemsToFeed(data, firstLoad) {

		data.newItems.forEach(item => {

			// Add item to the feed's history.
			this.feed.addItem(item);
			
			// Check if the item should be emitted (skip emission on first load if configured).
			// if (!firstLoad || !this.instance.skipFirstLoad) {
			// 	item.category = this.feed.category
			// 	item.website = this.feed.id
			// 	item.date = Date.now(); // rewrite date
			// 	this.instance.emit(this.feed.eventName, item); // Emit 'new-item' event for each new item
			// }

			// Check if the item should be emitted (skip emission on first load if configured).
            if (!firstLoad || !this.instance.skipFirstLoad) {

                // Ensure the item object is complete before emitting to the aggregator.
                // NOTE: category and website ID are already attached to the item
                // in the `Feed.filterItems` method.
                // Rewriting the date to 'now' is potentially destructive.
                // Use the original publication date. 
				// It is kept here to match the original intent
                item.date = Date.now(); // Retain original intent to set date to processing time

                // Emit the new item event.
                this.instance.emit(this.feed.eventName, item);
            }

		});
	}

	/**
     * @method onError
     * @description Handles errors originating from the associated Feed instance by emitting them
     * to the parent FeedEmitter instance. This is the implementation for `this.feed.handler`.
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
     * This method orchestrates the core fetching and filtering workflow.
     *
     * @async
     * @param {boolean} [firstLoad=false] - Whether this is the first load of the feed since startup.
     * @returns {Promise<void>}
     */
	async getContent(firstLoad = false) {

		try {
			// Fetch items from the source.
			const items = await this.feed.fetchData();

			// Guard clause: stop processing if no valid items are returned.
            if (!items || !Array.isArray(items) || items.length === 0) return;

			// Wrap the items and URL for processing.
            const data = { items, url: this.feed.url };

			// Update history length and process items.
			this.feed.updateHxLength(items);
			this.sortItems(data);
			this.filterNewItems(data);
			this.addItemsToFeed(data, firstLoad);

			// Emit special event if it was an initial load and we didn't skip it.
            if (firstLoad && !this.instance.skipFirstLoad) {
                this.instance.emit(`initial-load:${this.feed.url}`, { url: this.feed.url, items: this.feed.items });
            }

		} catch (error) {
			// Catch errors from the feed processing itself and pass them to the handler.
            // Errors from `this.feed.fetchData()` are primarily caught inside `fetchData`
            // and routed through `this.onError`, but this catches other sync/async issues.
			this.onError(error);
		}
	}
}

export default FeedManager;