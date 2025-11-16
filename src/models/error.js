/**
 * @module db.error
 * @description This module contains methods for logging errors related to RSS processing
 *
	`id`			bigint(8) NOT NULL AUTO_INCREMENT,
	`type`			varchar(255) DEFAULT NULL,
	`feed_Id`		bigint(8) DEFAULT NULL,
	`message`		varchar(255) DEFAULT NULL,
	`date`			datetime NOT NULL DEFAULT current_timestamp(),
*/

/**
 * @imports Database service functions for executing SQL queries.
 * @description Provides access to `query` for SELECT operations and 
 * 				`execute` for INSERT, UPDATE, DELETE, and other statements.
 */
import { query, execute } from '../../services/db/database.service.js';


/**
 * @function log
 * @description Inserts a new error record into the `rss_errors` table.
 *
 * @param {Object} data - The error data to be logged.
 * @param {string} data.type - The type or name of the error (e.g., 'Timeout', 'InvalidXML').
 * @param {number|null} [data.feed_Id=null] - The ID of the feed site (`rss_sites.id`) associated with the error. Optional.
 * @param {string} data.message - The detailed error message or stack trace string.
 * @returns {Promise<number|null>} A promise that resolves to the **inserted row's ID** if successful,
 * or **null** if the insertion failed or if required data was missing.
 */
async function log(data) {
	
	// Validate if essential data is present. The original logic was inverted.
    // We require 'type' and 'message' to log a meaningful error.
    if (!data || !data.type || !data.message) {
        // Return null if critical information is missing.
        return null;
    }

	// Destructure properties, mapping the function's 'type' parameter to the column 'type'
    // and ensuring the column name `feed_Id` matches the database schema.
	const {
		type,
		feedId = null,
		message
	} = data;

	// The SQL query for inserting a new row into the rss_news table.
	const sqlQuery = `
		INSERT INTO rss_errors (type, feed_id, message)
		VALUES (?,?,?)
	`;

	// Array of parameters for the prepared statement.
    const params = [type, feed_Id, message];

	// Execute the insertion query. The result is typically an array containing the execution result object.
	const [result] = await execute(sqlQuery, params);

	try {
        // Execute the insertion query.
		// The result is typically an array containing the execution result object.
        const [result] = await execute(sqlQuery, params);

        // Check if a row was affected (inserted). 
		// Return the insertId if successful, otherwise return null.
        return result.affectedRows ? result.insertId : null;

    } catch (error) {
        // Log the database execution error itself, then return null to indicate failure.
        console.error(`DB Error: Failed to insert error log into rss_errors: ${error.message}`);
        return null;
    }
}

export {
	log
}