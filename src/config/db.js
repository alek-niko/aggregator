/**
 * @module config.db
 * @description Creates and manages a MySQL connection pool using `mysql2/promise`.
 *
 * This module provides:
 * - A pool of reusable connections to efficiently handle multiple concurrent queries.
 * - Named placeholders and multiple statements support for flexibility in SQL queries.
 * - Automatic error handling and startup connection check.
 * 
 */

import mysql from 'mysql2/promise';

/**
 * MySQL connection pool configuration
 */
const pool = mysql.createPool({
	connectionLimit: 10, 				// Maximum concurrent connections
	host: process.env.DB_HOST, 			// Database host
	user: process.env.DB_USER, 			// Database username
	password: process.env.DB_PASSWORD,	// Database password
	database: process.env.DB_DATABASE,	// Database name
	dateStrings: true, 					// Converts MySQL date fields to strings to avoid JS date conversion
	multipleStatements: true,			// Allows executing multiple SQL statements in one query
	namedPlaceholders: true,			// Enables named placeholders (:param) in SQL statements
	waitForConnections: true,			// Queue connection requests when pool is at connection limit
	queueLimit: 0						// Disables queue limit, allowing unlimited queued connections
});


/**
 * Checks the database connection on startup
 * 
 * This function acquires a connection from the pool and immediately releases it.
 * Logs descriptive messages on success or failure.
 * 
 * @async
 * @function checkDatabaseConnection
 * @returns {Promise<void>}
 */
async function checkDatabaseConnection() {

	try {

		const connection = await pool.getConnection();		// Acquires a connection from the pool
		connection.release();								// Releases the connection back to the pool
		
		console.log(`[Database] Connection established successfully to ${process.env.DB_HOST}:${process.env.DB_PORT}`);
	
	} catch (err) {

		// Handle common MySQL connection errors

		switch (err.code) {
			case 'PROTOCOL_CONNECTION_LOST':
				console.error(`[Database] Connection to ${process.env.DB_HOST}:${process.env.DB_DATABASE} was closed.`);
				break;
			case 'ER_CON_COUNT_ERROR':
				console.error(`[Database] Too many connections to ${process.env.DB_HOST}:${process.env.DB_DATABASE}.`);
				break;
			case 'ECONNREFUSED':
				console.error(`[Database] Connection to ${process.env.DB_HOST}:${process.env.DB_DATABASE} was refused.`);
				break;
			default:
				console.error(`[Database] Error connecting to ${process.env.DB_HOST}:${process.env.DB_DATABASE}: ${err.message}`);
		}
	}
}

// Verify the initial database connection once at server startup
checkDatabaseConnection();

export default pool;