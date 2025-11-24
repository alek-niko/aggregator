-- database.sql
-- Complete schema for the 'aggregator' database
-- Includes all tables, foreign keys, indexes, and proper constraints

CREATE DATABASE IF NOT EXISTS `aggregator` 
  CHARACTER SET utf8mb4 
  COLLATE utf8mb4_unicode_ci;

USE `aggregator`;

-- ========================================
-- Table: rss_categories
-- ========================================
CREATE TABLE `rss_categories` (
  `id`          TINYINT(3) UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(64)         NOT NULL,
  `title`       VARCHAR(64)         NOT NULL,
  `description` VARCHAR(255)        DEFAULT NULL,
  `slug`        VARCHAR(64)         NOT NULL,
  `parent`      TINYINT(3) UNSIGNED DEFAULT NULL,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_slug` (`slug`),
  KEY `idx_parent` (`parent`),
  
  -- Self-referencing FK: parent category must exist
  CONSTRAINT `fk_categories_parent` 
	FOREIGN KEY (`parent`) 
	REFERENCES `rss_categories` (`id`) 
	ON DELETE SET NULL 
	ON UPDATE CASCADE
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci 
COMMENT='News categories with hierarchical support';

-- ========================================
-- Table: rss_sites
-- ========================================
CREATE TABLE `rss_sites` (
  `id`         SMALLINT(5) UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'SiteId',
  `name`       VARCHAR(64)          NOT NULL COMMENT 'Name',
  `url`        VARCHAR(128)         NOT NULL COMMENT 'RSS Source - UniQ',
  `category`   TINYINT(3) UNSIGNED  NOT NULL COMMENT 'Wire_cats',
  `refresh`    INT(11)              NOT NULL DEFAULT 3600000 COMMENT 'Time ms',
  `created_at` DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_url` (`url`),
  KEY `idx_category` (`category`),
  KEY `idx_refresh` (`refresh`),
  
  -- FK: category must exist in rss_categories
  CONSTRAINT `fk_sites_category` 
	FOREIGN KEY (`category`) 
	REFERENCES `rss_categories` (`id`) 
	ON DELETE RESTRICT 
	ON UPDATE CASCADE
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci 
COMMENT='RSS feed sources configuration';

-- ========================================
-- Table: rss_news
-- ========================================
CREATE TABLE `rss_news` (
  `id`       BIGINT(8) UNSIGNED   NOT NULL AUTO_INCREMENT COMMENT 'News ID',
  `title`    VARCHAR(255)         NOT NULL,
  `url`      VARCHAR(255)         DEFAULT NULL,
  `category` TINYINT(3) UNSIGNED  NOT NULL COMMENT 'News Categories',
  `website`  SMALLINT(5) UNSIGNED NOT NULL COMMENT 'News Website',
  `date`     DATETIME             NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),

  -- NEW: Compound Unique Key to prevent duplicate news items from the same website
  CONSTRAINT `uq_website_url` UNIQUE KEY (`website`, `url`),
  
  -- The original unique index on url is redundant now and has been removed, 
  -- but a simple index on url for quick lookup may be kept if desired:
  -- KEY `idx_url` (`url`),
  -- UNIQUE KEY `uq_url` (`url`),

  -- READ PERFORMANCE: Speeds up history lookups (SELECT) on the URL column.
  -- KEY `idx_url` (`url`),
  
  KEY `idx_category` (`category`),
  KEY `idx_website` (`website`),
  KEY `idx_date` (`date`),
  
  -- FK: category must exist
  CONSTRAINT `fk_news_category` 
	FOREIGN KEY (`category`) 
	REFERENCES `rss_categories` (`id`) 
	ON DELETE RESTRICT 
	ON UPDATE CASCADE,
	
  -- FK: website must refer to a valid rss_sites entry
  CONSTRAINT `fk_news_website` 
	FOREIGN KEY (`website`) 
	REFERENCES `rss_sites` (`id`) 
	ON DELETE RESTRICT 
	ON UPDATE CASCADE
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci 
COMMENT='Aggregated news items from RSS feeds';

-- ========================================
-- Table: rss_errors
-- ========================================
CREATE TABLE `rss_errors` (
  `id`       BIGINT(8)           NOT NULL AUTO_INCREMENT,
  `type`     VARCHAR(255)        DEFAULT NULL,
  `feed_Id`  BIGINT(8)           DEFAULT NULL COMMENT 'References rss_sites.id or rss_news.id depending on context',
  `message`  VARCHAR(255)        DEFAULT NULL,
  `date`     DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  KEY `idx_feed_id` (`feed_Id`),
  KEY `idx_date` (`date`),
  KEY `idx_type` (`type`)
  -- Note: feed_Id is intentionally not a strict FK to allow flexibility
  -- (can point to rss_sites or rss_news depending on error context)
) 
ENGINE=InnoDB 
DEFAULT CHARSET=utf8mb4 
COLLATE=utf8mb4_unicode_ci 
COMMENT='Error log for feed processing failures';

-- ========================================
-- EVENTS
-- Ensure the event scheduler is enabled when this script runs, if necessary
-- SET GLOBAL event_scheduler = ON; 
-- ========================================

-- CREATE EVENT daily_rss_cleanup
-- ON SCHEDULE EVERY 1 DAY
-- STARTS CURRENT_TIMESTAMP
-- DO DELETE FROM rss_news WHERE date < DATE_SUB(CURDATE(), INTERVAL 1 DAY);

-- ========================================
-- Optional: Insert default category (e.g., "Uncategorized")
-- ========================================
INSERT INTO `rss_categories` (`name`, `title`, `slug`) 
VALUES ('uncategorized', 'Uncategorized', 'uncategorized')
ON DUPLICATE KEY UPDATE `title` = VALUES(`title`);