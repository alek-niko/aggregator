/**
 * @module service.item
 * @description Provides the core business logic interface for managing 
 * 				RSS news items (history) in the database, used by Feed.js.
 * 				It encapsulates the low-level database operations from the application logic.
 */

import * as ItemModel from '../models/item.js';
import FeedError from '../rss/FeedError.js';

/**
 * @class ItemService
 * @description Manages database interactions for feed items (rss_news).
 * 				All public methods ensure proper error wrapping using FeedError.
 */
class ItemService {

	/**
	 * @method addBulkInsertIgnore
	 * @description Public interface for the atomic bulk insertion logic.
	 * 
	 * @param {Array<Array>} bulkValues 
	 * @returns {Promise<void>}
	 */
	async addBulkInsertIgnore(bulkValues) {
		await ItemModel.bulkInsertIgnore(bulkValues);
	}

	/**
	 * @method getInsertedItemsByUrlAndDate
	 * @description Public interface for retrieving new items after a bulk insert.
	 * 
	 * @returns {Promise<Object[]>}
	 */
	async getInsertedItemsByUrlAndDate(websiteId, urls, startTime) {
		return await ItemModel.getInsertedItemsByUrlAndDate(websiteId, urls, startTime);
	}

	/**
	 * @method exists
	 * @description Checks if a news item exists in the history (database) based on 
	 * 				the feed ID, URL, or Title. This is crucial for filtering new items.
	 * 
	 * @param {number} feedId - The website/feed ID (`rss_sites.id`).
	 * @param {string} url - The URL of the item.
	 * @param {string} title - The title of the item.
	 * @returns {Promise<boolean>} True if the item exists, false otherwise.
	 * @throws {FeedError} If the database query fails.
	 */
	async exists(feedId, url, title) {

		try {
			// Delegates the check to the model layer.
			return await ItemModel.existsByUrlOrTitle(feedId, url, title);

		} catch (error) {
			// Wraps the native DB error for consistent error handling.
			throw new FeedError(
				`DB Error: Failed to check item history for feed ID ${feedId}.`,
				'db_error',
				url,
				feedId,
				error
			);
		}
	}

	/**
	 * @method insert
	 * @description Inserts a new standardized news item into the database.
	 * @depricated This function is deprecated. Use this.addBulkInsertIgnore() instead
	 * 
	 * @param {Object} item - The standardized item object containing title, url, date, category, and website (feedId).
	 * @returns {Promise<number|null>} The inserted item's unique ID (`rss_news.id`) or null on failure.
	 * @throws {FeedError} If the database insertion fails (e.g., due to constraint violation or invalid data).
	 */
	async insert(item) {

		try {
			// Delegates the save operation to the model layer.
			const newId = await ItemModel.save(item);

			if (!newId) {
				// This warning is useful if the model silently fails (e.g., affectedRows=0 on an upsert).
				console.warn(`Item insertion failed to return ID (no rows affected): ${item.url}`);
			}

			return newId;

		} catch (error) {
			// CATCH: If the database throws a UNIQUE CONSTRAINT error (code 1062 / ER_DUP_ENTRY)
			if (error && (error.code === 'ER_DUP_ENTRY' || error.errno === 1062)) {
				// SUCCESSFUL FAILURE: The item exists due to the UNIQUE constraint.
				// The constraint is the most reliable "existence check."
				// console.warn(`[ItemService] Duplicate item blocked by DB constraint: ${item.url}`);

				return null; // Return null to signal no new item was saved.
			}

			// Re-throw if it's a genuine database error (e.g., schema, connection, etc.)
			throw new FeedError(
				`DB Error: Failed to insert item: ${item.url}`,
				'db_error',
				item.url,
				item.website,
				error
			);

		}
	}

}

export default ItemService;