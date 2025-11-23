/**
 * @module service.item
 * @description Provides the core business logic interface for managing 
 * 				RSS news items (history) in the database, used by Feed.js.
 * 				It encapsulates the low-level database operations from the application logic.
 */

import * as dbItem from '../models/item.js';
import FeedError from '../rss/FeedError.js';

/**
 * @class ItemService
 * @description Manages database interactions for feed items (rss_news).
 * 				All public methods ensure proper error wrapping using FeedError.
 */
class ItemService {

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
			return await dbItem.existsByUrlOrTitle(feedId, url, title);
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
	 * 
	 * @param {Object} item - The standardized item object containing title, url, date, category, and website (feedId).
	 * @returns {Promise<number|null>} The inserted item's unique ID (`rss_news.id`) or null on failure.
	 * @throws {FeedError} If the database insertion fails (e.g., due to constraint violation or invalid data).
	 */
	async insert(item) {
		try {
			// Delegates the save operation to the model layer.
			const newId = await dbItem.save(item);
			
			if (!newId) {
				// This warning is useful if the model silently fails (e.g., affectedRows=0 on an upsert).
				console.warn(`Item insertion failed to return ID (no rows affected): ${item.url}`);
			}

			return newId;

		} catch (error) {
			// Wraps the insertion error with context.
			throw new FeedError(
				`DB Error: Failed to insert item: ${item.url}`, 
				'db_error', 
				item.url, 
				item.website, 
				error
			)
		}
	}
}

export default ItemService;