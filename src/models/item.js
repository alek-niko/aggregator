/**
 *  @module db.items
 *  @description This module contains methods to interact with the `rss_news` table in the database
 *
	`id`			bigint(8) unsigned NOT NULL AUTO_INCREMENT COMMENT 'newsId',
	`title`			varchar(255) NOT NULL,
	`url`			varchar(255) DEFAULT NULL,
	`category`		tinyint(3) unsigned NOT NULL COMMENT 'rss_cats',
	`website`		smallint(5) unsigned NOT NULL COMMENT 'rss sites',
	`date`			datetime NOT NULL DEFAULT current_timestamp(),
*/

/**
 * @imports Database service functions for executing SQL queries.
 * @description Provides access to `query` for SELECT operations and 
 * 				`execute` for INSERT, UPDATE, DELETE, and other statements.
 */
import { query, execute } from '../../services/db/database.service.js';

/**
 * @function save
 * @description Inserts a new news item record into the `rss_news` table.
 *
 * @param {Object} item - The news item data to be saved.
 * @param {string} item.title - The title of the news item.
 * @param {string} item.url - The URL/link to the full article.
 * @param {number} item.category - The category ID (must correspond to an ID in `rss_cats`).
 * @param {number} item.website - The website/feed ID (must correspond to an ID in `rss_sites`).
 * @returns {Promise<number|null>} A promise that resolves to the **inserted row's ID** if successful,
 * or **null** if the insertion failed (e.g., affectedRows is 0).
 */
async function save(item) {

	// Destructure the required properties from the input item object.
	const {
		title,
		url,
		category,
		website,
	} = item;

	// The SQL query for inserting a new row into the rss_news table.
	const sqlQuery = `
		INSERT INTO rss_news (title, url, category, website)
		VALUES (?,?,?,?)
	`;

	// Array of parameters corresponding to the placeholders in the SQL query.
	const params = [title, url, category, website];

	// Execute the insertion query. The result is typically an array containing the execution result object.
	const [result] = await execute(sqlQuery, params);

	// Check if a row was affected (inserted). 
	// Return the insertId if successful, otherwise return null.
	return result.affectedRows ? result.insertId : null;
}

export {
	save
}