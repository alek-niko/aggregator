/**
 * @module service.feed
 * @description Provides the core business logic interface for managing 
 *				RSS feed configurations in the database, used by FeedEmitter.
 * 				It abstracts the FeedEmitter from direct database interaction.
 */

import * as dbFeed from '../models/feed.js';
import FeedError from '../rss/FeedError.js';

/**
 * @class FeedService
 * @description Manages database interactions for feed configuration (rss_sites).
 * 				All public methods wrap database calls in robust error handling.
 */
class FeedService {

	/**
	 * @method getAll
	 * @description Retrieves all active feed configurations from the database.
	 * 
	 * @returns {Promise<Object[]>} A promise that resolves to an array of feed configuration objects.
	 * @throws {FeedError} If the database query fails.
	 */
	async getAll() {
		try {
			// Delegates the raw database query to the model layer.
			return await dbFeed.get();
		} catch (error) {
			// Wraps the native DB error in a FeedError for consistent application-wide handling.
			throw new FeedError('DB Error: Failed to fetch all feed configurations.', 'db_error', null, null, error);
		}
	}

	/**
	 * @method addOrUpdate
	 * @description Inserts a new feed or updates an existing one based on the URL (upsert logic).
	 * 
	 * @param {Object} config - The feed configuration object. Must contain `url`.
	 * @returns {Promise<Object>} The final, saved feed configuration object (including the database ID).
	 * @throws {FeedError} If validation fails or the database query fails.
	 */
	async addOrUpdate(config) {

		if (!config.url) {
			throw new FeedError('Feed URL is required for addOrUpdate.', 'validation_error');
		}

		try {

			// Check if the feed already exists by URL.
			const existingFeed = await dbFeed.getByUrl(config.url);

			if (existingFeed) {
				// UPDATE: If it exists, update the record.
				// We ensure the ID is included in the config object for the model update.
				const updatedConfig = { ...config, id: existingFeed.id };
				await dbFeed.update(updatedConfig);
				
				// Return the updated config object with the existing ID.
				return updatedConfig;

			} else {
				// INSERT: If it does not exist, create a new record.
				const newId = await dbFeed.insert(config);
				
				// Return the new config object with the generated ID.
				return { ...config, id: newId };
			}

		} catch (error) {
			// Wrap the error with context about the failing URL/ID.
			throw new FeedError(
				`DB Error: Failed to save/update feed: ${config.url}`, 
				'db_error', 
				config.url, 
				config.id, 
				error
			);
		}
	}

	/**
	 * @method remove
	 * @description Deletes a feed configuration from the database by its URL.
	 * 
	 * @param {string} url - The URL of the feed to remove.
	 * @returns {Promise<number>} The number of affected rows (should be 1 on success).
	 * @throws {FeedError} If the database query fails.
	 */
	async remove(url) {
		try {
			// Delegates the deletion query to the model layer.
			return await dbFeed.removeByUrl(url);
		} catch (error) {
			throw new FeedError(`DB Error: Failed to remove feed: ${url}`, 'db_error', url, null, error);
		}
	}
}

export default FeedService;