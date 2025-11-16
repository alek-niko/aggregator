/**
 *  @module db.feed
 *  @description This module contains methods to interact with the `rss_site` table in the database
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
import { query, execute } from '../../services/db/database.service.js';

/**
 * @function get
 * @description Retrieves all active feed entries (RSS site configurations) from the `rss_sites` table.
 * 
 * @returns {Promise<Object[]>} A promise that resolves to an array of feed objects.
 * Each object contains: `id`, `name`, `url`, `category`, and `refresh`.
 */
async function get() {

	// SQL query to select the essential columns from the rss_sites table.
	const sqlQuery = `SELECT id, name, url, category, refresh FROM rss_sites`;

	// Execute the query to fetch the rows.
	const rows = await query(sqlQuery);

	// Return the fetched rows if any; 
	// otherwise, return an empty array for consistent type handling
	return rows.length ? rows : []; 
}

export {
	get
}