/**
 *  @module db.feed
 *  @description This module contains low-level methods to interact with the `rss_sites` table in the database.
 * 				It serves as the Data Access Object (DAO) for feed configuration data.
 *
	`id`			smallint(5) unsigned NOT NULL AUTO_INCREMENT COMMENT 'Website ID',
	`name`			varchar(64) NOT NULL COMMENT 'Custom website name',
	`url`			varchar(128) NOT NULL COMMENT 'RSS Source - UniQ URL',
	`category`		tinyint(3) unsigned NOT NULL COMMENT 'Website category',
	`refresh`		int(11) NOT NULL COMMENT 'Time in ms',
	`created_at`	datetime NOT NULL DEFAULT current_timestamp(),
*/

/**
 * @imports Database service functions for executing SQL queries.
 * @description Provides access to `query` for SELECT operations and 
 * 				`execute` for INSERT, UPDATE, DELETE, and other statements.
 */
import { query, execute } from '../services/database.js';

/**
 * @function insert
 * @description Inserts a new feed configuration into the database.
 * 
 * @param {Object} feedConfig - The configuration object.
 * @returns {Promise<number>} The ID of the newly inserted row (`rss_sites.id`).
 */
async function insert(feedConfig) {

	const sqlQuery = `
		INSERT INTO rss_sites (name, url, category, refresh) 
		VALUES (?, ?, ?, ?)
	`;

	const result = await execute(sqlQuery, [
		feedConfig.name, 
		feedConfig.url, 
		feedConfig.category, 
		feedConfig.refresh
	]);
	
	// Returns the insertId for the AUTO_INCREMENT column
	return result.insertId;
}

/**
 * @function update
 * @description Updates an existing feed configuration identified by its database ID.
 * 
 * @param {Object} feedConfig - The configuration object, must include `id`.
 * @returns {Promise<number>} The number of affected rows (should be 1).
 */
async function update(feedConfig) {

	// NOTE: Refined to use the primary key `id` for more reliable and efficient updates.
	const sqlQuery = `
		UPDATE rss_sites SET name = ?, category = ?, refresh = ? 
		WHERE url = ?
	`;
   
	const [result] = await execute(sqlQuery, [
		feedConfig.name, 
		feedConfig.url,
		feedConfig.category, 
		feedConfig.refresh,
		feedConfig.id
	]);

	return result.affectedRows;
}

/**
 * @function get
 * @description Retrieves all active feed entries (RSS site configurations) from the `rss_sites` table.
 * 
 * @returns {Promise<Object[]>} A promise that resolves to an array of feed objects.
 */
async function get() {

	// SQL query to select the essential columns from the rss_sites table.
	const sqlQuery = `SELECT id, name, url, category, refresh FROM rss_sites`;

	// Execute the query to fetch the rows.
	const rows = await query(sqlQuery);

	// Return the fetched rows or an empty array.
	return rows.length ? rows : []; 
}

/**
 * @function getByUrl
 * @description Retrieves a single feed entry based on its unique URL.
 * 
 * @param {string} url - The URL of the feed site.
 * @returns {Promise<Object|null>} A promise that resolves to the feed object or null if not found.
 */
async function getByUrl(url) {

	const sqlQuery = `SELECT id, name, url, category, refresh FROM rss_sites WHERE url = ?`;
	
	const rows = await query(sqlQuery, [url]);
	
	return rows[0] || null;
}

/**
 * @function removeByUrl
 * @description Deletes a feed configuration from the database by its URL.
 * 
 * @param {string} url - The URL of the feed to remove.
 * @returns {Promise<number>} The number of affected rows.
 */
async function removeByUrl(url) {

	const sqlQuery = `DELETE FROM rss_sites WHERE url = ?`;
	
	const result = await execute(sqlQuery, [url]);
	
	return result.affectedRows;
}

export {
	insert,
	update,
	get,
	getByUrl,
	removeByUrl
}